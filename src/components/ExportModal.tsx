import React, { useState, useEffect } from "react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalFileSize: number | null;
  trimDuration: number;
  videoDuration: number;
  onExport: (fps: string, useCopy: boolean, crf: number) => void;
  isExporting: boolean;
  isCropMode: boolean;
  cropAreaRatio: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  originalFileSize,
  trimDuration,
  videoDuration,
  onExport,
  isExporting,
  isCropMode,
  cropAreaRatio
}) => {
  // 저장 모드: "copy" (초고속 복사) 또는 "encode" (압축 및 인코딩)
  const [saveMode, setSaveMode] = useState<"copy" | "encode">("copy");
  const [fpsOption, setFpsOption] = useState<string>("original");
  const [crfOption, setCrfOption] = useState<number>(23); // 기본 CRF 값: 23

  // 크롭 활성화 시 인코딩 저장 강제
  useEffect(() => {
    if (isOpen && isCropMode) {
      setSaveMode("encode");
    }
  }, [isOpen, isCropMode]);

  if (!isOpen) return null;

  // 용량 예측 계산식 (압축률 계수 반영)
  const getEstimatedSizeText = () => {
    if (!originalFileSize || !videoDuration || isNaN(videoDuration) || isNaN(trimDuration)) {
      return "계산 중...";
    }
    const ratio = trimDuration / videoDuration;
    
    let multiplier = 1.0;
    if (saveMode === "encode") {
      // 30fps 인코딩 시 추가 보정
      const fpsMult = fpsOption === "30" ? 0.85 : 1.0;
      
      // CRF에 따른 파일 크기 가중치 보정
      let crfMult = 1.0;
      if (crfOption === 18) crfMult = 1.2;     // 초고화질
      else if (crfOption === 23) crfMult = 0.9; // 표준
      else if (crfOption === 28) crfMult = 0.45;// 용량 절약
      else if (crfOption === 32) crfMult = 0.25;// 최소 용량
      
      // 크롭 면적 비율 가중치 반영 (최소 하한선 0.35 설정하여 헤더/오디오 오차 보정)
      const cropMult = isCropMode ? Math.max(0.35, cropAreaRatio * 1.2) : 1.0;
      
      multiplier = fpsMult * crfMult * cropMult;
    }

    const bytes = originalFileSize * ratio * multiplier;
    if (bytes <= 0 || isNaN(bytes)) return "0.0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const handleExportClick = () => {
    const useCopy = saveMode === "copy";
    // 초고속 복사 시에는 fps="original", crf=23 강제 지정
    onExport(
      useCopy ? "original" : fpsOption,
      useCopy,
      useCopy ? 23 : crfOption
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
          <span className="text-[11px] text-white/50 font-medium">저장 방식</span>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              isCropMode
                ? "opacity-50 cursor-not-allowed bg-neutral-800/30 border-transparent"
                : saveMode === "copy"
                ? "bg-indigo-500/10 border-indigo-500/30 cursor-pointer"
                : "bg-white/5 border-white/5 hover:bg-white/10 cursor-pointer"
            }`}>
              <input
                type="radio"
                name="saveMode"
                value="copy"
                checked={saveMode === "copy"}
                onChange={() => setSaveMode("copy")}
                disabled={isExporting || isCropMode}
                className="accent-indigo-500 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white/90">원본 포맷 유지</span>
                <span className="text-[10px] text-emerald-400 font-medium">재인코딩 없음 (화질 저하 없음)</span>
                {isCropMode && (
                  <span className="text-[9px] text-indigo-300 mt-1 font-medium leading-tight">
                    ※ 크롭(화면 자르기)이 활성화되어 있어 재인코딩이 필요합니다.
                  </span>
                )}
              </div>
            </label>

            <label className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
              saveMode === "encode" ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/5 border-white/5 hover:bg-white/10"
            }`}>
              <input
                type="radio"
                name="saveMode"
                value="encode"
                checked={saveMode === "encode"}
                onChange={() => setSaveMode("encode")}
                disabled={isExporting}
                className="accent-indigo-500 w-4 h-4 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white/90">용량 압축 & 프레임 변환 (인코딩)</span>
                <span className="text-[10px] text-white/40">화질을 낮춰 용량을 절약하거나 프레임을 바꿉니다.</span>
              </div>
            </label>
          </div>
        </div>

        {/* 2. 세부 설정 (인코딩 모드일 때만 활성화) */}
        {saveMode === "encode" && (
          <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-white/5 border border-white/5 animate-fade-in">
            {/* FPS 설정 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-white/50 font-medium">프레임레이트 (FPS)</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-white/90 cursor-pointer">
                  <input
                    type="radio"
                    name="fps"
                    value="original"
                    checked={fpsOption === "original"}
                    onChange={() => setFpsOption("original")}
                    disabled={isExporting}
                    className="accent-indigo-500 w-3.5 h-3.5"
                  />
                  <span>프레임 유지</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-white/90 cursor-pointer">
                  <input
                    type="radio"
                    name="fps"
                    value="30"
                    checked={fpsOption === "30"}
                    onChange={() => setFpsOption("30")}
                    disabled={isExporting}
                    className="accent-indigo-500 w-3.5 h-3.5"
                  />
                  <span>30 FPS</span>
                </label>
              </div>
            </div>

            {/* 압축률 (CRF) 설정 */}
            <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
              <span className="text-[10px] text-white/50 font-medium">용량 압축 수준 (화질 결정)</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCrfOption(18)}
                  disabled={isExporting}
                  className={`py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                    crfOption === 18 ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-neutral-800 border-transparent hover:bg-neutral-700 text-white/70"
                  }`}
                >
                  초고화질 (CRF 18)
                </button>
                <button
                  type="button"
                  onClick={() => setCrfOption(23)}
                  disabled={isExporting}
                  className={`py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                    crfOption === 23 ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-neutral-800 border-transparent hover:bg-neutral-700 text-white/70"
                  }`}
                >
                  균형 표준 (CRF 23)
                </button>
                <button
                  type="button"
                  onClick={() => setCrfOption(28)}
                  disabled={isExporting}
                  className={`py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                    crfOption === 28 ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-neutral-800 border-transparent hover:bg-neutral-700 text-white/70"
                  }`}
                >
                  용량 절약 (CRF 28)
                </button>
                <button
                  type="button"
                  onClick={() => setCrfOption(32)}
                  disabled={isExporting}
                  className={`py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                    crfOption === 32 ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-neutral-800 border-transparent hover:bg-neutral-700 text-white/70"
                  }`}
                >
                  최소 용량 (CRF 32)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. 용량 정보 */}
        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-white/50 font-medium">저장 후 예상 용량</span>
            <span className="text-xs font-bold text-white/95 mt-0.5">
              {getEstimatedSizeText()}
            </span>
          </div>
        </div>

        {/* 4. 하단 액션 버튼 */}
        <div className="flex items-center gap-2 mt-2">
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
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isExporting ? "저장 중..." : "저장하기"}
          </button>
        </div>

      </div>
    </div>
  );
};
