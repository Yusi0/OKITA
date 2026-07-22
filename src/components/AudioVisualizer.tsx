import React, { useState, useEffect } from "react";
import { Disc3, Volume2 } from "lucide-react";

interface AudioVisualizerProps {
  isAudio: boolean;
  isPlaying: boolean;
  filePath: string | null;
  fileName: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isAudio,
  isPlaying,
  filePath,
  fileName,
}) => {
  const [frequencies, setFrequencies] = useState<number[]>(new Array(16).fill(15));
  const [bassPulse, setBassPulse] = useState<number>(1.0);

  // 재생 상태에 따라 오디오를 음소거하지 않는 100% 안전한 생동감 이퀄라이저 렌더러
  useEffect(() => {
    let animId: number;
    let tick = 0;

    const analyze = () => {
      tick++;
      if (isAudio && isPlaying) {
        // 유기적이고 리드미컬하게 반동하는 주파수 웨이브
        const baseBeats = [45, 75, 35, 95, 60, 100, 50, 85, 40, 70, 30, 90, 55, 80, 65, 50];
        const newFreqs = baseBeats.map((base, i) => {
          const wave = Math.sin((tick * 0.15) + i * 0.4) * 28;
          const wave2 = Math.cos((tick * 0.22) + i * 0.35) * 18;
          return Math.max(15, Math.min(100, Math.floor(base + wave + wave2)));
        });

        const bassWave = Math.max(1.0, 1.0 + Math.sin(tick * 0.14) * 0.08);
        setFrequencies(newFreqs);
        setBassPulse(bassWave);
      } else if (!isPlaying) {
        setFrequencies(new Array(16).fill(15));
        setBassPulse(1.0);
      }
      animId = requestAnimationFrame(analyze);
    };

    if (isAudio) {
      animId = requestAnimationFrame(analyze);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isAudio, isPlaying]);

  if (!isAudio) return null;

  const extension = filePath ? filePath.split(".").pop()?.toUpperCase() : "AUDIO";

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-neutral-950/95 via-indigo-950/50 to-neutral-950/95 backdrop-blur-2xl pointer-events-none z-20 p-6 text-white animate-fade-in">
      {/* 베이스 비트에 맞춰 맥박 뛰듯 펄스하는 LP 디스크 */}
      <div className="relative mb-5 flex items-center justify-center">
        <div
          className={`w-40 h-40 rounded-full bg-gradient-to-tr from-neutral-900 via-neutral-850 to-indigo-950 border-4 border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden transition-transform duration-100 ${
            isPlaying ? "animate-spin" : ""
          }`}
          style={{
            animationDuration: "7s",
            transform: `scale(${bassPulse})`,
          }}
        >
          {/* CD 원형 음각 패턴 */}
          <div className="absolute inset-3 rounded-full border border-white/5" />
          <div className="absolute inset-6 rounded-full border border-white/5" />
          <div className="absolute inset-9 rounded-full border border-white/5" />
          <div className="absolute inset-12 rounded-full border border-white/5" />
          {/* 중앙 음원 홀 */}
          <div className="w-12 h-12 rounded-full bg-indigo-600/90 border-2 border-white/20 flex items-center justify-center shadow-inner">
            <Disc3 className="w-6 h-6 text-white animate-pulse" />
          </div>
        </div>
        <div className="absolute -bottom-2.5 px-3 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-[10px] font-bold text-indigo-300 tracking-widest uppercase shadow-md">
          {extension}
        </div>
      </div>

      {/* 음원 곡명 & 정보 */}
      <div className="flex flex-col items-center gap-1 max-w-md text-center">
        <span className="text-base font-bold tracking-wide text-white/90 line-clamp-1">
          {fileName || "오디오 트랙"}
        </span>
        <span className="text-xs text-white/50 font-medium flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>오디오 플레이어 & 이퀄라이저</span>
        </span>
      </div>

      {/* 실시간 음원 주파수 이퀄라이저 바 */}
      <div className="flex items-end justify-center gap-1.5 h-12 mt-6">
        {frequencies.map((height, i) => (
          <span
            key={i}
            className="w-1.5 bg-gradient-to-t from-indigo-600 via-indigo-400 to-indigo-300 rounded-full transition-all duration-75 shadow-sm"
            style={{
              height: `${height}%`,
              opacity: isPlaying ? 0.95 : 0.3,
            }}
          />
        ))}
      </div>
    </div>
  );
};
