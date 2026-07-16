import React from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  FolderOpen,
  Scissors,
  Save,
  Crop,
  Camera
} from "lucide-react";

interface ControlBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenFile: () => void;
  isVisible: boolean;
  hasVideo: boolean;
  isEditMode: boolean;
  onToggleEdit: () => void;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onSaveClick: () => void;
  isCropMode: boolean;
  onToggleCrop: () => void;
  onCaptureFrame: () => void;
  isImage?: boolean;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export const ControlBar: React.FC<ControlBarProps> = ({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  onOpenFile,
  isVisible,
  hasVideo,
  isEditMode,
  onToggleEdit,
  trimStart,
  trimEnd,
  onTrimChange,
  onSaveClick,
  isCropMode,
  onToggleCrop,
  onCaptureFrame,
  isImage = false
}) => {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const containerRef = React.useRef<HTMLDivElement>(null);

  // 마우스 드래그 핸들러 (편집바 세로스틱 & 재생핀 드래깅 처리)
  const startDrag = (type: "start" | "end" | "seek") => (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current || !hasVideo || duration === 0) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, clickX / rect.width));
      const time = percent * duration;

      if (type === "start") {
        if (time < trimEnd - 0.1) {
          onTrimChange(time, trimEnd);
          if (currentTime < time) {
            onSeek(time);
          }
        }
      } else if (type === "end") {
        if (time > trimStart + 0.1) {
          onTrimChange(trimStart, time);
          if (currentTime > time) {
            onSeek(time);
          }
        }
      } else if (type === "seek") {
        // 재생핀은 자른 영역(trimStart ~ trimEnd) 내부에서만 움직이도록 바인딩
        const boundedTime = Math.max(trimStart, Math.min(trimEnd, time));
        onSeek(boundedTime);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    // 트랙 자체 영역을 눌렀을 때만 재생핀 이동 허용 (스틱이나 재생핀 요소를 직접 클릭한 경우는 제외)
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("track-clickable")) {
      return;
    }
    if (!containerRef.current || !hasVideo || duration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const time = percent * duration;
    const boundedTime = Math.max(trimStart, Math.min(trimEnd, time));
    onSeek(boundedTime);
  };

  // 백분율 위치 환산
  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const activeWidthPercent = endPercent - startPercent;
  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl z-40 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) transform ${
        isVisible ? "translate-y-0" : "translate-y-[calc(100%+32px)] pointer-events-none"
      }`}
    >
      {/* Control Bar Container with Glassmorphism */}
      <div className="flex flex-col gap-3 px-6 py-4 rounded-2xl bg-black/15 backdrop-blur-xl border border-white/5 shadow-xl">
        
        {/* Timeline Slider / Edit Trimming Slider */}
        {!isImage && (
          <div className="flex items-center w-full gap-3 group">
            <span className="text-[11px] font-mono text-white/70 select-none min-w-[35px]">
              {formatTime(isEditMode ? trimStart : currentTime)}
            </span>
            
            {!isEditMode ? (
              /* 일반 모드: 재생 시커 슬라이더 */
              <div className="relative flex-1 flex items-center h-5">
                {/* 1. 회색 배경 트랙 */}
                <div className="absolute left-0 right-0 h-1 bg-white/15 rounded-lg pointer-events-none"></div>

                {/* 2. 파란색 재생 진행 트랙 */}
                <div
                  className="absolute left-0 h-1 bg-indigo-500 rounded-lg pointer-events-none z-10"
                  style={{ width: `${progressPercent}%` }}
                ></div>

                {/* 3. 투명 레인지 인풋 */}
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step="any"
                  value={currentTime}
                  disabled={!hasVideo}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  onMouseUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  onKeyUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                  className="absolute inset-0 w-full h-full bg-transparent appearance-none cursor-pointer focus:outline-none z-20 disabled:cursor-not-allowed"
                />
              </div>
            ) : (
              /* 편집 모드: 마우스 드래깅 기반 커스텀 양방향 편집 슬라이더 */
              <div
                ref={containerRef}
                onClick={handleTrackClick}
                className="relative flex-1 flex items-center h-5 select-none track-clickable cursor-pointer"
              >
                {/* 1. 회색 배경 트랙 */}
                <div className="absolute left-0 right-0 h-1.5 bg-white/15 rounded-lg pointer-events-none track-clickable"></div>

                {/* 2. 파란색 선택구간 강조 트랙 */}
                <div
                  className="absolute h-1.5 bg-indigo-500/35 rounded-lg pointer-events-none z-10"
                  style={{
                    left: `${startPercent}%`,
                    width: `${activeWidthPercent}%`
                  }}
                ></div>

                {/* 3. 재생 헤드 핀 (동그라미 아래에 세로 작대기 구조, 끝단이 트랙을 가리키도록 설정) */}
                {duration > 0 && (
                  <div
                    className="absolute z-30 cursor-grab active:cursor-grabbing flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${currentPercent}%`, top: '-16px' }}
                    onMouseDown={startDrag("seek")}
                  >
                    {/* 머리 동그라미 */}
                    <div className="w-3 h-3 rounded-full bg-indigo-500 border border-white shadow"></div>
                    {/* 아래 세로 작대기 (작대기 맨 끝인 10px 위치가 트랙 중심과 정확히 맞물림) */}
                    <div className="w-[2px] h-[14px] bg-indigo-500"></div>
                  </div>
                )}

                {/* 4. 편집 구간 자르기 조절 바 (두꺼운 세로 스틱) - 시작점 */}
                <div
                  className="absolute z-40 cursor-ew-resize flex items-center justify-center -translate-x-1/2 group/stick"
                  style={{ left: `${startPercent}%` }}
                  onMouseDown={startDrag("start")}
                  title="잘라낼 시작 시점 설정"
                >
                  <div className="w-[7px] h-5 bg-white border border-neutral-300 rounded shadow group-hover/stick:bg-indigo-300 active:bg-indigo-500 transition-colors"></div>
                </div>

                {/* 5. 편집 구간 자르기 조절 바 (두꺼운 세로 스틱) - 종료점 */}
                <div
                  className="absolute z-40 cursor-ew-resize flex items-center justify-center -translate-x-1/2 group/stick"
                  style={{ left: `${endPercent}%` }}
                  onMouseDown={startDrag("end")}
                  title="잘라낼 종료 시점 설정"
                >
                  <div className="w-[7px] h-5 bg-white border border-neutral-300 rounded shadow group-hover/stick:bg-indigo-300 active:bg-indigo-500 transition-colors"></div>
                </div>
              </div>
            )}

            <span className="text-[11px] font-mono text-white/70 select-none min-w-[35px]">
              {formatTime(isEditMode ? trimEnd : duration)}
            </span>
          </div>
        )}

        {/* Buttons and Sound Control */}
        <div className="grid grid-cols-3 items-center w-full">
          {/* Left: Open & Edit Buttons (Icon Only) */}
          <div className="flex items-center justify-start gap-2">
            <button
              onClick={(e) => {
                onOpenFile();
                (e.currentTarget as HTMLButtonElement).blur();
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-white/90 bg-white/5 hover:bg-white/15 active:bg-white/10 border border-white/5 transition-all duration-150 cursor-pointer"
              title={isImage ? "이미지 파일 열기" : "동영상 파일 열기"}
            >
              <FolderOpen className="w-4 h-4" />
            </button>

            {/* Edit Button */}
            <button
              disabled={!hasVideo}
              onClick={(e) => {
                onToggleEdit();
                (e.currentTarget as HTMLButtonElement).blur();
              }}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                isEditMode
                  ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40"
                  : "text-white/90 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
              }`}
              title={isEditMode ? "편집 완료/닫기" : (isImage ? "이미지 크롭 편집" : "비디오 자르기 편집")}
            >
              <Scissors className="w-4 h-4" />
            </button>

            {/* Crop Button */}
            {isEditMode && !isImage && (
              <button
                onClick={(e) => {
                  onToggleCrop();
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 cursor-pointer ${
                  isCropMode
                    ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40"
                    : "text-white/90 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
                }`}
                title={isCropMode ? "화면 자르기(크롭) 끄기" : "화면 자르기(크롭) 켜기"}
              >
                <Crop className="w-4.5 h-4.5" />
              </button>
            )}

            {/* Frame Capture Button */}
            {isEditMode && !isImage && (
              <button
                onClick={(e) => {
                  onCaptureFrame();
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-white/90 bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-400 active:bg-white/10 border border-white/5 transition-all duration-150 cursor-pointer"
                title="현재 프레임 이미지로 저장 (캡처)"
              >
                <Camera className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Center: Play/Pause or Save button */}
          <div className="flex items-center justify-center">
            {!isEditMode ? (
              isImage ? null : (
                <button
                  onClick={(e) => {
                    onPlayPause();
                    (e.currentTarget as HTMLButtonElement).blur();
                  }}
                  disabled={!hasVideo}
                  className={`flex items-center justify-center w-11 h-11 rounded-full text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all duration-150 hover:scale-105 active:scale-95 disabled:bg-white/5 disabled:text-white/30 disabled:shadow-none disabled:scale-100 disabled:cursor-not-allowed cursor-pointer`}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                </button>
              )
            ) : (
              <button
                onClick={(e) => {
                  onSaveClick();
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
                disabled={!hasVideo}
                className="flex items-center justify-center w-11 h-11 rounded-full text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all duration-150 hover:scale-105 active:scale-95 disabled:bg-white/5 disabled:text-white/30 disabled:shadow-none disabled:scale-100 disabled:cursor-not-allowed cursor-pointer"
                title={isImage ? "크롭된 이미지 저장" : "편집 비디오 저장 설정 열기"}
              >
                <Save className="w-5 h-5 stroke-white fill-none" />
              </button>
            )}
          </div>

          {/* Right: Volume & Fullscreen */}
          <div className="flex items-center justify-end gap-4">
            {/* Volume Control */}
            {!isImage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    onToggleMute();
                    (e.currentTarget as HTMLButtonElement).blur();
                  }}
                  disabled={!hasVideo}
                  className="text-white/80 hover:text-white transition-colors duration-150 disabled:text-white/30 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
                </button>
                
                {/* Volume Slider Wrapper with Constant Width */}
                <div className="relative flex items-center h-5 w-20">
                  {/* 1. Gray Background Track */}
                  <div className="absolute left-0 right-0 h-1 bg-white/15 rounded-lg pointer-events-none"></div>

                  {/* 2. Blue Progress Track */}
                  <div
                    className="absolute left-0 h-1 bg-indigo-500 rounded-lg pointer-events-none z-10"
                    style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                  ></div>

                  {/* 3. Invisible range input on top */}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    disabled={!hasVideo}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    onMouseUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onKeyUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    className="absolute inset-0 w-full h-full bg-transparent appearance-none cursor-pointer focus:outline-none z-20 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={(e) => {
                onToggleFullscreen();
                (e.currentTarget as HTMLButtonElement).blur();
              }}
              disabled={!hasVideo}
              className="text-white/80 hover:text-white transition-colors duration-150 hover:scale-105 active:scale-95 disabled:text-white/30 disabled:cursor-not-allowed cursor-pointer"
              title={isFullscreen ? "창 모드로 보기" : "전체화면"}
            >
              {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
