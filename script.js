
// 전역 변수
let map;
let markers = [];
let recommendations = {}; // 장소별 추천 데이터 저장

// API 베이스 URL 설정
// 우선순위: window.API_BASE_URL (index.html에서 설정 가능한 값) -> 자동 감지된 값 -> 로컬 기본
const API_BASE_URL = (function() {
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
        return window.API_BASE_URL;
    }

    // 프로덕션 환경 (같은 도메인에서 API가 제공되는 경우)
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return `${window.location.origin}/api`;
    }

    // 로컬 개발 환경 기본값
    return 'http://localhost:3000/api';
})();

console.log('API Base URL:', API_BASE_URL, '(window.API_BASE_URL:', typeof window !== 'undefined' ? window.API_BASE_URL : 'undefined', ')');

// 카카오맵 API가 로드될 때까지 대기 (타임아웃 포함)
function waitForKakaoMap(callback, maxAttempts = 100) {
    let attempts = 0;
    
    function check() {
        attempts++;
        
        // 에러 발생 확인
        if (window.kakaoMapError) {
            console.error('카카오맵 스크립트 로드 실패');
            return;
        }
        
        if (attempts % 10 === 0) {
            console.log(`카카오맵 로딩 확인 중... (${attempts}/${maxAttempts})`);
        }
        
        if (typeof kakao !== 'undefined' && kakao.maps && kakao.maps.Map) {
            console.log('카카오맵 API가 로드되었습니다.');
            callback();
        } else if (attempts >= maxAttempts) {
            console.error('카카오맵 API 로딩 시간 초과');
            const container = document.getElementById('map');
            if (container && !container.querySelector('div[style*="color: #"]')) {
                container.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: #666; padding: 20px;">
                        <h2 style="margin-bottom: 10px;">지도를 불러올 수 없습니다</h2>
                        <p>카카오맵 API를 로드하는 중 오류가 발생했습니다.</p>
                        <p style="margin-top: 10px; font-size: 12px;">가능한 원인:</p>
                        <ul style="margin-top: 10px; font-size: 12px; text-align: left;">
                            <li>인터넷 연결 문제</li>
                            <li>카카오맵 API 키 문제</li>
                            <li>도메인 설정 문제 (localhost:3000이 등록되어 있는지 확인)</li>
                        </ul>
                        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">새로고침</button>
                    </div>
                `;
            }
        } else {
            setTimeout(check, 100);
        }
    }
    
    check();
}

// 지도 초기화
function initMap() {
    const container = document.getElementById('map');
    if (!container) {
        console.error('지도 컨테이너를 찾을 수 없습니다.');
        return;
    }

    // 컨테이너 크기 확인
    console.log('지도 컨테이너 크기:', container.offsetWidth, 'x', container.offsetHeight);
    
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('지도 컨테이너 크기가 0입니다. 잠시 후 다시 시도합니다.');
        setTimeout(() => initMap(), 500);
        return;
    }

    const options = {
        center: new kakao.maps.LatLng(37.5665, 126.9780), // 서울시청 좌표
        level: 5
    };
    
    try {
        if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.Map) {
            throw new Error('카카오맵 API가 로드되지 않았습니다.');
        }
        
        map = new kakao.maps.Map(container, options);
        console.log('지도가 초기화되었습니다.', map);
        
        // 지도가 제대로 생성되었는지 확인
        if (!map) {
            throw new Error('지도 객체 생성 실패');
        }
        
        // 저장된 추천 데이터 로드 (서버에서)
        loadRecommendations();
        
        // 폼 제출 이벤트
        const form = document.getElementById('recommendForm');
        if (form) {
            form.addEventListener('submit', handleRecommendSubmit);
        }
    } catch (error) {
        console.error('지도 초기화 오류:', error);
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: #666; padding: 20px;">
                <h2 style="margin-bottom: 10px; color: #e74c3c;">지도 초기화 오류</h2>
                <p style="margin-bottom: 10px;">${error.message}</p>
                <p style="margin-bottom: 20px;">카카오맵 API 키가 올바른지 확인해주세요.</p>
                <button onclick="location.reload()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">새로고침</button>
            </div>
        `;
    }
}

// 서버에서 추천 데이터 로드
async function loadRecommendations() {
    try {
        const response = await fetch(`${API_BASE_URL}/recommendations`);
        if (!response.ok) {
            throw new Error('데이터 로드 실패');
        }
        const data = await response.json();
        recommendations = data;
        updateRecommendationsDisplay();
        updateMarkers();
        console.log('추천 데이터를 불러왔습니다:', Object.keys(recommendations).length + '개 장소');
    } catch (error) {
        console.error('추천 데이터 로드 오류:', error);
        // 오류가 발생해도 계속 진행 (로컬 데이터가 있을 수 있음)
    }
}

// 추천 제출 처리
async function handleRecommendSubmit(e) {
    e.preventDefault();
    
    const placeName = document.getElementById('placeName').value.trim();
    const reason = document.getElementById('reason').value.trim();
    
    if (!placeName || !reason) {
        alert('장소명과 추천 사유를 모두 입력해주세요.');
        return;
    }
    
    // 로딩 표시
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton ? submitButton.textContent : '추천하기';
    if (submitButton) {
        submitButton.textContent = '추천 중...';
        submitButton.disabled = true;
    }

    try {
        // 장소 검색
        const ps = new kakao.maps.services.Places();
        ps.keywordSearch(placeName, async (data, status) => {
            // 버튼 상태 복원을 위한 함수
            const restoreButton = () => {
                if (submitButton) {
                    submitButton.textContent = originalText;
                    submitButton.disabled = false;
                }
            };

            try {
                // 검색 성공 및 결과가 있는 경우
                if (status === kakao.maps.services.Status.OK && data && data.length > 0) {
                    const place = data[0];

                    // 서버에 추천 저장
                    const response = await fetch(`${API_BASE_URL}/recommendations`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            placeName: placeName,
                            address: place.address_name || '',
                            x: parseFloat(place.x),
                            y: parseFloat(place.y),
                            reason: reason
                        })
                    });

                    if (!response.ok) {
                        // 서버가 보낸 자세한 오류 메시지를 로그에 출력
                        let bodyText = '';
                        try {
                            bodyText = await response.text();
                        } catch (e) {
                            bodyText = '<응답 본문을 읽는 중 오류 발생>';
                        }
                        console.error('추천 저장 실패. 상태:', response.status, '응답:', bodyText);
                        alert('⚠️ 추천 저장 중 서버 오류가 발생했습니다.\n개발자 콘솔을 확인하세요.');
                        restoreButton();
                        return;
                    }

                    // 성공 시 데이터 다시 로드
                    await loadRecommendations();

                    // 폼 초기화
                    document.getElementById('recommendForm').reset();
                    alert('✅ 추천이 등록되었습니다!');
                    restoreButton();
                } 
                // 검색 결과가 없는 경우
                else if (status === kakao.maps.services.Status.ZERO_RESULT) {
                    alert('⚠️ 검색 결과가 없습니다.\n\n입력하신 장소명을 다시 확인해주세요.\n다른 이름으로 검색해보시거나 정확한 주소를 입력해주세요.');
                    restoreButton();
                }
                // 검색 오류가 발생한 경우
                else if (status === kakao.maps.services.Status.ERROR) {
                    alert('⚠️ 장소 검색 중 오류가 발생했습니다.\n\n잠시 후 다시 시도해주세요.');
                    restoreButton();
                }
                // 기타 오류
                else {
                    console.error('장소 검색 실패:', { status, data });
                    alert('⚠️ 장소를 찾을 수 없습니다.\n\n입력하신 장소명을 다시 확인해주세요.\n다른 이름으로 검색해보시거나 정확한 주소를 입력해주세요.');
                    restoreButton();
                }
            } catch (error) {
                console.error('추천 저장 처리 중 오류:', error);
                alert('⚠️ 추천 저장 중 오류가 발생했습니다.\n\n개발자 콘솔을 확인하세요.');
                restoreButton();
            }
        });
    } catch (error) {
        console.error('장소 검색 오류:', error);
        alert('⚠️ 장소 검색 중 오류가 발생했습니다.\n\n잠시 후 다시 시도해주세요.');
        if (submitButton) {
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        }
    }
}

// 추천 현황 표시 업데이트
function updateRecommendationsDisplay() {
    const listContainer = document.getElementById('recommendationsList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const sortedPlaces = Object.values(recommendations).sort((a, b) => b.reasons.length - a.reasons.length);
    
    if (sortedPlaces.length === 0) {
        listContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">아직 추천된 장소가 없습니다.</p>';
        return;
    }
    
    sortedPlaces.forEach(place => {
        const item = document.createElement('div');
        item.className = 'recommendation-item';
        
        const isHighlighted = place.reasons.length >= 5;
        if (isHighlighted) {
            item.style.borderLeftColor = '#27ae60';
        }
        
        item.innerHTML = `
            <strong>${place.placeName}</strong>
            <div class="count">추천 ${place.reasons.length}개</div>
        `;
        
        listContainer.appendChild(item);
    });
}

// 마커 업데이트
function updateMarkers() {
    if (!map) {
        console.error('지도가 초기화되지 않았습니다.');
        return;
    }
    
    // 기존 마커 제거
    markers.forEach(marker => {
        if (marker.setMap) {
            marker.setMap(null);
        }
        if (marker.customOverlay && marker.customOverlay.setMap) {
            marker.customOverlay.setMap(null);
        }
    });
    markers = [];
    
    // 추천된 장소들에 대한 마커 표시
    Object.values(recommendations).forEach(place => {
        if (!place.x || !place.y) {
            console.warn('좌표가 없는 장소:', place.placeName);
            return;
        }
        
        try {
            const position = new kakao.maps.LatLng(parseFloat(place.y), parseFloat(place.x));
            const recommendationCount = place.reasons ? place.reasons.length : 0;
            
            // 마커 생성
            const marker = new kakao.maps.Marker({
                position: position,
                map: map
            });
            
            // 5개 미만 추천은 투명하게
            if (recommendationCount < 5) {
                marker.setOpacity(0.3);
            }
            
            // 마커 클릭 이벤트
            const overlay = createCustomOverlay(place);
            const customOverlay = new kakao.maps.CustomOverlay({
                position: position,
                content: overlay,
                yAnchor: 2.2,
                xAnchor: 0.5
            });
            
            customOverlay.setMap(null); // 처음에는 숨김
            
            kakao.maps.event.addListener(marker, 'click', function() {
                // 다른 오버레이 닫기
                markers.forEach(m => {
                    if (m.customOverlay && m.customOverlay.setMap) {
                        m.customOverlay.setMap(null);
                    }
                });
                
                // 현재 오버레이 토글
                if (customOverlay.getMap()) {
                    customOverlay.setMap(null);
                } else {
                    customOverlay.setMap(map);
                }
            });
            
            marker.customOverlay = customOverlay;
            markers.push(marker);
        } catch (error) {
            console.error('마커 생성 오류:', error, place);
        }
    });
    
    console.log('마커가 업데이트되었습니다:', markers.length + '개');
}

// 커스텀 오버레이 생성
function createCustomOverlay(place) {
    const div = document.createElement('div');
    div.className = 'custom-overlay';
    
    const recommendationCount = place.reasons ? place.reasons.length : 0;
    const isHighlighted = recommendationCount >= 5;
    
    let reasonsHtml = '';
    if (place.reasons && place.reasons.length > 0) {
        place.reasons.forEach((reason, index) => {
            reasonsHtml += `<div class="reason-item">${index + 1}. ${reason}</div>`;
        });
    }
    
    div.innerHTML = `
        <h3>${place.placeName}</h3>
        <div style="font-size: 12px; color: #999; margin-bottom: 10px;">
            ${place.address || '주소 없음'}
        </div>
        <div style="font-size: 13px; color: ${isHighlighted ? '#27ae60' : '#e67e22'}; font-weight: 600; margin-bottom: 10px;">
            추천 ${recommendationCount}개
        </div>
        <div class="reasons">
            <strong style="font-size: 13px;">추천 사유:</strong>
            ${reasonsHtml || '<div class="reason-item">사유 없음</div>'}
        </div>
    `;
    
    return div;
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM이 로드되었습니다.');
    
    // 카카오맵 API가 로드될 때까지 대기
    waitForKakaoMap(function() {
        console.log('카카오맵 API 초기화 시작');
        // 약간의 지연을 두고 초기화 (렌더링 완료 보장)
        setTimeout(() => {
            initMap();
        }, 200);
    });
    // 사이드바 접기/펼치기
    const toggleButton = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    if (toggleButton && sidebar) {
        toggleButton.onclick = function() {
            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                toggleButton.textContent = '⮜ 접기';
            } else {
                sidebar.classList.add('collapsed');
                toggleButton.textContent = '⮞ 펼치기';
            }
            // 지도 크기 재조정
            if (map) {
                setTimeout(() => {
                    kakao.maps.event.trigger(map, 'resize');
                }, 100);
            }
        };
    }
});

// window.onload도 사용 (모든 리소스 로드 후)
window.addEventListener('load', function() {
    console.log('모든 리소스가 로드되었습니다.');
});

// 주기적으로 추천 데이터 새로고침 (30초마다)
setInterval(function() {
    if (map) {
        loadRecommendations();
    }
}, 30000);
