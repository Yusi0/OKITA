import React from "react";

interface CropOverlayProps {
  videoRect: DOMRect | null;
  cropArea: { x: number; y: number; w: number; h: number };
  onChange: (crop: { x: number; y: number; w: number; h: number }) => void;
  aspectRatio: string;
  onAspectRatioChange?: (ratio: string) => void;
  onRotate?: () => void;
  onFlipH?: () => void;
  rotation?: number;
  flipH?: boolean;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  videoRect,
  cropArea,
  onChange,
  aspectRatio,
  onAspectRatioChange: _onAspectRatioChange,
  onRotate: _onRotate,
  onFlipH: _onFlipH,
  rotation = 0,
  flipH = false
}) => {
  if (!videoRect) return null;

  const { width: containerWidth, height: containerHeight } = videoRect;

  // 회전 및 반전 각도에 따른 화면 마우스 벡터 -> 로컬 트랜스폼 좌표 변환 헬퍼 (Inverse Rotation Vector)
  const getLocalMouseDelta = (screenDx: number, screenDy: number) => {
    let localDx = screenDx;
    let localDy = screenDy;

    if (rotation === 90) {
      localDx = screenDy;
      localDy = -screenDx;
    } else if (rotation === 180) {
      localDx = -screenDx;
      localDy = -screenDy;
    } else if (rotation === 270) {
      localDx = -screenDy;
      localDy = screenDx;
    }

    if (flipH) {
      localDx = -localDx;
    }

    return { dx: localDx, dy: localDy };
  };

  // 회전 각도(rotation)에 따른 화면 기준 커서(Cursor) 방향 동적 매핑 헬퍼
  const getRotatedCursor = (handle: string) => {
    const isRotated90or270 = rotation === 90 || rotation === 270;

    switch (handle) {
      case "t":
      case "b":
        return isRotated90or270 ? "ew-resize" : "ns-resize";

      case "l":
      case "r":
        return isRotated90or270 ? "ns-resize" : "ew-resize";

      case "tl":
      case "br":
        return isRotated90or270 ? "nesw-resize" : "nwse-resize";

      case "tr":
      case "bl":
        return isRotated90or270 ? "nwse-resize" : "nesw-resize";

      default:
        return "move";
    }
  };

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
  React.useEffect(() => {
    if (aspectRatio === "free") return;

    const isRotated90 = rotation === 90 || rotation === 270;
    let snapVal = aspectRatio === "1:1" ? 1.0 : aspectRatio === "16:9" ? 16 / 9 : aspectRatio === "4:3" ? 4 / 3 : 9 / 16;
    if (isRotated90) {
      snapVal = 1 / snapVal;
    }

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
  }, [aspectRatio, containerWidth, containerHeight, rotation]);

  // 1. 크롭박스 전체 드래그 이동 처리
  const handleBoxDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = cropArea.x;
    const startTop = cropArea.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const screenDx = (moveEvent.clientX - startX) / containerWidth;
      const screenDy = (moveEvent.clientY - startY) / containerHeight;
      const { dx, dy } = getLocalMouseDelta(screenDx, screenDy);

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
      const screenDx = (moveEvent.clientX - startX) / containerWidth;
      const screenDy = (moveEvent.clientY - startY) / containerHeight;
      const { dx, dy } = getLocalMouseDelta(screenDx, screenDy);

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
      const isRotated90 = rotation === 90 || rotation === 270;
      const effectiveRatioVal = (ratioVal && isRotated90) ? (1 / ratioVal) : ratioVal;

      if (effectiveRatioVal) {
        const pixelRatio = containerWidth / containerHeight;
        const targetWHRatio = effectiveRatioVal / pixelRatio;

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
        if (effectiveRatioVal) {
          const pixelRatio = containerWidth / containerHeight;
          nextHeight = nextWidth / (effectiveRatioVal / pixelRatio);
          if (handle.includes("t")) {
            nextTop = startTop + startHeight - nextHeight;
          }
        }
      }

      if (nextTop + nextHeight > 1) {
        nextHeight = 1 - nextTop;
        if (effectiveRatioVal) {
          const pixelRatio = containerWidth / containerHeight;
          nextWidth = nextHeight * (effectiveRatioVal / pixelRatio);
          if (handle.includes("l")) {
            nextLeft = startLeft + startWidth - nextWidth;
          }
        }
      }

      onChange({
        x: nextLeft,
        y: nextTop,
        w: nextWidth,
        h: nextHeight
      });
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
      {/* 1. 외곽 영역 반투명 마스킹 레이어 (SVG Path Subtraction) */}
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

        {/* 4. 리사이즈 핸들 조절점 (동적 커서 매핑 적용) */}
        {/* 모서리 핸들 (Corners) */}
        <div
          className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm z-10"
          style={{ cursor: getRotatedCursor("tl") }}
          onMouseDown={(e) => handleResizeStart("tl", e)}
        />
        <div
          className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm z-10"
          style={{ cursor: getRotatedCursor("tr") }}
          onMouseDown={(e) => handleResizeStart("tr", e)}
        />
        <div
          className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm z-10"
          style={{ cursor: getRotatedCursor("bl") }}
          onMouseDown={(e) => handleResizeStart("bl", e)}
        />
        <div
          className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-500 rounded-sm z-10"
          style={{ cursor: getRotatedCursor("br") }}
          onMouseDown={(e) => handleResizeStart("br", e)}
        />

        {/* 경계선 핸들 (Edges) */}
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border border-indigo-500 rounded-full z-10"
          style={{ cursor: getRotatedCursor("t") }}
          onMouseDown={(e) => handleResizeStart("t", e)}
        />
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-white border border-indigo-500 rounded-full z-10"
          style={{ cursor: getRotatedCursor("b") }}
          onMouseDown={(e) => handleResizeStart("b", e)}
        />
        <div
          className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-4 bg-white border border-indigo-500 rounded-full z-10"
          style={{ cursor: getRotatedCursor("l") }}
          onMouseDown={(e) => handleResizeStart("l", e)}
        />
        <div
          className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-4 bg-white border border-indigo-500 rounded-full z-10"
          style={{ cursor: getRotatedCursor("r") }}
          onMouseDown={(e) => handleResizeStart("r", e)}
        />
      </div>
    </div>
  );
};
