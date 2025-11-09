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

        // 장소별로 그룹화하여 reasons 배열 생성
        const recommendations = {};
        if (data) {
            data.forEach(row => {
                const key = row.place_name;
                if (!recommendations[key]) {
                    recommendations[key] = {
                        placeName: row.place_name,
                        address: row.address || '',
                        x: row.x,
                        y: row.y,
                        reasons: []
                    };
                }
                if (row.reason) {
                    recommendations[key].reasons.push(row.reason);
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

