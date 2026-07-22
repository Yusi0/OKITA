// OKITA Canvas - 전역 버튼 툴팁 및 안내 텍스트 중앙 관리 상수 파일
// 이 파일에서 텍스트를 수정하면 앱 전체 UI 툴팁에 자동 반영됩니다.

export const TOOLTIPS = {
  // 1. 하단 플로팅 컨트롤바 툴팁
  controlBar: {
    play: "재생",
    pause: "일시정지",
    mute: "음소거",
    unmute: "음소거 해제",
    volume: "음량 조절",
    editModeEnable: "편집 모드 켜기",
    editModeDisable: "편집 모드 끄기",
    cropModeEnable: "크롭 설정",
    cropModeDisable: "크롭 설정 취소",
    captureFrame: "현재 프레임 추출",
    exportModal: "저장 및 내보내기 설정...",
    undo: "실행 취소",
    redo: "다시 실행",
    splitClip: "현재 장면에서 분할",
    deleteClip: "선택한 클립 삭제",
    fullscreen: "전체 화면",
    playbackSpeed: "재생 속도",
  },

  // 2. 우클릭 커스텀 컨텍스트 메뉴 라벨 및 설명
  contextMenu: {
    captureFrame: "현재 프레임 추출",
    playbackSpeed: "재생 속도",
    keybinds: "단축키 안내",
    about: "앱 정보",
  },

  // 3. 내보내기 모달 툴팁 및 가이드
  exportModal: {
    videoTab: "비디오 파일로 내보내기",
    gifTab: "움짤로 내보내기",
    audioTab: "오디오 음원 추출",
    copyMode: "원본 데이터 유지",
    encodeMode: "옵션 재인코딩",
    lightboxClick: "실제 픽셀 크기로 확대",
  },

  // 4. 상단 타이틀바 버튼 툴팁
  titleBar: {
    minimize: "창 최소화",
    maximize: "창 최대화 / 이전 크기로 복원",
    close: "창 닫기",
  },
} as const;
