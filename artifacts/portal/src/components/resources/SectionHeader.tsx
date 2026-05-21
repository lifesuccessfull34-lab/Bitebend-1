import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  count?: number;
  id?: string;
  className?: string;
}

export function SectionHeader({ icon: Icon, title, description, count, id, className }: Props) {
  return (
    <div id={id} className={cn("flex items-start gap-3 mb-4", className)}>
      <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-orange-600" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-base text-foreground">{title}</h2>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
              {count}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}
