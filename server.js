require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Favicon 처리
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
    console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 .env 파일에 설정해주세요.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase 클라이언트가 초기화되었습니다.');

// 좌표를 기준으로 장소를 그룹화하는 함수
// 같은 좌표(또는 매우 가까운 좌표)에 있는 장소들을 같은 장소로 취급
function getLocationKey(x, y, tolerance = 0.0001) {
    // 좌표를 tolerance 단위로 반올림하여 그룹화
    // tolerance = 0.0001도는 약 10미터 거리
    const roundedX = Math.round(x / tolerance) * tolerance;
    const roundedY = Math.round(y / tolerance) * tolerance;
    return `${roundedX.toFixed(6)},${roundedY.toFixed(6)}`;
}

// 모든 추천 장소 가져오기
app.get('/api/recommendations', async (req, res) => {
    try {
        // Supabase에서 모든 추천 데이터 가져오기
        const { data, error } = await supabase
            .from('recommendations')
            .select('place_name, address, x, y, reason')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('추천 데이터 조회 오류:', error.message);
            return res.status(500).json({ error: '데이터 조회 실패' });
        }

        // 좌표를 기준으로 장소별로 그룹화하여 reasons 배열 생성
        const recommendations = {};
        const locationGroups = {}; // 좌표별로 그룹화된 데이터
        
        if (data) {
            data.forEach(row => {
                const locationKey = getLocationKey(row.x, row.y);
                
                // 좌표별 그룹에 데이터 추가
                if (!locationGroups[locationKey]) {
                    locationGroups[locationKey] = {
                        placeNames: {}, // 장소명별 카운트
                        addresses: {}, // 주소별 카운트
                        x: row.x,
                        y: row.y,
                        reasons: []
                    };
                }
                
                // 가장 많이 사용된 장소명과 주소를 추적
                if (row.place_name) {
                    locationGroups[locationKey].placeNames[row.place_name] = 
                        (locationGroups[locationKey].placeNames[row.place_name] || 0) + 1;
                }
                if (row.address) {
                    locationGroups[locationKey].addresses[row.address] = 
                        (locationGroups[locationKey].addresses[row.address] || 0) + 1;
                }
                
                if (row.reason) {
                    locationGroups[locationKey].reasons.push(row.reason);
                }
            });
            
            // 각 좌표 그룹을 recommendations 객체로 변환
            Object.keys(locationGroups).forEach(locationKey => {
                const group = locationGroups[locationKey];
                
                // 가장 많이 사용된 장소명 선택
                const mostUsedPlaceName = Object.keys(group.placeNames).length > 0
                    ? Object.keys(group.placeNames).reduce((a, b) => 
                        group.placeNames[a] > group.placeNames[b] ? a : b)
                    : '알 수 없는 장소';
                
                // 가장 많이 사용된 주소 선택
                const mostUsedAddress = Object.keys(group.addresses).length > 0
                    ? Object.keys(group.addresses).reduce((a, b) => 
                        group.addresses[a] > group.addresses[b] ? a : b)
                    : '';
                
                // 좌표를 키로 사용하여 중복 방지 (같은 좌표는 하나의 장소로 취급)
                // 프론트엔드 호환성을 위해 장소명을 키로 사용하되, 좌표가 같으면 덮어쓰기
                const key = mostUsedPlaceName;
                
                // 같은 좌표 그룹이 이미 있으면 reasons만 합치기
                // (같은 장소명이지만 다른 좌표인 경우는 별도로 유지)
                if (recommendations[key]) {
                    const existingLocationKey = getLocationKey(recommendations[key].x, recommendations[key].y);
                    if (existingLocationKey === locationKey) {
                        // 같은 좌표이면 reasons 합치기
                        recommendations[key].reasons = recommendations[key].reasons.concat(group.reasons);
                    } else {
                        // 다른 좌표이면 새로운 항목으로 추가 (장소명 + 좌표로 고유 키 생성)
                        const uniqueKey = `${key}_${locationKey}`;
                        recommendations[uniqueKey] = {
                            placeName: mostUsedPlaceName,
                            address: mostUsedAddress,
                            x: group.x,
                            y: group.y,
                            reasons: group.reasons
                        };
                    }
                } else {
                    recommendations[key] = {
                        placeName: mostUsedPlaceName,
                        address: mostUsedAddress,
                        x: group.x,
                        y: group.y,
                        reasons: group.reasons
                    };
                }
            });
        }

        res.json(recommendations);
    } catch (error) {
        console.error('추천 데이터 조회 중 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 추천 추가
app.post('/api/recommendations', async (req, res) => {
    try {
        const { placeName, address, x, y, reason } = req.body;

        if (!placeName || !reason || !x || !y) {
            return res.status(400).json({ error: '필수 필드가 누락되었습니다.' });
        }

        // Supabase에 데이터 삽입
        const { data, error } = await supabase
            .from('recommendations')
            .insert({
                place_name: placeName,
                address: address || null,
                x: parseFloat(x),
                y: parseFloat(y),
                reason: reason
            })
            .select()
            .single();

        if (error) {
            console.error('추천 추가 오류:', error.message);
            return res.status(500).json({ error: '추천 추가 실패: ' + error.message });
        }

        res.json({ 
            success: true, 
            message: '추천이 등록되었습니다.',
            id: data.id 
        });
    } catch (error) {
        console.error('추천 추가 중 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// Vercel 서버리스 함수로 export
module.exports = app;

// 로컬 개발 환경에서만 서버 시작
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
        console.log(`📊 Supabase를 사용하여 데이터를 저장합니다.`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n서버를 종료합니다...');
        process.exit(0);
    });
}

