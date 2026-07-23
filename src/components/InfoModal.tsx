import React, { useState, useEffect } from "react";
import { Keyboard, Info, ExternalLink, X, Heart, Code2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "keybinds" | "about";
}

const KEYBINDS = [
  { key: "Space / K", desc: "재생 및 일시정지" },
  { key: "← / →", desc: "5초 이동" },
  { key: "Ctrl + ← / →", desc: "초 단위 이동" },
  { key: "Shift + ← / →", desc: "프레임 이동" },
  { key: "Delete / Backspace", desc: "선택한 클립 삭제" },
  { key: "Ctrl + Z", desc: "되돌리기" },
  { key: "Ctrl + Shift + Z / Ctrl + Y", desc: "다시 실행" },
  { key: "C", desc: "현재 플레이헤드에서 분할" },
  { key: "R", desc: "90도 시계방향 회전" },
  { key: "H", desc: "좌우 거울 반전" },
  { key: "F / 더블 클릭", desc: "전체 화면" },
];

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  initialTab = "keybinds"
}) => {
  const [activeTab, setActiveTab] = useState<"keybinds" | "about">(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleOpenGithub = async () => {
    try {
      await openUrl("https://github.com/Yusi0/OKITA/");
    } catch (err) {
      console.error("Failed to open URL:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-white/10 p-6 shadow-2xl flex flex-col gap-5 text-white animate-in zoom-in-95 duration-150">

        {/* 상단 헤더 및 탭 */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("keybinds")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "keybinds"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>단축키 목록</span>
            </button>

            <button
              onClick={() => setActiveTab("about")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "about"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>앱 정보 & 제작자</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 탭 1: 단축키 목록 (Keybinds) */}
        {activeTab === "keybinds" && (
          <div className="flex flex-col gap-3.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/90">기본 키보드 단축키</span>
              <span className="text-[10px] text-white/40 font-medium">※ 현재 고정 단축키 커스텀 불가능</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1 text-xs">
              {KEYBINDS.map((kb, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <span className="text-white/70 font-medium">{kb.desc}</span>
                  <kbd className="px-2 py-1 rounded-lg bg-neutral-950 border border-white/10 text-indigo-300 font-mono text-[11px] font-semibold shadow-inner">
                    {kb.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 탭 2: 제작자 & 깃허브 레포지토리 (About & Creator Info) */}
        {activeTab === "about" && (
          <div className="flex flex-col items-center gap-5 py-2 text-center animate-fade-in">
            {/* 앱 로고 아이콘 디스플레이 */}
            <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-neutral-950/80 shadow-xl shadow-indigo-600/20 border border-white/10 overflow-hidden">
              <img src="/icon.png" className="w-full h-full object-cover" alt="OKITA Logo" />
            </div>

            {/* 타이틀 및 버전 */}
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-lg font-bold tracking-wider text-white">OKITA Canvas</h2>
              <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                v0.2.1
              </span>
            </div>

            {/* 대표 설명 */}
            <p className="text-xs text-white/60 leading-relaxed max-w-sm">
              고속 멀티 미디어 플레이어.
            </p>

            {/* 제작자 & 깃허브 링크 카드 */}
            <div className="w-full flex flex-col gap-2 p-4 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-indigo-400" />
                  <span>개발자 (Creator)</span>
                </span>
                <span className="font-bold text-white tracking-wide bg-indigo-500/20 px-2.5 py-0.5 rounded-md border border-indigo-500/30">
                  Yusi0
                </span>
              </div>

              <div className="border-t border-white/5 my-1" />

              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>공식 GitHub 저장소</span>
                </span>
                <button
                  onClick={handleOpenGithub}
                  className="flex items-center gap-1.5 font-semibold text-indigo-300 hover:text-white transition-colors cursor-pointer group"
                >
                  <span className="underline decoration-indigo-400/50 group-hover:decoration-white">
                    https://github.com/Yusi0/OKITA/
                  </span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 하단 닫기 버튼 */}
        <div className="flex justify-end pt-2 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-all cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
