// 기존 SQLite 데이터를 Supabase로 마이그레이션하는 스크립트
// 사용법: node migrate-to-supabase.js

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 환경 변수가 설정되지 않았습니다.');
    console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 .env 파일에 설정해주세요.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SQLite 데이터베이스 경로
const dbPath = path.join(__dirname, 'recommendations.db');

if (!fs.existsSync(dbPath)) {
    console.error('❌ SQLite 데이터베이스 파일을 찾을 수 없습니다:', dbPath);
    process.exit(1);
}

// SQLite 데이터베이스 연결
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ SQLite 데이터베이스 연결 오류:', err.message);
        process.exit(1);
    }
    console.log('✅ SQLite 데이터베이스에 연결되었습니다.');
});

// 데이터 마이그레이션
async function migrateData() {
    try {
        console.log('\n📊 SQLite에서 데이터를 읽는 중...');
        
        // SQLite에서 모든 데이터 가져오기
        db.all('SELECT * FROM recommendations ORDER BY id', async (err, rows) => {
            if (err) {
                console.error('❌ 데이터 조회 오류:', err.message);
                db.close();
                process.exit(1);
            }

            if (rows.length === 0) {
                console.log('⚠️  마이그레이션할 데이터가 없습니다.');
                db.close();
                process.exit(0);
            }

            console.log(`✅ ${rows.length}개의 레코드를 찾았습니다.`);

            // Supabase에 데이터 삽입
            console.log('\n📤 Supabase로 데이터를 전송하는 중...');
            
            let successCount = 0;
            let errorCount = 0;

            for (const row of rows) {
                try {
                    const { data, error } = await supabase
                        .from('recommendations')
                        .insert({
                            place_name: row.place_name,
                            address: row.address || null,
                            x: row.x,
                            y: row.y,
                            reason: row.reason,
                            created_at: row.created_at || new Date().toISOString()
                        });

                    if (error) {
                        console.error(`❌ 레코드 ${row.id} 삽입 실패:`, error.message);
                        errorCount++;
                    } else {
                        successCount++;
                        if (successCount % 10 === 0) {
                            process.stdout.write(`\r진행 중... ${successCount}/${rows.length}`);
                        }
                    }
                } catch (error) {
                    console.error(`❌ 레코드 ${row.id} 처리 중 오류:`, error.message);
                    errorCount++;
                }
            }

            console.log('\n\n✅ 마이그레이션 완료!');
            console.log(`   성공: ${successCount}개`);
            console.log(`   실패: ${errorCount}개`);
            console.log(`   총: ${rows.length}개`);

            db.close();
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ 마이그레이션 중 오류:', error);
        db.close();
        process.exit(1);
    }
}

// 마이그레이션 시작
migrateData();

