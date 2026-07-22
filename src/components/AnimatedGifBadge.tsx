import React from "react";
import { Sparkles } from "lucide-react";

interface AnimatedGifBadgeProps {
  isAnimatedGif: boolean;
  filePath: string | null;
}

export const AnimatedGifBadge: React.FC<AnimatedGifBadgeProps> = ({
  isAnimatedGif,
  filePath,
}) => {
  if (!isAnimatedGif) return null;

  const extension = filePath ? filePath.split(".").pop()?.toUpperCase() : "GIF";

  return (
    <div className="absolute top-4 left-4 z-30 px-3 py-1 rounded-xl bg-neutral-900/80 border border-white/10 backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold text-amber-300 shadow-xl pointer-events-none">
      <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
      <span>움짤 ({extension})</span>
    </div>
  );
};
