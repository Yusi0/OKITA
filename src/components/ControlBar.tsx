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
import { SpriteSheetInfo } from "../App";

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
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  videoSrc: string | null;
  isEditMuted?: boolean;
  onToggleEditMute?: () => void;
  spriteData?: SpriteSheetInfo | null;
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
  isImage = false,
  playbackSpeed,
  onPlaybackSpeedChange,
  videoSrc,
  isEditMuted = false,
  onToggleEditMute,
  spriteData
}) => {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // 썸네일 미리보기 오프스크린 요소 Refs & States
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);
  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = React.useState<{ x: number; time: number } | null>(null);

  // 마우스 타임라인 호버 시 썸네일 미리보기 시간 계산
  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasVideo || duration === 0 || isImage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percent = x / rect.width;
    const time = percent * duration;
    setHoverInfo({ x, time });

    if (previewVideoRef.current && Math.abs(previewVideoRef.current.currentTime - time) > 0.15) {
      previewVideoRef.current.currentTime = time;
    }
  };

  const handleTimelineMouseLeave = () => {
    setHoverInfo(null);
  };

  // 미리보기 전용 비디오의 시킹이 완료되었을 때 캔버스에 프레임 렌더링
  const handlePreviewSeeked = () => {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    canvas.width = 120;
    canvas.height = Math.max(68, Math.round((video.videoHeight / video.videoWidth) * 120));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
  };

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
      {/* 썸네일 미리보기용 비디오 엘리먼트 (오프스크린) */}
      {videoSrc && !isImage && (
        <video
          ref={previewVideoRef}
          src={videoSrc}
          muted
          preload="auto"
          onSeeked={handlePreviewSeeked}
          className="hidden"
        />
      )}

      {/* Control Bar Container with Glassmorphism */}
      <div className="relative flex flex-col gap-3 px-6 py-4 rounded-2xl bg-black/15 backdrop-blur-xl border border-white/5 shadow-xl">
        
        {/* Timeline Slider / Edit Trimming Slider */}
        {!isImage && (
          <div className="flex items-center w-full gap-3 group">
            <span className="text-[11px] font-mono text-white/70 select-none min-w-[35px]">
              {formatTime(isEditMode ? trimStart : currentTime)}
            </span>
            
            {!isEditMode ? (
              /* 일반 모드: 재생 시커 슬라이더 */
              <div
                className="relative flex-1 flex items-center h-5"
                onMouseMove={handleTimelineMouseMove}
                onMouseLeave={handleTimelineMouseLeave}
              >
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

                {/* 재생바 마우스 호버 썸네일 & 타임코드 툴팁 (하이브리드: Canvas fallback -> GPU Sprite Sheet) */}
                {hoverInfo && (
                  <div
                    className="absolute -top-[118px] pointer-events-none z-50 -translate-x-1/2 flex flex-col items-center transition-opacity duration-150 animate-fade-in"
                    style={{ left: `${hoverInfo.x}px` }}
                  >
                    <div className="p-1 rounded-xl bg-neutral-900/90 border border-white/20 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col items-center">
                      {spriteData && spriteData.sprite_url ? (
                        (() => {
                          const thumbIndex = Math.min(
                            spriteData.total_count - 1,
                            Math.max(0, Math.floor(hoverInfo.time / spriteData.interval))
                          );
                          const col = thumbIndex % spriteData.cols;
                          const row = Math.floor(thumbIndex / spriteData.cols);
                          const bgX = -col * spriteData.tile_width;
                          const bgY = -row * spriteData.tile_height;

                          return (
                            <div
                              className="w-[120px] h-[68px] rounded-lg border border-white/10 shadow-inner bg-no-repeat overflow-hidden"
                              style={{
                                backgroundImage: `url(${spriteData.sprite_url})`,
                                backgroundPosition: `${bgX}px ${bgY}px`,
                                backgroundSize: `${spriteData.cols * spriteData.tile_width}px ${spriteData.rows * spriteData.tile_height}px`
                              }}
                            />
                          );
                        })()
                      ) : (
                        <canvas
                          ref={previewCanvasRef}
                          className="w-[120px] rounded-lg bg-black border border-white/10 object-contain shadow-inner"
                        />
                      )}
                      <span className="text-[10px] font-mono font-bold text-indigo-300 mt-1 px-2 py-0.5 rounded bg-white/10 tracking-wider">
                        {formatTime(hoverInfo.time)}
                      </span>
                    </div>
                    <div className="w-2 h-2 bg-neutral-900/90 border-r border-b border-white/20 rotate-45 -mt-1"></div>
                  </div>
                )}
              </div>
            ) : (
              /* 편집 모드: 마우스 드래깅 기반 커스텀 양방향 편집 슬라이더 */
              <div
                ref={containerRef}
                onClick={handleTrackClick}
                onMouseMove={handleTimelineMouseMove}
                onMouseLeave={handleTimelineMouseLeave}
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

                {/* 3. 재생 헤드 핀 */}
                {duration > 0 && (
                  <div
                    className="absolute z-30 cursor-grab active:cursor-grabbing flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${currentPercent}%`, top: '-16px' }}
                    onMouseDown={startDrag("seek")}
                  >
                    <div className="w-3 h-3 rounded-full bg-indigo-500 border border-white shadow"></div>
                    <div className="w-[2px] h-[14px] bg-indigo-500"></div>
                  </div>
                )}

                {/* 4. 편집 구간 자르기 조절 바 - 시작점 */}
                <div
                  className="absolute z-40 cursor-ew-resize flex items-center justify-center -translate-x-1/2 group/stick"
                  style={{ left: `${startPercent}%` }}
                  onMouseDown={startDrag("start")}
                  title="잘라낼 시작 시점 설정"
                >
                  <div className="w-[7px] h-5 bg-white border border-neutral-300 rounded shadow group-hover/stick:bg-indigo-300 active:bg-indigo-500 transition-colors"></div>
                </div>

                {/* 5. 편집 구간 자르기 조절 바 - 종료점 */}
                <div
                  className="absolute z-40 cursor-ew-resize flex items-center justify-center -translate-x-1/2 group/stick"
                  style={{ left: `${endPercent}%` }}
                  onMouseDown={startDrag("end")}
                  title="잘라낼 종료 시점 설정"
                >
                  <div className="w-[7px] h-5 bg-white border border-neutral-300 rounded shadow group-hover/stick:bg-indigo-300 active:bg-indigo-500 transition-colors"></div>
                </div>

                {/* 편집 모드 마우스 호버 썸네일 & 타임코드 툴팁 (하이브리드) */}
                {hoverInfo && (
                  <div
                    className="absolute -top-[118px] pointer-events-none z-50 -translate-x-1/2 flex flex-col items-center transition-opacity duration-150 animate-fade-in"
                    style={{ left: `${hoverInfo.x}px` }}
                  >
                    <div className="p-1 rounded-xl bg-neutral-900/90 border border-white/20 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col items-center">
                      {spriteData && spriteData.sprite_url ? (
                        (() => {
                          const thumbIndex = Math.min(
                            spriteData.total_count - 1,
                            Math.max(0, Math.floor(hoverInfo.time / spriteData.interval))
                          );
                          const col = thumbIndex % spriteData.cols;
                          const row = Math.floor(thumbIndex / spriteData.cols);
                          const bgX = -col * spriteData.tile_width;
                          const bgY = -row * spriteData.tile_height;

                          return (
                            <div
                              className="w-[120px] h-[68px] rounded-lg border border-white/10 shadow-inner bg-no-repeat overflow-hidden"
                              style={{
                                backgroundImage: `url(${spriteData.sprite_url})`,
                                backgroundPosition: `${bgX}px ${bgY}px`,
                                backgroundSize: `${spriteData.cols * spriteData.tile_width}px ${spriteData.rows * spriteData.tile_height}px`
                              }}
                            />
                          );
                        })()
                      ) : (
                        <canvas
                          ref={previewCanvasRef}
                          className="w-[120px] rounded-lg bg-black border border-white/10 object-contain shadow-inner"
                        />
                      )}
                      <span className="text-[10px] font-mono font-bold text-indigo-300 mt-1 px-2 py-0.5 rounded bg-white/10 tracking-wider">
                        {formatTime(hoverInfo.time)}
                      </span>
                    </div>
                    <div className="w-2 h-2 bg-neutral-900/90 border-r border-b border-white/20 rotate-45 -mt-1"></div>
                  </div>
                )}
              </div>
            )}

            <span className="text-[11px] font-mono text-white/70 select-none min-w-[35px]">
              {formatTime(isEditMode ? (trimEnd - trimStart) / playbackSpeed : duration)}
            </span>
          </div>
        )}

        {/* Buttons and Sound Control */}
        <div className="grid grid-cols-3 items-center w-full">
          {/* Left: Open & Edit Buttons */}
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

          {/* Right: Playback Speed, Volume & Fullscreen */}
          <div className="flex items-center justify-end gap-3">
            {/* Speed Button (Click to cycle through 0.5x -> 0.75x -> 1.0x -> 1.25x -> 1.5x -> 2.0x) */}
            {!isImage && (
              <button
                disabled={!hasVideo}
                onClick={(e) => {
                  const steps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
                  const curIdx = steps.indexOf(playbackSpeed);
                  const nextIdx = curIdx === -1 ? 2 : (curIdx + 1) % steps.length;
                  onPlaybackSpeedChange(steps[nextIdx]);
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold font-mono transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  playbackSpeed !== 1.0
                    ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40 shadow-sm"
                    : "text-white/80 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
                }`}
                title={isEditMode ? "클릭 시 편집 배속 변경 (0.5x ~ 2.0x)" : "클릭 시 시청 배속 변경 (0.5x ~ 2.0x)"}
              >
                {playbackSpeed.toFixed(2).replace(/\.00$/, "").replace(/\.50$/, ".5")}x
              </button>
            )}

            {/* Volume Control in View Mode vs Mute Toggle Button in Edit Mode */}
            {!isImage && (
              !isEditMode ? (
                /* 일반 감상 모드: 음소거 버튼 + 볼륨 슬라이더 */
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      onToggleMute();
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
                    disabled={!hasVideo}
                    className="text-white/80 hover:text-white transition-colors duration-150 disabled:text-white/30 disabled:cursor-not-allowed cursor-pointer"
                    title={isMuted ? "음소거 해제" : "음소거"}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5 text-rose-400" /> : <Volume2 className="w-4.5 h-4.5" />}
                  </button>
                  
                  {/* Volume Slider Wrapper */}
                  <div className="relative flex items-center h-5 w-16">
                    <div className="absolute left-0 right-0 h-1 bg-white/15 rounded-lg pointer-events-none"></div>
                    <div
                      className="absolute left-0 h-1 bg-indigo-500 rounded-lg pointer-events-none z-10"
                      style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                    ></div>
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
              ) : (
                /* 편집 모드: 사운드 슬라이더 제거 및 아이콘 전용 음소거 토글 버튼 제공 */
                <button
                  onClick={(e) => {
                    if (onToggleEditMute) onToggleEditMute();
                    (e.currentTarget as HTMLButtonElement).blur();
                  }}
                  disabled={!hasVideo}
                  className={`flex items-center justify-center p-1.5 rounded-lg border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isEditMuted
                      ? "text-rose-400 bg-rose-500/20 border-rose-500/40"
                      : "text-white/80 bg-white/5 hover:bg-white/15 border-white/5"
                  }`}
                  title={isEditMuted ? "편집 음소거 켜짐 (오디오 트랙 없이 저장)" : "편집 음소거 끔 (원본 소리로 저장)"}
                >
                  {isEditMuted ? (
                    <VolumeX className="w-4.5 h-4.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4.5 h-4.5 text-white/80" />
                  )}
                </button>
              )
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
