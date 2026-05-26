import { Check, Zap, Star, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PlanResource } from "@/data/resources";

const PLAN_STYLES: Record<string, { gradient: string; icon: React.ElementType; iconColor: string }> = {
  Starter:   { gradient: "from-slate-50 to-slate-100 border-slate-200",   icon: Zap,   iconColor: "text-slate-500" },
  Growth:    { gradient: "from-blue-50 to-blue-100 border-blue-200",       icon: Star,  iconColor: "text-blue-500"  },
  Pro:       { gradient: "from-purple-50 to-purple-100 border-purple-200", icon: Crown, iconColor: "text-purple-500" },
  Unlimited: { gradient: "from-amber-50 to-amber-100 border-amber-200",    icon: Crown, iconColor: "text-amber-500" },
};

interface Props {
  plan: PlanResource;
}

export function PlanCard({ plan }: Props) {
  const style = PLAN_STYLES[plan.name] ?? PLAN_STYLES.Starter;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-gradient-to-br p-5 flex flex-col transition-all duration-200 hover:shadow-md",
        style.gradient,
        plan.highlight && "ring-2 ring-orange-400 ring-offset-1",
      )}
    >
      {/* Badge */}
      {plan.badge && (
        <div className={cn(
          "absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-white shadow",
          plan.highlight ? "bg-orange-500" : "bg-gray-600",
        )}>
          {plan.badge}
        </div>
      )}

      {/* Icon + name */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center">
          <Icon className={cn("w-4 h-4", style.iconColor)} />
        </div>
        <span className="font-bold text-sm text-foreground">{plan.name}</span>
      </div>

      {/* Price */}
      <div className="mb-1">
        <span className="text-2xl font-extrabold text-foreground">{plan.price}</span>
        {plan.period && (
          <span className="text-xs text-muted-foreground ml-1">/ {plan.period}</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>

      {/* Features */}
      <ul className="space-y-1.5 flex-1 mb-5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-foreground">
            <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {plan.cta === "trial" ? (
        <Button
          size="sm"
          className={cn(
            "w-full text-xs h-9",
            plan.highlight
              ? "bg-orange-500 hover:bg-orange-600 text-white"
              : "bg-white hover:bg-gray-50 text-foreground border border-border",
          )}
          onClick={() => window.open("https://bitebend.in/restaurant/register", "_blank", "noopener,noreferrer")}
        >
          Start Trial
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs h-9 bg-white hover:bg-gray-50"
          onClick={() => window.open("mailto:support@bitebend.in?subject=Enterprise%20Enquiry", "_blank")}
        >
          Contact Sales
        </Button>
      )}
    </div>
  );
}

export function PlanCardSkeleton() {
  return (
    <div className="rounded-xl border bg-muted animate-pulse p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-background" />
        <div className="h-4 bg-background rounded w-1/3" />
      </div>
      <div className="h-7 bg-background rounded w-1/2" />
      <div className="h-3 bg-background rounded w-full" />
      <div className="space-y-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3 bg-background rounded w-full" />
        ))}
      </div>
      <div className="h-9 bg-background rounded-lg" />
    </div>
  );
}
