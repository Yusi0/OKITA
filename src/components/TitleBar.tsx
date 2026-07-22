import React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

interface TitleBarProps {
  fileName?: string | null;
}

export const TitleBar: React.FC<TitleBarProps> = ({ fileName }) => {
  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (e) {
      console.error("Failed to minimize window:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
    } catch (e) {
      console.error("Failed to maximize window:", e);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between w-full h-10 select-none bg-black/10 backdrop-blur-sm border-b border-white/5 text-white/80 z-50 px-4"
      style={{ fontFamily: "Segoe UI, sans-serif" }}
    >
      {/* App Logo & Title */}
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none max-w-[70%] truncate">
        <img src="/icon.png" className="w-4 h-4 rounded-md flex-shrink-0 object-contain shadow-sm" alt="App Icon" />
        <span className="text-xs font-semibold tracking-wider text-white/90 truncate">
          OKITA CANVAS{fileName ? ` - ${fileName}` : ""}
        </span>
      </div>

      {/* Drag handle middle spacer */}
      <div data-tauri-drag-region className="flex-1 h-full"></div>

      {/* Window Controls */}
      <div className="flex items-center h-full">
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-11 h-10 transition-colors duration-150 hover:bg-white/10 active:bg-white/5 cursor-pointer"
          title="최소화"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-11 h-10 transition-colors duration-150 hover:bg-white/10 active:bg-white/5 cursor-pointer"
          title="최대화"
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-10 transition-colors duration-150 hover:bg-red-600 hover:text-white active:bg-red-700 cursor-pointer"
          title="닫기"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
};
