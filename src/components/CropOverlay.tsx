import React from "react";
import { RotateCw, FlipHorizontal } from "lucide-react";

interface CropOverlayProps {
  videoRect: DOMRect | null;
  cropArea: { x: number; y: number; w: number; h: number };
  onChange: (crop: { x: number; y: number; w: number; h: number }) => void;
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  onRotate?: () => void;
  onFlipH?: () => void;
  flipH?: boolean;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  videoRect,
  cropArea,
  onChange,
  aspectRatio,
  onAspectRatioChange,
  onRotate,
  onFlipH,
  flipH = false
}) => {
  if (!videoRect) return null;

  const { width: containerWidth, height: containerHeight } = videoRect;

  // 비율 값 수치 변환
  const getRatioVal = () => {
    if (aspectRatio === "1:1") return 1.0;
    if (aspectRatio === "16:9") return 16 / 9;
    if (aspectRatio === "4:3") return 4 / 3;
    if (aspectRatio === "9:16") return 9 / 16;
    return null;
  };

  const ratioVal = getRatioVal();

  // 비율 변경 시 현재 위치 기준 스냅 처리
  const handleRatioSelect = (newRatio: string) => {
    onAspectRatioChange(newRatio);
    if (newRatio === "free") return;

    const snapVal = newRatio === "1:1" ? 1.0 : newRatio === "16:9" ? 16 / 9 : newRatio === "4:3" ? 4 / 3 : 9 / 16;
    const pixelRatio = containerWidth / containerHeight;
    const targetWHRatio = snapVal / pixelRatio;

    let nextW = cropArea.w;
    let nextH = nextW / targetWHRatio;

    // 만약 세로 비율 환산치가 화면을 벗어나면 세로 기준으로 다시 맞춤
    if (nextH > 1) {
      nextH = cropArea.h;
      nextW = nextH * targetWHRatio;
      if (nextW > 1) {
        nextW = 1;
        nextH = nextW / targetWHRatio;
      }
    }

    const centerX = cropArea.x + cropArea.w / 2;
    const centerY = cropArea.y + cropArea.h / 2;

    let nextX = centerX - nextW / 2;
    let nextY = centerY - nextH / 2;

    // 경계 가두기
    if (nextX < 0) nextX = 0;
    if (nextY < 0) nextY = 0;
    if (nextX + nextW > 1) nextX = 1 - nextW;
    if (nextY + nextH > 1) nextY = 1 - nextH;

    onChange({ x: nextX, y: nextY, w: nextW, h: nextH });
  };

  // 1. 크롭박스 전체 드래그 이동 처리
  const handleBoxDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = cropArea.x;
    const startTop = cropArea.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / containerWidth;
      const dy = (moveEvent.clientY - startY) / containerHeight;

      let nextX = Math.max(0, Math.min(1 - cropArea.w, startLeft + dx));
      let nextY = Math.max(0, Math.min(1 - cropArea.h, startTop + dy));

      onChange({ ...cropArea, x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 2. 모서리 및 경계 조절 핸들 드래그 처리
  const handleResizeStart = (handle: string, startE: React.MouseEvent) => {
    startE.preventDefault();
    startE.stopPropagation();

    const startX = startE.clientX;
    const startY = startE.clientY;
    
    const startLeft = cropArea.x;
    const startTop = cropArea.y;
    const startWidth = cropArea.w;
    const startHeight = cropArea.h;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / containerWidth;
      const dy = (moveEvent.clientY - startY) / containerHeight;

      let nextLeft = startLeft;
      let nextTop = startTop;
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      // [기본 리사이즈 계산]
      if (handle.includes("r")) {
        nextWidth = Math.max(0.05, startWidth + dx);
      }
      if (handle.includes("l")) {
        const potentialWidth = startWidth - dx;
        if (potentialWidth >= 0.05) {
          nextLeft = Math.max(0, startLeft + dx);
          nextWidth = startWidth + (startLeft - nextLeft);
        }
      }
      if (handle.includes("b")) {
        nextHeight = Math.max(0.05, startHeight + dy);
      }
      if (handle.includes("t")) {
        const potentialHeight = startHeight - dy;
        if (potentialHeight >= 0.05) {
          nextTop = Math.max(0, startTop + dy);
          nextHeight = startHeight + (startTop - nextTop);
        }
      }

      // [종횡비 제한 보정]
      if (ratioVal) {
        const pixelRatio = containerWidth / containerHeight;
        const targetWHRatio = ratioVal / pixelRatio;

        if (handle === "r" || handle === "l" || handle === "br" || handle === "bl") {
          // 가로폭 수정에 따라 높이 비율 제한
          nextHeight = nextWidth / targetWHRatio;
          if (handle.includes("t")) {
            nextTop = startTop + startHeight - nextHeight;
          }
        } else if (handle === "b" || handle === "t" || handle === "tr" || handle === "tl") {
          // 세로폭 수정에 따라 너비 비율 제한
          nextWidth = nextHeight * targetWHRatio;
          if (handle.includes("l")) {
            nextLeft = startLeft + startWidth - nextWidth;
          }
        }
      }

      // [경계면 이탈 한계 방지 바운딩]
      if (nextLeft < 0) nextLeft = 0;
      if (nextTop < 0) nextTop = 0;
      
      if (nextLeft + nextWidth > 1) {
        nextWidth = 1 - nextLeft;
        if (ratioVal) {
          const pixelRatio = containerWidth / containerHeight;
          nextHeight = nextWidth / (ratioVal / pixelRatio);
          if (handle.includes("t")) {
            nextTop = startTop + startHeight - nextHeight;
          }
        }
      }

      if (nextTop + nextHeight > 1) {
        nextHeight = 1 - nextTop;
        if (ratioVal) {
          const pixelRatio = containerWidth / containerHeight;
          nextWidth = nextHeight * (ratioVal / pixelRatio);
          if (handle.includes("l")) {
            nextLeft = startLeft + startWidth - nextWidth;
          }
        }
      }

      onChange({ x: nextLeft, y: nextTop, w: nextWidth, h: nextHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // 퍼센트를 픽셀 좌표값으로 환산
  const boxLeft = cropArea.x * containerWidth;
  const boxTop = cropArea.y * containerHeight;
  const boxWidth = cropArea.w * containerWidth;
  const boxHeight = cropArea.h * containerHeight;

  return (
    <div
      className="absolute pointer-events-auto select-none"
      style={{
        left: `${videoRect.x}px`, // absolute container 상에서의 left 오프셋
        top: `${videoRect.y}px`,  // absolute container 상에서의 top 오프셋
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex: 35
      }}
    >
      {/* 1. iOS 스타일 회전 / 반전 / 비율 설정 플로팅 툴바 */}
      <div className="absolute -top-13 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-2xl bg-neutral-900/95 border border-white/10 shadow-2xl backdrop-blur-xl text-xs text-white/80 z-50">
        {onRotate && (
          <button
            type="button"
            onClick={onRotate}
            title="90도 시계방향 회전 (R)"
            className="p-1.5 rounded-xl hover:bg-white/10 active:bg-white/5 text-white/70 hover:text-white transition-all cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        )}
        {onFlipH && (
          <button
            type="button"
            onClick={onFlipH}
            title="좌우 거울 반전 (H)"
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              flipH ? "bg-indigo-600/80 text-white font-medium" : "hover:bg-white/10 text-white/70 hover:text-white"
            }`}
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
        )}

        <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

        <span className="px-1.5 text-[11px] text-white/40 font-medium select-none">비율:</span>
        {(["free", "1:1", "16:9", "4:3", "9:16"] as const).map((ratio) => (
          <button
            key={ratio}
            type="button"
            onClick={() => handleRatioSelect(ratio)}
            className={`px-2 py-1 text-[11px] rounded-lg cursor-pointer transition-all ${
              aspectRatio === ratio ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30" : "hover:bg-white/10 text-white/60 hover:text-white"
            }`}
          >
            {ratio === "free" ? "자유" : ratio}
          </button>
        ))}
      </div>

      {/* 2. 외곽 영역 반투명 마스킹 레이어 (SVG Path Subtraction) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none select-none">
        <path
          fill="rgba(0, 0, 0, 0.65)"
          fillRule="evenodd"
          d={`M 0 0 H ${containerWidth} V ${containerHeight} H 0 Z M ${boxLeft} ${boxTop} h ${boxWidth} v ${boxHeight} h ${-boxWidth} Z`}
        />
      </svg>

      {/* 3. 크롭 사각형 포커스 영역 */}
      <div
        className="absolute border border-indigo-400 cursor-move"
        style={{
          left: `${boxLeft}px`,
          top: `${boxTop}px`,
          width: `${boxWidth}px`,
          height: `${boxHeight}px`
        }}
        onMouseDown={handleBoxDragStart}
      >
        {/* 그리드 가이드라인 */}
        <div className="absolute inset-0 border border-white/15 pointer-events-none grid grid-cols-3 grid-rows-3">
          <div className="border-r border-b border-white/10"></div>
          <div className="border-r border-b border-white/10"></div>
          <div className="border-b border-white/10"></div>
          <div className="border-r border-b border-white/10"></div>
          <div className="border-r border-b border-white/10"></div>
          <div className="border-b border-white/10"></div>
          <div className="border-r border-white/10"></div>
          <div className="border-r border-white/10"></div>
          <div></div>
        </div>

        {/* 4. 리사이즈 핸들 조절점 */}
        {/* 모서리 핸들 (Corners) */}
        <div
          className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm cursor-nwse-resize z-10"
          onMouseDown={(e) => handleResizeStart("tl", e)}
        />
        <div
          className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm cursor-nesw-resize z-10"
          onMouseDown={(e) => handleResizeStart("tr", e)}
        />
        <div
          className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm cursor-nesw-resize z-10"
          onMouseDown={(e) => handleResizeStart("bl", e)}
        />
        <div
          className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm cursor-nwse-resize z-10"
          onMouseDown={(e) => handleResizeStart("br", e)}
        />

        {/* 경계선 핸들 (Edges) */}
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border border-indigo-500 rounded-full cursor-ns-resize z-10"
          onMouseDown={(e) => handleResizeStart("t", e)}
        />
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border border-indigo-500 rounded-full cursor-ns-resize z-10"
          onMouseDown={(e) => handleResizeStart("b", e)}
        />
        <div
          className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-4 bg-white border border-indigo-500 rounded-full cursor-ew-resize z-10"
          onMouseDown={(e) => handleResizeStart("l", e)}
        />
        <div
          className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-4 bg-white border border-indigo-500 rounded-full cursor-ew-resize z-10"
          onMouseDown={(e) => handleResizeStart("r", e)}
        />
      </div>
    </div>
  );
};
