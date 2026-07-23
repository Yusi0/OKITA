import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Gauge,
  Keyboard,
  Info,
  Check,
  ChevronRight,
  FlipHorizontal
} from "lucide-react";
import { TOOLTIPS } from "../constants/tooltips";

interface ContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  playbackSpeed: number;
  isEditMode?: boolean;
  isFlipped?: boolean;
  onToggleFlip?: () => void;
  onCaptureFrame: () => void;
  onPlaybackSpeedChange: (speed: number) => void;
  onOpenInfoModal: (tab: "keybinds" | "about") => void;
}

const SPEED_OPTIONS = [0.5, 1.0, 1.25, 1.5, 2.0];

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  isOpen,
  onClose,
  playbackSpeed,
  isEditMode,
  isFlipped,
  onToggleFlip,
  onCaptureFrame,
  onPlaybackSpeedChange,
  onOpenInfoModal,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showSpeedSubmenu, setShowSpeedSubmenu] = useState(false);

  // 마우스 위치가 화면 경계를 벗어나지 않도록 좌표 동기 계산
  const getAdjustedPos = () => {
    const menuWidth = 224;
    const menuHeight = 180;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > winW - 10) {
      adjustedX = winW - menuWidth - 10;
    }
    if (y + menuHeight > winH - 10) {
      adjustedY = winH - menuHeight - 10;
    }

    return {
      left: Math.max(10, adjustedX),
      top: Math.max(10, adjustedY),
    };
  };

  const pos = getAdjustedPos();

  // 오픈 시 서브메뉴 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setShowSpeedSubmenu(false);
    }
  }, [isOpen]);

  // 바깥 클릭 및 ESC 키 처리
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      className="fixed z-50 w-56 p-1.5 rounded-2xl bg-neutral-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl text-white text-xs select-none flex flex-col gap-0.5"
    >
      {/* 1. 장면 캡처 */}
      <button
        onClick={() => {
          onCaptureFrame();
          onClose();
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 transition-all text-white/80 hover:text-white cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Camera className="w-4 h-4 text-white/60" />
          <span>{TOOLTIPS.contextMenu.captureFrame}</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white/40 font-mono">S</kbd>
      </button>

      {/* 2. 수평 반전 (재생 상태 전용) */}
      {!isEditMode && onToggleFlip && (
        <button
          onClick={() => {
            onToggleFlip();
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 transition-all text-white/80 hover:text-white cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <FlipHorizontal className="w-4 h-4 text-white/60" />
            <span>{TOOLTIPS.contextMenu.flipHorizontal}</span>
          </div>
          {isFlipped && <Check className="w-3.5 h-3.5 text-indigo-400" />}
        </button>
      )}

      {/* 2. 재생 속도 메뉴 */}
      <div
        className="relative"
        onMouseEnter={() => setShowSpeedSubmenu(true)}
        onMouseLeave={() => setShowSpeedSubmenu(false)}
      >
        <button
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 transition-all text-white/80 hover:text-white cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Gauge className="w-4 h-4 text-white/60" />
            <span>{TOOLTIPS.contextMenu.playbackSpeed} ({playbackSpeed}x)</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/40" />
        </button>

        {/* 재생 속도 Sub-menu */}
        {showSpeedSubmenu && (
          <div className="absolute left-full top-0 ml-1 w-32 p-1.5 rounded-2xl bg-neutral-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => {
                  onPlaybackSpeedChange(speed);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  playbackSpeed === speed
                    ? "bg-indigo-600/80 text-white font-semibold"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{speed}x</span>
                {playbackSpeed === speed && <Check className="w-3 h-3 text-white" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-white/5" />

      {/* 3. 단축키 안내 */}
      <button
        onClick={() => {
          onOpenInfoModal("keybinds");
          onClose();
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 transition-all text-white/80 hover:text-white cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Keyboard className="w-4 h-4 text-white/60" />
          <span>{TOOLTIPS.contextMenu.keybinds}</span>
        </div>
      </button>

      {/* 4. 정보 & 제작자 (Yusi0) */}
      <button
        onClick={() => {
          onOpenInfoModal("about");
          onClose();
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10 transition-all text-white/80 hover:text-white cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-white/60" />
          <span>{TOOLTIPS.contextMenu.about}</span>
        </div>
        <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">Yusi0</span>
      </button>
    </div>
  );
};
