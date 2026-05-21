import {
  Calendar,
  MessageCircle,
  HelpCircle,
  Globe,
  PlayCircle,
  Mail,
  ExternalLink,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinkResource } from "@/data/resources";

const ICON_MAP: Record<string, React.ElementType> = {
  calendar: Calendar,
  "message-circle": MessageCircle,
  "help-circle": HelpCircle,
  globe: Globe,
  "play-circle": PlayCircle,
  mail: Mail,
  link: Link2,
};

interface Props {
  link: LinkResource;
}

export function LinkCard({ link }: Props) {
  const Icon = ICON_MAP[link.iconName] ?? Link2;

  const isAnchor = link.url.startsWith("#");

  const handleClick = () => {
    if (isAnchor) {
      const el = document.querySelector(link.url);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.open(link.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group text-left w-full rounded-xl border p-4 hover:shadow-md transition-all duration-200 flex items-start gap-3",
        link.color,
      )}
    >
      <div className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-sm">{link.title}</span>
          {!isAnchor && <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />}
        </div>
        <p className="text-xs opacity-75 line-clamp-2">{link.description}</p>
      </div>
    </button>
  );
}

export function LinkCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-muted animate-pulse p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-background shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 bg-background rounded w-1/2" />
        <div className="h-3 bg-background rounded w-full" />
        <div className="h-3 bg-background rounded w-2/3" />
      </div>
    </div>
  );
}
