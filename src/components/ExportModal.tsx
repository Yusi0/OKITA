import React, { useState, useEffect } from "react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalFileSize: number | null;
  trimDuration: number;
  videoDuration: number;
  onExport: (fps: string, useCopy: boolean, crf: number, exportSpeed: number) => void;
  isExporting: boolean;
  isCropMode: boolean;
  cropAreaRatio: number;
  initialExportSpeed?: number;
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
  initialExportSpeed = 1.0
}) => {
  // 저장 모드: "copy" (초고속 복사) 또는 "encode" (저장 옵션 인코딩)
  const [saveMode, setSaveMode] = useState<"copy" | "encode">("copy");
  const [fpsIndex, setFpsIndex] = useState<number>(4); // 기본값: 원본 프레임 (index 4)
  const [crfIndex, setCrfIndex] = useState<number>(1); // 기본값: CRF 23 (index 1)
  const [exportSpeed, setExportSpeed] = useState<number>(initialExportSpeed); // 출력 속도 (배속)

  // 모달이 열리거나 초기 배속/크롭 정보가 들어올 때 설정 동기화
  useEffect(() => {
    if (isOpen) {
      setExportSpeed(initialExportSpeed);
      if (isCropMode || initialExportSpeed !== 1.0) {
        setSaveMode("encode");
      }
    }
  }, [isOpen, isCropMode, initialExportSpeed]);

  if (!isOpen) return null;

  const crfOption = CRF_OPTIONS[crfIndex];
  const fpsOption = FPS_OPTIONS[fpsIndex].value;

  // 1. 원본 포맷 유지 (copy) 시 예상 용량 계산
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

  // 2. 저장 옵션 (encode) 적용 시 예상 용량 계산
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

  const handleExportClick = () => {
    const useCopy = saveMode === "copy" && exportSpeed === 1.0;
    // 초고속 복사 시에는 fps="original", crf=23 강제 지정
    onExport(
      useCopy ? "original" : fpsOption,
      useCopy,
      useCopy ? 23 : crfOption,
      exportSpeed
    );
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-neutral-900 border border-white/10 p-6 shadow-2xl flex flex-col gap-4 text-white">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <h2 className="text-sm font-semibold tracking-wider">비디오 저장 및 압축 설정</h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-white/50 hover:text-white text-xs cursor-pointer disabled:cursor-not-allowed"
          >
            닫기
          </button>
        </div>

        {/* 1. 저장 방식 선택 */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-white/50 font-medium">저장 방식 선택</span>
          <div className="flex flex-col gap-2">
            
            {/* 방식 1: 원본 포맷 유지 */}
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

            {/* 방식 2: 저장 옵션 */}
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

        {/* 2. 세부 저장 옵션 (인코딩 모드일 때만 활성화) */}
        {saveMode === "encode" && (
          <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-white/5 border border-white/5 animate-fade-in">
            
            {/* CRF 화질 슬라이더 */}
            <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2.5">
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

            {/* FPS 프레임 슬라이더 */}
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

        {/* 3. 하단 액션 버튼 */}
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
