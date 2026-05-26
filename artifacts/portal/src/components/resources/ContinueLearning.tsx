import { type Resource, type HistoryEntry, trackResourceOpen, timeAgo } from "@/services/resourceService";
import { Video, FileText, Link2, CreditCard, HelpCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  history: HistoryEntry[];
  resources: Resource[];
}

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; color: string; cta: string }> = {
  video: { Icon: Video,      color: "bg-red-100 text-red-600",    cta: "Continue watching" },
  pdf:   { Icon: FileText,   color: "bg-blue-100 text-blue-600",  cta: "Reopen guide" },
  link:  { Icon: Link2,      color: "bg-green-100 text-green-600", cta: "Open again" },
  plan:  { Icon: CreditCard, color: "bg-purple-100 text-purple-600", cta: "View plan" },
  faq:   { Icon: HelpCircle, color: "bg-amber-100 text-amber-600", cta: "Read again" },
};

export function ContinueLearning({ history, resources }: Props) {
  const resourceMap = new Map(resources.map((r) => [r.id, r]));
  const items = history
    .slice(0, 4)
    .map((h) => ({ entry: h, resource: resourceMap.get(h.resourceId) }))
    .filter((x): x is { entry: HistoryEntry; resource: Resource } => !!x.resource);

  if (items.length === 0) return null;

  const handleOpen = (r: Resource) => {
    trackResourceOpen(r.id);
    if (r.url && r.url !== "#faq") window.open(r.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-orange-500" />
        <h2 className="text-sm font-bold text-foreground">Continue where you left off</h2>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(({ entry, resource: r }) => {
          const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.link;
          const Icon = cfg.Icon;

          return (
            <button
              key={r.id}
              onClick={() => handleOpen(r)}
              className="flex-shrink-0 w-60 text-left rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-orange-200 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", cfg.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground line-clamp-1 leading-snug">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(entry.openedAt)}</p>
                </div>
              </div>

              {entry.progress !== undefined && entry.progress > 0 && (
                <div className="mb-2">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, entry.progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <span className="text-[10px] text-orange-500 font-semibold group-hover:underline">
                {cfg.cta} →
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
