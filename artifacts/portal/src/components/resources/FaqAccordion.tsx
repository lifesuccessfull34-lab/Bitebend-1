import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FaqResource } from "@/data/resources";

interface Props {
  faqs: FaqResource[];
}

export function FaqAccordion({ faqs }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (faqs.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-muted-foreground">
        <ChevronDown className="w-10 h-10 mb-3 opacity-20" />
        <p className="font-medium text-sm">No FAQs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {faqs.map((faq) => {
        const open = openId === faq.id;
        return (
          <div
            key={faq.id}
            className={cn(
              "rounded-xl border transition-all duration-200",
              open
                ? "border-orange-200 bg-orange-50/50"
                : "border-border bg-card hover:border-orange-200/60",
            )}
          >
            <button
              className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left"
              onClick={() => setOpenId(open ? null : faq.id)}
            >
              <span className={cn("text-sm font-medium", open ? "text-orange-700" : "text-foreground")}>
                {faq.question}
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 shrink-0 transition-transform duration-200",
                  open ? "rotate-180 text-orange-500" : "text-muted-foreground",
                )}
              />
            </button>

            {open && (
              <div className="px-4 pb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                {faq.category && (
                  <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
                    {faq.category}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FaqSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card animate-pulse p-4 flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="w-4 h-4 rounded bg-muted shrink-0" />
        </div>
      ))}
    </div>
  );
}
