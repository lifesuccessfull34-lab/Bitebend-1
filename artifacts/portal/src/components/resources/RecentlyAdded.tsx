import { type Resource, isNew, trackResourceOpen } from "@/services/resourceService";
import { Video, FileText, Link2, CreditCard, HelpCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  resources: Resource[];
}

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  video: { Icon: Video,      color: "bg-red-100 text-red-600" },
  pdf:   { Icon: FileText,   color: "bg-blue-100 text-blue-600" },
  link:  { Icon: Link2,      color: "bg-green-100 text-green-600" },
  plan:  { Icon: CreditCard, color: "bg-purple-100 text-purple-600" },
  faq:   { Icon: HelpCircle, color: "bg-amber-100 text-amber-600" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function RecentlyAdded({ resources }: Props) {
  if (resources.length === 0) return null;

  const handleOpen = (r: Resource) => {
    trackResourceOpen(r.id);
    if (r.url && r.url !== "#faq") window.open(r.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-orange-500" />
        <h2 className="text-sm font-bold text-foreground">Recently Added</h2>
        <span className="text-xs text-muted-foreground">({resources.length})</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {resources.map((r) => {
          const cfg = TYPE_ICON[r.type] ?? TYPE_ICON.link;
          const Icon = cfg.Icon;
          const _new = isNew(r);

          return (
            <button
              key={r.id}
              onClick={() => handleOpen(r)}
              className="flex-shrink-0 w-52 text-left rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-orange-200 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", cfg.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                {_new && (
                  <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold uppercase tracking-wide">
                    New
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-foreground line-clamp-2 mb-1 leading-snug">{r.title}</p>
              <p className="text-[10px] text-muted-foreground">{formatDate(r.createdAt)}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
