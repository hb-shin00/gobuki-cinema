// Lucky Seat 설정
// 상품, 라운드 순서, 좌석 규칙, Firebase 연결 정보를 여기서만 바꾸면 돼요.

window.LS_CONFIG = {
  // Firebase 연결 정보. null이면 테스트 모드(이 브라우저 안에서만 동작)로 실행돼요.
  // Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정의 firebaseConfig 값을 붙여넣으세요.
  firebase: {
    apiKey: 'AIzaSyBgZeJ8NOdzDRMGt-z5KW6lTdGhD8Khf8s',
    authDomain: 'lucky-seat-a9c2e.firebaseapp.com',
    databaseURL: 'https://lucky-seat-a9c2e-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'lucky-seat-a9c2e',
    storageBucket: 'lucky-seat-a9c2e.firebasestorage.app',
    messagingSenderId: '762132662012',
    appId: '1:762132662012:web:5cfc57f2548688aa36f979',
  },

  // 긁기 감도: 숫자만 바꿔서 조절해요
  scratch: {
    brushSize: 48,       // 붓 지름(px). 작을수록 여러 번 문질러야 해요
    textReveal: 0.8,     // 결과 글자(당첨/꽝) 주변이 이 비율 넘게 긁히면 열려요
    areaReveal: 0.5,     // 결과 칸 전체가 이 비율 넘게 긁히면 열려요
    revealDelay: 500,    // 기준을 넘은 뒤 덮개가 사라지기 시작할 때까지 기다리는 시간(ms)
    fadeDuration: 600,   // 덮개가 사라지는 시간(ms). 이게 끝나면 하단 문구가 바뀌어요
  },

  // 사회자 화면(host-45168113.html) 비밀번호
  adminPin: '4734',

  // 좌석 배치: CGV 왕십리 1관 (좌석정보.png 기준, 총 106석)
  // 열마다 [시작, 끝] 번호 구간. 구간 사이가 비어 있으면 그 번호는 없는 좌석이에요.
  seats: {
    A: [[1, 16]],
    B: [[1, 16]],
    C: [[1, 16]],
    D: [[1, 11], [13, 15]], // D12 없음
    E: [[1, 15]],
    F: [[1, 16]],
    G: [[1, 6], [8, 10], [13, 16]], // G7, G11, G12 없음
  },

  // 상품 목록 (등수 순)
  // name: 긁기 화면·축하 팝업·사회자 화면에 쓰는 이름, listName: 상품 목록 화면에 쓰는 짧은 이름
  prizes: {
    1: { name: 'AirPods 5', listName: 'AirPods 5', count: 1, img: 'assets/airpods.png' },
    2: { name: '필립스 미니 마사지건', listName: '필립스 미니 마사지건', count: 1, img: 'assets/massager.png' },
    3: { name: '로지텍 버티컬 마우스', listName: '로지텍 마우스', count: 1, img: 'assets/mouse.png' },
    4: { name: '랜덤 디저트', listName: '랜덤 디저트', count: 1, img: 'assets/disert.svg' },
    5: { name: '메구리즘 아이마스크', listName: '메구리즘 아이마스크', count: 3, img: 'assets/eyemask.png' },
    6: { name: 'CGV 영화 티켓 2장', listName: 'CGV 영화 티켓', count: 3, img: 'assets/cgv.png' },
  },

  // 라운드 순서(등수): 대체로 낮은 등수부터, 마지막에 1위. 3·4라운드는 요청에 따라 3위(마우스) → 4위(디저트) 순서
  rounds: [6, 5, 3, 4, 2, 1],
};
