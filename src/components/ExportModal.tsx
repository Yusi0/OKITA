import React, { useState, useEffect, useRef } from "react";
import { Video, Image as ImageIcon, Music, Check, Sparkles, ZoomIn, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ClipSegment } from "./ControlBar";

export type ExportType = "video" | "gif" | "audio";
export type GifFormat = "gif" | "webp";
export type AudioBitrate = "128k" | "192k" | "320k" | "original";
export type AudioFormat = "mp3" | "m4a" | "wav";

export interface ExportOptions {
  exportType: ExportType;
  // 비디오 옵션
  fps: string;
  useCopy: boolean;
  crf: number;
  exportSpeed: number;
  // 움짤 옵션
  gifFps: string;
  gifQuality: number; // 25 ~ 100 (%)
  gifFormat: GifFormat;
  // 오디오 옵션
  audioBitrate: AudioBitrate;
  audioFormat: AudioFormat;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalFileSize: number | null;
  trimDuration: number;
  videoDuration: number;
  onExport: (options: ExportOptions) => void;
  isExporting: boolean;
  isCropMode: boolean;
  cropAreaRatio: number;
  initialExportSpeed?: number;
  videoSrc?: string | null;
  filePath?: string | null;
  trimStart?: number;
  trimEnd?: number;
  initialTab?: ExportType;
  cropArea?: { x: number; y: number; w: number; h: number };
  isAudioOnly?: boolean;
  clips?: ClipSegment[];
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

const CRF_OPTIONS = [18, 23, 28, 32];
const CRF_DESCRIPTIONS = [
  "초고화질 (CRF 18) - 용량이 큼",
  "기본 표준 (CRF 23) - 권장",
  "용량 절약 (CRF 28)",
  "최소 용량 (CRF 32) - 화질 저하"
];

const FPS_OPTIONS = [
  { label: "15 FPS", value: "15" },
  { label: "24 FPS", value: "24" },
  { label: "30 FPS", value: "30" },
  { label: "60 FPS", value: "60" },
  { label: "원본 FPS", value: "original" }
];

const GIF_FPS_OPTIONS = [
  { label: "10 FPS", value: "10" },
  { label: "12 FPS", value: "12" },
  { label: "15 FPS", value: "15" },
  { label: "20 FPS", value: "20" },
  { label: "24 FPS", value: "24" },
  { label: "30 FPS", value: "30" }
];

// 25% ~ 100% 8구간 화질 슬라이더 (index 0~7)
const GIF_QUALITY_STEPS = [25, 35, 45, 55, 65, 75, 85, 100];

const AUDIO_BITRATES: { label: string; value: AudioBitrate; desc: string }[] = [
  { label: "128k", value: "128k", desc: "표준 음질 (128 kbps)" },
  { label: "192k", value: "192k", desc: "고음질 (192 kbps)" },
  { label: "320k", value: "320k", desc: "최고 음질 (320 kbps)" },
  { label: "원음", value: "original", desc: "원본 스트림 유지 (또는 320k 폴백)" }
];

const AUDIO_FORMATS: { label: string; value: AudioFormat; ext: string }[] = [
  { label: "MP3", value: "mp3", ext: ".mp3" },
  { label: "M4A (AAC)", value: "m4a", ext: ".m4a" },
  { label: "WAV (무손실)", value: "wav", ext: ".wav" }
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  originalFileSize,
  trimDuration,
  videoDuration,
  onExport,
  isExporting,
  isCropMode,
  cropAreaRatio,
  initialExportSpeed = 1.0,
  videoSrc,
  trimStart = 0,
  trimEnd = 0,
  initialTab = "video",
  cropArea,
  isAudioOnly = false,
  clips,
  rotation = 0,
  flipH = false,
  flipV = false
}) => {
  // 상단 탭 선택: "video" | "gif" | "audio"
  const [activeTab, setActiveTab] = useState<ExportType>(isAudioOnly ? "audio" : initialTab);

  // [비디오 탭 상태]
  const [saveMode, setSaveMode] = useState<"copy" | "encode">("copy");
  const [fpsIndex, setFpsIndex] = useState<number>(4); // 원본 FPS
  const [crfIndex, setCrfIndex] = useState<number>(1); // CRF 23
  const [exportSpeed, setExportSpeed] = useState<number>(initialExportSpeed);

  // [움짤 탭 상태]
  const [gifFpsIndex, setGifFpsIndex] = useState<number>(2); // 기본 15 FPS
  const [gifQualityIndex, setGifQualityIndex] = useState<number>(7); // 기본 100%
  const [gifFormat, setGifFormat] = useState<GifFormat>("gif");

  // 실시간 캔버스 미리보기 렌더러 참조
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const enlargedCanvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const currentClipIdxRef = useRef<number>(0);

  // 클릭 시 실제 픽셀 크기 확대 미리보기 라이트박스 모달 상태
  const [isEnlargedOpen, setIsEnlargedOpen] = useState<boolean>(false);
  const [targetDimensions, setTargetDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // [오디오 탭 상태]
  const [audioBitrate, setAudioBitrate] = useState<AudioBitrate>("320k");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");

  // 256색 GIF 파이프라인 팔레트 양자화 효과 (RGB 8-8-4 단계)
  const apply256ColorPalette = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.floor(data[i] / 32) * 36;
        data[i + 1] = Math.floor(data[i + 1] / 32) * 36;
        data[i + 2] = Math.floor(data[i + 2] / 64) * 85;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // 캔버스 보안 폴백
    }
  };

  // 모달 오픈 시 initialTab 및 속도/크롭/회전/반전 설정 동기화
  useEffect(() => {
    if (isOpen) {
      if (isAudioOnly) {
        setActiveTab("audio");
      } else if (initialTab) {
        setActiveTab(initialTab);
      }
      setExportSpeed(initialExportSpeed);
      if (isCropMode || initialExportSpeed !== 1.0 || rotation !== 0 || flipH || flipV) {
        setSaveMode("encode");
      }
      currentClipIdxRef.current = 0;
      if (clips && clips.length > 0 && hiddenVideoRef.current) {
        const firstClip = clips[0];
        const src = firstClip.filePath ? convertFileSrc(firstClip.filePath) : (videoSrc || "");
        hiddenVideoRef.current.src = src;
        hiddenVideoRef.current.currentTime = firstClip.start;
      }
    }
  }, [isOpen, isAudioOnly, initialTab, isCropMode, initialExportSpeed, clips, videoSrc]);

  // 마스터 타임라인 시뮬레이션 시계 참조
  const timelineTimeRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);

  // 멀티 클립 및 트림 구간 마스터 타임라인 재생 시뮬레이션
  useEffect(() => {
    let animId: number;

    const tickTimeline = (now: number) => {
      if (isOpen && activeTab === "gif" && hiddenVideoRef.current) {
        if (!lastTickTimeRef.current) lastTickTimeRef.current = now;
        const deltaSeconds = ((now - lastTickTimeRef.current) / 1000) * exportSpeed;
        lastTickTimeRef.current = now;

        const v = hiddenVideoRef.current;

        if (clips && clips.length > 0) {
          const totalDur = clips.reduce((acc, c) => acc + (c.end - c.start), 0);
          if (totalDur > 0) {
            timelineTimeRef.current = (timelineTimeRef.current + deltaSeconds) % totalDur;
            const t = timelineTimeRef.current;

            // 현재 t 위치에 해당하는 클립 분기 및 내부 타임스탬프 계산
            let accum = 0;
            let targetClipIndex = 0;
            let targetLocalTime = 0;

            for (let i = 0; i < clips.length; i++) {
              const segDur = clips[i].end - clips[i].start;
              if (t >= accum && t < accum + segDur) {
                targetClipIndex = i;
                targetLocalTime = clips[i].start + (t - accum);
                break;
              }
              accum += segDur;
            }

            const targetClip = clips[targetClipIndex];
            const targetSrc = targetClip.filePath ? convertFileSrc(targetClip.filePath) : (videoSrc || "");

            if (v.src !== targetSrc) {
              v.src = targetSrc;
              v.currentTime = targetLocalTime;
              v.play().catch(() => {});
            } else {
              // 시크 편차가 0.3초 이상 벌어졌을 때만 정밀 교정
              if (Math.abs(v.currentTime - targetLocalTime) > 0.3) {
                v.currentTime = targetLocalTime;
              }
            }
          }
        } else {
          const start = trimStart || 0;
          const end = (trimEnd && trimEnd > start) ? trimEnd : (videoDuration || 100);
          const dur = end - start;
          if (dur > 0) {
            timelineTimeRef.current = (timelineTimeRef.current + deltaSeconds) % dur;
            const targetTime = start + timelineTimeRef.current;
            if (v.src !== (videoSrc || "")) {
              v.src = videoSrc || "";
            }
            if (Math.abs(v.currentTime - targetTime) > 0.3) {
              v.currentTime = targetTime;
            }
          }
        }
      } else {
        lastTickTimeRef.current = 0;
      }

      if (isOpen && activeTab === "gif") {
        animId = requestAnimationFrame(tickTimeline);
      }
    };

    if (isOpen && activeTab === "gif") {
      lastTickTimeRef.current = 0;
      timelineTimeRef.current = 0;
      animId = requestAnimationFrame(tickTimeline);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen, activeTab, exportSpeed, clips, videoSrc, trimStart, trimEnd, videoDuration]);

  const handleHiddenVideoTimeUpdate = () => {
    // 마스터 타임라인 루프에서 제어하므로 이중 시크 방지
  };

  // 실시간 0ms 캔버스 픽셀 렌더러 (크롭/트림/배속/화질/FPS/256색 팔레트 시각화)
  useEffect(() => {
    let animationFrameId: number;
    let lastRenderTime = 0;

    const render = (now: number) => {
      const video = hiddenVideoRef.current;
      if (video && video.readyState >= 2) {
        const targetFps = Number(GIF_FPS_OPTIONS[gifFpsIndex].value);
        const frameInterval = 1000 / targetFps;

        if (now - lastRenderTime >= frameInterval) {
          lastRenderTime = now;
          const qualityPercent = GIF_QUALITY_STEPS[gifQualityIndex];
          const scaleFactor = qualityPercent / 100;

          const baseW = video.videoWidth || 1920;
          const baseH = video.videoHeight || 1080;

          // 크롭 영역 좌표 계산 (isCropMode 및 cropArea 반영)
          let sx = 0;
          let sy = 0;
          let sw = baseW;
          let sh = baseH;

          if (isCropMode && cropArea) {
            sx = Math.max(0, Math.floor(cropArea.x * baseW));
            sy = Math.max(0, Math.floor(cropArea.y * baseH));
            sw = Math.max(16, Math.floor(cropArea.w * baseW));
            sh = Math.max(16, Math.floor(cropArea.h * baseH));
          }

          const targetW = Math.max(16, Math.floor(sw * scaleFactor));
          const targetH = Math.max(16, Math.floor(sh * scaleFactor));

          const isRotated90 = rotation === 90 || rotation === 270;
          const canvasW = isRotated90 ? targetH : targetW;
          const canvasH = isRotated90 ? targetW : targetH;

          if (targetDimensions.w !== canvasW || targetDimensions.h !== canvasH) {
            setTargetDimensions({ w: canvasW, h: canvasH });
          }

          const drawFrameToCanvas = (canvas: HTMLCanvasElement) => {
            if (canvas.width !== canvasW || canvas.height !== canvasH) {
              canvas.width = canvasW;
              canvas.height = canvasH;
            }
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.save();
              ctx.imageSmoothingEnabled = false;
              ctx.translate(canvasW / 2, canvasH / 2);
              ctx.rotate((rotation * Math.PI) / 180);
              ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
              ctx.drawImage(video, sx, sy, sw, sh, -targetW / 2, -targetH / 2, targetW, targetH);
              ctx.restore();
              if (gifFormat === "gif") {
                apply256ColorPalette(ctx, canvasW, canvasH);
              }
            }
          };

          // 1. 모달 메인 미리보기 캔버스 렌더링
          if (previewCanvasRef.current) {
            drawFrameToCanvas(previewCanvasRef.current);
          }

          // 2. 확대 미리보기 모달 캔버스 렌더링 (열려 있을 때)
          if (isEnlargedOpen && enlargedCanvasRef.current) {
            drawFrameToCanvas(enlargedCanvasRef.current);
          }
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    if (isOpen && activeTab === "gif") {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [
    isOpen,
    activeTab,
    gifFpsIndex,
    gifQualityIndex,
    gifFormat,
    isCropMode,
    cropArea,
    isEnlargedOpen,
    targetDimensions.w,
  ]);

  if (!isOpen) return null;

  const crfOption = CRF_OPTIONS[crfIndex];
  const fpsOption = FPS_OPTIONS[fpsIndex].value;
  const currentGifQuality = GIF_QUALITY_STEPS[gifQualityIndex];

  // 1. 원본 포맷 유지 (copy) 예상 용량 계산
  const getEstimatedCopySizeText = () => {
    if (!originalFileSize || !videoDuration || isNaN(videoDuration) || isNaN(trimDuration)) {
      return "계산 중...";
    }
    const ratio = trimDuration / videoDuration;
    const bytes = originalFileSize * ratio;
    if (bytes <= 0 || isNaN(bytes)) return "0.0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  // 2. 저장 옵션 (encode) 비디오 예상 용량 계산
  const getEstimatedEncodeSizeText = () => {
    if (!originalFileSize || !videoDuration || isNaN(videoDuration) || isNaN(trimDuration)) {
      return "계산 중...";
    }
    const effectiveTrimDuration = trimDuration / exportSpeed;
    const ratio = effectiveTrimDuration / videoDuration;
    
    let fpsMult = 1.0;
    if (fpsOption === "15") fpsMult = 0.6;
    else if (fpsOption === "24") fpsMult = 0.8;
    else if (fpsOption === "30") fpsMult = 0.85;
    else if (fpsOption === "60") fpsMult = 1.1;
    
    let crfMult = 1.0;
    if (crfOption === 18) crfMult = 1.2;
    else if (crfOption === 23) crfMult = 0.9;
    else if (crfOption === 28) crfMult = 0.45;
    else if (crfOption === 32) crfMult = 0.25;
    
    const cropMult = isCropMode ? Math.max(0.35, cropAreaRatio * 1.2) : 1.0;
    const multiplier = fpsMult * crfMult * cropMult;

    const bytes = originalFileSize * ratio * multiplier;
    if (bytes <= 0 || isNaN(bytes)) return "0.0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  // 3. 움짤 (GIF/WebP) 실시간 예상 용량 계산
  const getEstimatedGifSizeText = () => {
    if (!originalFileSize || !videoDuration || isNaN(videoDuration) || isNaN(trimDuration)) {
      return "계산 중...";
    }
    const effectiveTrimDuration = (trimDuration > 0 ? trimDuration : videoDuration) / exportSpeed;
    const ratio = effectiveTrimDuration / videoDuration;
    
    const targetFps = Number(GIF_FPS_OPTIONS[gifFpsIndex].value);
    const fpsMult = targetFps / 30;
    
    const qualityPercent = GIF_QUALITY_STEPS[gifQualityIndex];
    const qualityMult = Math.pow(qualityPercent / 100, 1.8);
    
    const cropMult = isCropMode ? Math.max(0.35, cropAreaRatio * 1.2) : 1.0;
    const formatMult = gifFormat === "webp" ? 0.45 : 1.05;

    const bytes = originalFileSize * ratio * fpsMult * qualityMult * cropMult * formatMult;
    if (bytes <= 0 || isNaN(bytes)) return "0.0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const handleExportClick = () => {
    const useCopy = activeTab === "video" && saveMode === "copy" && exportSpeed === 1.0;

    onExport({
      exportType: activeTab,
      fps: useCopy ? "original" : fpsOption,
      useCopy,
      crf: useCopy ? 23 : crfOption,
      exportSpeed,
      gifFps: GIF_FPS_OPTIONS[gifFpsIndex].value,
      gifQuality: currentGifQuality,
      gifFormat,
      audioBitrate,
      audioFormat
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
      {/* 캔버스 소스용 비디오 Element */}
      {videoSrc && (
        <video
          ref={hiddenVideoRef}
          src={videoSrc}
          onTimeUpdate={handleHiddenVideoTimeUpdate}
          muted
          playsInline
          autoPlay
          loop
          className="hidden"
        />
      )}

      {/* 클릭 시 설정 퍼센티지의 실제 픽셀 해상도 크기 대형 확대 모달 (Lightbox) */}
      {isEnlargedOpen && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-6 animate-fade-in cursor-pointer"
          onClick={() => setIsEnlargedOpen(false)}
        >
          <div
            className="relative rounded-2xl bg-neutral-900/90 border border-white/20 p-5 shadow-2xl flex flex-col gap-3 items-center max-w-4xl max-h-[90vh] overflow-auto text-white cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold tracking-wider">움짤 실제 픽셀 미리보기</h3>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                  {targetDimensions.w} x {targetDimensions.h} px ({currentGifQuality}%) • {GIF_FPS_OPTIONS[gifFpsIndex].label}
                </span>
              </div>
              <button
                onClick={() => setIsEnlargedOpen(false)}
                className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 설정된 퍼센티지의 실제 픽셀 규격 캔버스 출력 */}
            <div className="relative flex items-center justify-center p-2 rounded-xl bg-black/50 border border-white/10">
              <canvas
                ref={enlargedCanvasRef}
                style={{ imageRendering: "pixelated" }}
                className="max-w-full max-h-[70vh] object-contain rounded border border-white/10 shadow-2xl"
              />
            </div>

          </div>
        </div>
      )}

      {/* 메인 저장 설정 모달 창 */}
      <div className={`relative w-full transition-all duration-300 rounded-2xl bg-neutral-900 border border-white/10 p-6 shadow-2xl flex flex-col gap-4 text-white ${
        activeTab === "gif" ? "max-w-2xl" : "max-w-md"
      }`}>
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <h2 className="text-sm font-bold tracking-wider text-white/90">
            {isAudioOnly ? "오디오 추출 전용 설정" : activeTab === "gif" ? "움짤 전용 저장 설정" : activeTab === "audio" ? "오디오 추출 설정" : "비디오 저장 설정"}
          </h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-white/50 hover:text-white text-xs cursor-pointer disabled:cursor-not-allowed"
          >
            닫기
          </button>
        </div>

        {/* 추출 형식 탭 navigation (오디오 전용 모드에서는 숨김) */}
        {!isAudioOnly && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-white/50 font-medium">추출 형식</span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/5 border border-white/5">
              <button
                type="button"
                onClick={() => setActiveTab("video")}
                disabled={isExporting}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "video"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>비디오</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("gif")}
                disabled={isExporting}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "gif"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>움짤</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("audio")}
                disabled={isExporting}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "audio"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>오디오</span>
              </button>
            </div>
          </div>
        )}

        {/* 탭 1: 비디오 설정 */}
        {activeTab === "video" && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-white/50 font-medium">저장 방식 선택</span>
              <div className="flex flex-col gap-2">
                {/* 원본 포맷 유지 */}
                <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  isCropMode || exportSpeed !== 1.0
                    ? "opacity-40 cursor-not-allowed bg-neutral-800/30 border-transparent"
                    : saveMode === "copy"
                    ? "bg-indigo-500/10 border-indigo-500/40 cursor-pointer"
                    : "bg-white/5 border-white/5 hover:bg-white/10 cursor-pointer"
                }`}>
                  <input
                    type="radio"
                    name="saveMode"
                    value="copy"
                    checked={saveMode === "copy"}
                    onChange={() => {
                      setSaveMode("copy");
                      setExportSpeed(1.0);
                    }}
                    disabled={isExporting || isCropMode || exportSpeed !== 1.0}
                    className="accent-indigo-500 w-4 h-4 mt-0.5 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex flex-col flex-1 gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/95">원본 포맷 유지</span>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        {getEstimatedCopySizeText()}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/50">재인코딩 없음 (초고속 저장 & 무손실)</span>
                    {(isCropMode || exportSpeed !== 1.0) && (
                      <span className="text-[9px] text-indigo-300 font-medium leading-tight">
                        ※ {isCropMode ? "크롭" : "배속 변경"} 적용 시 재인코딩이 필요합니다.
                      </span>
                    )}
                  </div>
                </label>

                {/* 저장 옵션 인코딩 */}
                <label className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  saveMode === "encode" ? "bg-indigo-500/10 border-indigo-500/40" : "bg-white/5 border-white/5 hover:bg-white/10"
                }`}>
                  <input
                    type="radio"
                    name="saveMode"
                    value="encode"
                    checked={saveMode === "encode"}
                    onChange={() => setSaveMode("encode")}
                    disabled={isExporting}
                    className="accent-indigo-500 w-4 h-4 mt-0.5 cursor-pointer"
                  />
                  <div className="flex flex-col flex-1 gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/95">저장 옵션</span>
                      <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                        {getEstimatedEncodeSizeText()}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/50">화질, 프레임 커스텀 조절 후 저장</span>
                  </div>
                </label>
              </div>
            </div>

            {saveMode === "encode" && (
              <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-white/5 border border-white/5">
                {/* CRF 화질 슬라이더 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-300 font-medium tracking-tight">
                      {CRF_DESCRIPTIONS[crfIndex]}
                    </span>
                    <span className="text-[10px] font-mono text-white/40">CRF {crfOption}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={crfIndex}
                    disabled={isExporting}
                    onChange={(e) => setCrfIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* FPS 슬라이더 */}
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/50 font-medium">프레임레이트 (FPS)</span>
                    <span className="text-[10px] font-mono font-semibold text-indigo-300">
                      {FPS_OPTIONS[fpsIndex].label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={fpsIndex}
                    disabled={isExporting}
                    onChange={(e) => setFpsIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 2: 움짤 (GIF / WebP) 전용 저장 설정 (2단 패널: 컨트롤 + 0ms 실시간 캔버스 픽셀 미리보기) */}
        {activeTab === "gif" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            {/* 좌측: 움짤 설정 컨트롤 */}
            <div className="flex flex-col gap-3.5">
              {/* 1. 움짤 확장자 설정 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/50 font-medium">움짤 확장자 설정</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGifFormat("gif")}
                    disabled={isExporting}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      gifFormat === "gif"
                        ? "bg-indigo-500/10 border-indigo-500/50 text-white"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span>GIF (.gif)</span>
                      <span className="text-[9px] text-white/40 font-normal">범용 애니메이션</span>
                    </div>
                    {gifFormat === "gif" && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setGifFormat("webp")}
                    disabled={isExporting}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      gifFormat === "webp"
                        ? "bg-indigo-500/10 border-indigo-500/50 text-white"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span>WebP (.webp)</span>
                      <span className="text-[9px] text-white/40 font-normal">고화질 & 저용량</span>
                    </div>
                    {gifFormat === "webp" && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                </div>
              </div>

              {/* 2. 움짤 프레임레이트 및 화질 조절 */}
              <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-white/5 border border-white/5">
                {/* FPS 프레임 슬라이더 */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/50 font-medium">프레임레이트 (FPS)</span>
                    <span className="text-[10px] font-mono font-semibold text-indigo-300">
                      {GIF_FPS_OPTIONS[gifFpsIndex].label}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={GIF_FPS_OPTIONS.length - 1}
                    step={1}
                    value={gifFpsIndex}
                    disabled={isExporting}
                    onChange={(e) => setGifFpsIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* 화질 조정 8구간 슬라이더 (25% ~ 100%) */}
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-300 font-medium">
                      해상도/화질 조정 스케일
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                      {currentGifQuality}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={7}
                    step={1}
                    value={gifQualityIndex}
                    disabled={isExporting}
                    onChange={(e) => setGifQualityIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex items-center justify-between text-[9px] text-white/30 font-mono px-0.5">
                    <span>25%</span>
                    <span>55%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 우측: 0ms 실시간 캔버스 픽셀 미리보기 & 예상 용량 */}
            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/5 border border-white/5 justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white/90 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>실시간 픽셀 미리보기</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
                  {GIF_FPS_OPTIONS[gifFpsIndex].label} • {currentGifQuality}%
                </span>
              </div>

              {/* 실시간 0ms 캔버스 미리보기 박스 (클릭 시 원본 픽셀 확대 모달) */}
              <div
                onClick={() => setIsEnlargedOpen(true)}
                className="relative w-full h-36 bg-black/50 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center group cursor-pointer hover:border-indigo-500/50 transition-all shadow-inner"
              >
                <canvas
                  ref={previewCanvasRef}
                  style={{ imageRendering: "pixelated" }}
                  className="w-full h-full object-contain"
                />
                
                {/* 포맷 오버레이 배지 */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 border border-white/10 text-[9px] font-bold text-white/80 backdrop-blur-sm uppercase">
                  {gifFormat}
                </div>

                {/* Hover 시 확대 안내 오버레이 */}
                <div className="absolute inset-0 bg-indigo-950/40 opacity-0 group-hover:opacity-100 backdrop-blur-[2px] transition-all flex flex-col items-center justify-center gap-1 text-white z-20">
                  <ZoomIn className="w-5 h-5 text-indigo-300 animate-bounce" />
                  <span className="text-[10px] font-bold tracking-wide">클릭하여 실제 픽셀 크기로 확대</span>
                  <span className="text-[9px] font-mono text-indigo-200/80">({targetDimensions.w} x {targetDimensions.h} px)</span>
                </div>
              </div>

              {/* 실시간 예상 용량 배지 */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                <span className="text-xs font-semibold text-white/80">실시간 예상 용량</span>
                <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-md shadow-sm">
                  {getEstimatedGifSizeText()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 탭 3: 오디오 설정 */}
        {activeTab === "audio" && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            {/* 1. 포맷 선택 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-white/50 font-medium">오디오 포맷 설정</span>
              <div className="grid grid-cols-3 gap-1.5">
                {AUDIO_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    onClick={() => setAudioFormat(fmt.value)}
                    disabled={isExporting}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer gap-0.5 ${
                      audioFormat === fmt.value
                        ? "bg-indigo-500/10 border-indigo-500/50 text-white"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <span>{fmt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 음질 선택 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-white/50 font-medium">음질 선택</span>
              <div className="grid grid-cols-2 gap-2">
                {AUDIO_BITRATES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setAudioBitrate(b.value)}
                    disabled={isExporting}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      audioBitrate === b.value
                        ? "bg-indigo-500/10 border-indigo-500/50 text-white"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex flex-col items-start gap-0.5">
                      <span>{b.label}</span>
                      <span className="text-[9px] text-white/40 font-normal">{b.desc}</span>
                    </div>
                    {audioBitrate === b.value && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 하단 액션 버튼 */}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            onClick={handleExportClick}
            disabled={isExporting}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? "저장 중..." : "내보내기 실행"}
          </button>
        </div>

      </div>
    </div>
  );
};
