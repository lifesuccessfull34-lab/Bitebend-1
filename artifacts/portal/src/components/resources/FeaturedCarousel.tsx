import { useState, useEffect, useRef, useCallback } from "react";
import {
  type Resource,
  trackResourceOpen,
} from "@/services/resourceService";
import { Video, FileText, Link2, CreditCard, HelpCircle, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  resources: Resource[];
}

const TYPE_CONFIG: Record<string, { label: string; Icon: React.ElementType; gradient: string; badge: string }> = {
  video: { label: "Video",    Icon: Video,       gradient: "from-red-500 to-orange-500",    badge: "bg-red-100 text-red-700" },
  pdf:   { label: "Guide",    Icon: FileText,    gradient: "from-blue-500 to-indigo-500",   badge: "bg-blue-100 text-blue-700" },
  link:  { label: "Link",     Icon: Link2,       gradient: "from-green-500 to-teal-500",    badge: "bg-green-100 text-green-700" },
  plan:  { label: "Plan",     Icon: CreditCard,  gradient: "from-purple-500 to-violet-500", badge: "bg-purple-100 text-purple-700" },
  faq:   { label: "FAQ",      Icon: HelpCircle,  gradient: "from-amber-500 to-yellow-500",  badge: "bg-amber-100 text-amber-700" },
};

export function FeaturedCarousel({ resources }: Props) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = resources.length;

  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused || total <= 1) return;
    timerRef.current = setInterval(next, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, total, next]);

  if (total === 0) return null;

  const r = resources[current];
  const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.video;
  const Icon = cfg.Icon;

  const handleCta = () => {
    trackResourceOpen(r.id);
    if (r.type === "video") {
    } else {
      window.open(r.url ?? undefined, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-6 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide */}
      <div className={cn("bg-gradient-to-br p-6 sm:p-8 min-h-[180px] flex flex-col justify-between", cfg.gradient)}>
        <div>
          {/* Badges row */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold">
              <Star className="w-3 h-3 fill-white" /> Featured
            </span>
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold", cfg.badge)}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
            {r.duration && (
              <span className="text-white/80 text-xs">{r.duration}</span>
            )}
          </div>

          <h2 className="text-white font-bold text-lg sm:text-xl leading-tight mb-1.5">{r.title}</h2>
          <p className="text-white/80 text-sm leading-relaxed line-clamp-2">{r.description}</p>
        </div>

        {/* CTA + Navigation */}
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <button
            onClick={handleCta}
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition-colors backdrop-blur-sm border border-white/20"
          >
            {r.type === "video" ? "Watch now →" : r.type === "pdf" ? "Download →" : r.type === "plan" ? "View plan →" : "Open →"}
          </button>

          {total > 1 && (
            <div className="flex items-center gap-3">
              <button onClick={prev} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <div className="flex gap-1.5">
                {resources.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={cn(
                      "rounded-full transition-all",
                      i === current ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/60",
                    )}
                  />
                ))}
              </div>
              <button onClick={next} className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Autoplay progress bar */}
      {!paused && total > 1 && (
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-white/20">
          <div
            key={current}
            className="h-full bg-white/60"
            style={{ animation: "progress 4s linear", width: "100%" }}
          />
        </div>
      )}

      <style>{`
        @keyframes progress { from { width: 0% } to { width: 100% } }
      `}</style>
    </div>
  );
}
