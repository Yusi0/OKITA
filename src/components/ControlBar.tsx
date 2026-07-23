import React from "react";
import { TOOLTIPS } from "../constants/tooltips";
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
  Crop
} from "lucide-react";

export interface ClipSegment {
  id: string;
  filePath: string;
  start: number;
  end: number;
  title?: string;
}

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
  onCaptureFrame?: () => void;
  isImage?: boolean;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  videoSrc: string | null;
  isEditMuted?: boolean;
  onToggleEditMute?: () => void;
  clips?: ClipSegment[];
  selectedClipId?: string | null;
  onSelectClip?: (id: string) => void;
  dropInsertIndex?: number | null;
  isDraggingAsset?: boolean;
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
  trimStart: _trimStart,
  trimEnd: _trimEnd,
  onTrimChange: _onTrimChange,
  onSaveClick,
  isCropMode,
  onToggleCrop,
  onCaptureFrame: _onCaptureFrame,
  isImage = false,
  playbackSpeed,
  onPlaybackSpeedChange,
  videoSrc,
  isEditMuted = false,
  onToggleEditMute,
  clips,
  selectedClipId,
  onSelectClip,
  dropInsertIndex,
  isDraggingAsset
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 썸네일 미리보기 오프스크린 요소 Refs & States
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);
  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = React.useState<{ x: number; time: number } | null>(null);

  const totalEditedDuration = isEditMode && clips && clips.length > 0
    ? clips.reduce((acc, c) => acc + (c.end - c.start), 0)
    : duration;

  const editedCurrentTime = currentTime;

  // 마우스 타임라인 호버 시 썸네일 미리보기 시간 계산
  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasVideo || duration === 0 || isImage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percent = x / rect.width;

    const targetHoverTime = isEditMode
      ? percent * totalEditedDuration
      : percent * duration;

    setHoverInfo({ x, time: targetHoverTime });

    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = targetHoverTime;
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

      if (type === "seek") {
        if (isEditMode) {
          const targetTimelineT = percent * totalEditedDuration;
          onSeek(targetTimelineT);
        } else {
          onSeek(percent * duration);
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 백분율 위치 환산 (편집 모드 시 편집 타임라인 기준 좌표계 사용)
  const currentPercent = isEditMode
    ? (totalEditedDuration > 0 ? (editedCurrentTime / totalEditedDuration) * 100 : 0)
    : (duration > 0 ? (currentTime / duration) * 100 : 0);

  return (
    <div
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl z-40 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) transform ${isVisible ? "translate-y-0" : "translate-y-[calc(100%+32px)] pointer-events-none"
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
              {formatTime(editedCurrentTime)}
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

                {/* 재생바 마우스 호버 타임코드 툴팁 */}
                {hoverInfo && (
                  <div
                    className="absolute -top-9 pointer-events-none z-50 -translate-x-1/2 flex flex-col items-center transition-opacity duration-150 animate-fade-in"
                    style={{ left: `${hoverInfo.x}px` }}
                  >
                    <div className="px-2.5 py-1 rounded-md bg-neutral-900/95 border border-white/20 shadow-xl text-[11px] font-mono font-semibold text-white whitespace-nowrap">
                      {formatTime(hoverInfo.time)}
                    </div>
                    <div className="w-2 h-2 bg-neutral-900/95 border-r border-b border-white/20 rotate-45 -mt-1"></div>
                  </div>
                )}
              </div>
            ) : (
              /* 편집 모드: 32px 멀티 클립 타임라인 트랙 */
              <div
                ref={containerRef}
                onMouseMove={handleTimelineMouseMove}
                onMouseLeave={handleTimelineMouseLeave}
                className="relative flex-1 flex items-center h-8 bg-neutral-900/80 border border-white/10 rounded-xl overflow-visible select-none h-[32px]"
              >
                {/* 편집 모드 호버 #n (mm:ss) 툴팁 */}
                {hoverInfo && (
                  <div
                    className="absolute -top-9 pointer-events-none z-50 -translate-x-1/2 flex flex-col items-center transition-opacity duration-150 animate-fade-in"
                    style={{ left: `${hoverInfo.x}px` }}
                  >
                    <div className="px-2.5 py-1 rounded-md bg-neutral-900/95 border border-white/20 shadow-xl text-[11px] font-mono font-semibold text-white whitespace-nowrap">
                      {(() => {
                        if (clips && clips.length > 0) {
                          let accum = 0;
                          for (let i = 0; i < clips.length; i++) {
                            const dur = clips[i].end - clips[i].start;
                            if (hoverInfo.time >= accum && (hoverInfo.time <= accum + dur || i === clips.length - 1)) {
                              return `#${i + 1} (${formatTime(hoverInfo.time)})`;
                            }
                            accum += dur;
                          }
                        }
                        return formatTime(hoverInfo.time);
                      })()}
                    </div>
                    <div className="w-2 h-2 bg-neutral-900/95 border-r border-b border-white/20 rotate-45 -mt-1"></div>
                  </div>
                )}
                {/* 트랙 배경 트랙 라인 */}
                <div className="absolute left-0 right-0 h-1 bg-white/10 rounded pointer-events-none"></div>

                {/* 멀티 클립 블록들 렌더링 (리플 컷 자석 연속 연결) */}
                {(() => {
                  if (!clips || clips.length === 0) return null;
                  const totalEditedDuration = clips.reduce((acc, c) => acc + (c.end - c.start), 0);
                  let accum = 0;

                  return clips.map((clip, index) => {
                    const dur = clip.end - clip.start;
                    const startPct = totalEditedDuration > 0 ? (accum / totalEditedDuration) * 100 : 0;
                    const widthPct = totalEditedDuration > 0 ? (dur / totalEditedDuration) * 100 : 0;
                    accum += dur;
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <div
                        key={clip.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectClip) onSelectClip(clip.id);
                        }}
                        className={`absolute h-7 top-[2px] rounded-lg border transition-all flex items-center justify-between px-2 text-[10px] font-mono font-bold select-none cursor-pointer overflow-hidden ${isSelected
                            ? "bg-indigo-500/60 border-2 border-indigo-300 ring-2 ring-indigo-400/50 text-white shadow-lg z-20"
                            : "bg-indigo-600/30 border-indigo-500/40 hover:bg-indigo-500/45 text-white/80 z-10"
                          }`}
                        style={{
                          left: `${startPct}%`,
                          width: `${Math.max(0.5, widthPct)}%`
                        }}
                        title={`클립 #${index + 1} (${formatTime(dur)})`}
                      >
                        <span className="truncate">#{index + 1}</span>
                        <span className="text-[9px] opacity-75 hidden sm:inline ml-1">
                          {formatTime(dur)}
                        </span>
                      </div>
                    );
                  });
                })()}

                {/* 프리미어 프로 스타일 드래그 앤 드롭 가상 삽입 라인 마커 (Ghost Line Preview) */}
                {isDraggingAsset && dropInsertIndex !== undefined && dropInsertIndex !== null && (() => {
                  if (!clips || clips.length === 0) return null;
                  const totalEditedDuration = clips.reduce((acc, c) => acc + (c.end - c.start), 0);
                  let ghostPos = 0;
                  if (dropInsertIndex === 0) {
                    ghostPos = 0;
                  } else if (dropInsertIndex >= clips.length) {
                    ghostPos = 100;
                  } else {
                    let accum = 0;
                    for (let i = 0; i < dropInsertIndex; i++) {
                      accum += (clips[i].end - clips[i].start);
                    }
                    ghostPos = totalEditedDuration > 0 ? (accum / totalEditedDuration) * 100 : 0;
                  }

                  return (
                    <div
                      className="absolute z-50 pointer-events-none flex flex-col items-center -translate-x-1/2 transition-all duration-75"
                      style={{ left: `${ghostPos}%`, top: "-6px" }}
                    >
                      <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-cyan-400 mb-0.5 animate-bounce"></div>
                      <div className="w-[3px] h-[36px] bg-cyan-400 rounded-full shadow-[0_0_14px_#22d3ee]"></div>
                      <div className="w-0 h-0 border-x-[5px] border-x-transparent border-b-[6px] border-b-cyan-400 mt-0.5 animate-bounce"></div>
                    </div>
                  );
                })()}

                {/* 재생 헤드 핀 (상단 핀 머리만 드래그 탐색 허용) */}
                {(duration > 0 || (isEditMode && totalEditedDuration > 0)) && (
                  <div
                    className="absolute z-30 cursor-grab active:cursor-grabbing flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${Math.max(0, Math.min(100, isNaN(currentPercent) ? 0 : currentPercent))}%`, top: '-14px' }}
                    onMouseDown={startDrag("seek")}
                    title="플레이헤드 이동 (드래그)"
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-white shadow-md hover:scale-110 active:scale-95 transition-transform"></div>
                    <div className="w-[2px] h-[32px] bg-indigo-400 shadow"></div>
                  </div>
                )}
              </div>
            )}

            <span className="text-[11px] font-mono text-white/70 select-none min-w-[35px]">
              {formatTime(isEditMode ? (clips ? clips.reduce((acc, c) => acc + (c.end - c.start), 0) / playbackSpeed : duration) : duration)}
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
              className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${isEditMode
                  ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40"
                  : "text-white/90 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
                }`}
              title={isEditMode ? "편집 완료/닫기" : (isImage ? "이미지 크롭 편집" : "비디오 멀티 클립 편집")}
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
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 cursor-pointer ${isCropMode
                    ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40"
                    : "text-white/90 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
                  }`}
                title={isCropMode ? TOOLTIPS.controlBar.cropModeDisable : TOOLTIPS.controlBar.cropModeEnable}
              >
                <Crop className="w-4.5 h-4.5" />
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
                  title={isPlaying ? TOOLTIPS.controlBar.pause : TOOLTIPS.controlBar.play}
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
                title={TOOLTIPS.controlBar.exportModal}
              >
                <Save className="w-5 h-5 stroke-white fill-none" />
              </button>
            )}
          </div>

          {/* Right: Playback Speed, Volume & Fullscreen */}
          <div className="flex items-center justify-end gap-3">
            {/* Speed Button */}
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
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold font-mono transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${playbackSpeed !== 1.0
                    ? "text-indigo-400 bg-indigo-500/20 border-indigo-500/40 shadow-sm"
                    : "text-white/80 bg-white/5 hover:bg-white/15 active:bg-white/10 border-white/5"
                  }`}
                title={TOOLTIPS.controlBar.playbackSpeed}
              >
                {playbackSpeed.toFixed(2).replace(/\.00$/, "").replace(/\.50$/, ".5")}x
              </button>
            )}

            {/* Volume Control */}
            {!isImage && (
              !isEditMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      onToggleMute();
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
                    disabled={!hasVideo}
                    className="text-white/80 hover:text-white transition-colors duration-150 disabled:text-white/30 disabled:cursor-not-allowed cursor-pointer"
                    title={isMuted ? TOOLTIPS.controlBar.unmute : TOOLTIPS.controlBar.mute}
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
                  className={`flex items-center justify-center p-1.5 rounded-lg border transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isEditMuted
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
              title={TOOLTIPS.controlBar.fullscreen}
            >
              {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
