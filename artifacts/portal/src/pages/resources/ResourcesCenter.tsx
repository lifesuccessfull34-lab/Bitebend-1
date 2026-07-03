import { useState, useMemo, useEffect } from "react";
import {
  Search, Video, FileText, CreditCard, Link2, HelpCircle,
  BookOpen, X, ChefHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchResources,
  type Resource,
} from "@/services/resourceService";
import { apiFetch } from "@/lib/api";
import { VideoCard } from "@/components/resources/VideoCard";
import { PdfCard } from "@/components/resources/PdfCard";
import { PlanCard } from "@/components/resources/PlanCard";
import { LinkCard } from "@/components/resources/LinkCard";
import { FaqAccordion } from "@/components/resources/FaqAccordion";
import { SectionHeader } from "@/components/resources/SectionHeader";
import { FeaturedCarousel } from "@/components/resources/FeaturedCarousel";
import type { VideoResource, PdfResource, PlanResource, LinkResource, FaqResource } from "@/data/resources";

type FilterTab = "all" | "videos" | "pdfs" | "plans" | "links" | "faqs";

const TABS: { id: FilterTab; label: string; icon: React.ElementType }[] = [
  { id: "all",    label: "All",    icon: BookOpen   },
  { id: "videos", label: "Videos", icon: Video      },
  { id: "pdfs",   label: "PDFs",   icon: FileText   },
  { id: "plans",  label: "Plans",  icon: CreditCard },
  { id: "links",  label: "Links",  icon: Link2      },
  { id: "faqs",   label: "FAQs",   icon: HelpCircle },
];

// ── Resource → typed adapters ─────────────────────────────────────────────────

function toVideo(r: Resource): VideoResource {
  // Self-hosted videos store the blob URL in fileUrl (e.g. /api/images/<uuid>).
  // YouTube / external videos use the url field directly.
  const videoUrl = (r.fileUrl ?? r.url) ?? "";
  return { id: r.id, type: "video", title: r.title, description: r.description ?? "", url: videoUrl, thumbnailUrl: r.thumbnail ?? undefined, duration: r.duration ?? undefined, source: r.videoSource ?? "youtube" };
}
function toPdf(r: Resource): PdfResource {
  return { id: r.id, type: "pdf", title: r.title, description: r.description ?? "", url: (r.fileUrl ?? r.url) ?? "", sizeLabel: r.sizeLabel ?? undefined };
}
function toPlan(r: Resource): PlanResource {
  return { id: r.id, type: "plan", name: r.planName ?? r.title, price: r.planPrice ?? "", period: r.planPeriod ?? undefined, description: r.description ?? "", features: r.planFeatures ?? [], cta: r.planCta ?? "trial", highlight: r.planHighlight ?? undefined, badge: r.planBadge ?? undefined };
}
function toLink(r: Resource): LinkResource {
  return { id: r.id, type: "link", title: r.title, description: r.description ?? "", url: r.url ?? "", iconName: r.iconName ?? "link", color: r.iconColor ?? "bg-gray-50 text-gray-600 border-gray-200" };
}
function toFaq(r: Resource): FaqResource {
  return { id: r.id, type: "faq", question: r.question ?? r.title, answer: (r.answer ?? r.description) ?? "", category: r.category ?? undefined };
}

export default function ResourcesCenter() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [allResources, setAllResources] = useState<Resource[]>([]);
  const [apiLoading, setApiLoading] = useState(true);

  useEffect(() => {
    apiFetch<Resource[]>("/resources")
      .then((data) => setAllResources(data))
      .catch(() => setAllResources([]))
      .finally(() => setApiLoading(false));
  }, []);

  const searched = useMemo(() => searchResources(allResources, query), [allResources, query]);

  const videos  = useMemo(() => searched.filter((r) => r.type === "video"), [searched]);
  const pdfs    = useMemo(() => searched.filter((r) => r.type === "pdf"),   [searched]);
  const plans   = useMemo(() => searched.filter((r) => r.type === "plan"),  [searched]);
  const links   = useMemo(() => searched.filter((r) => r.type === "link"),  [searched]);
  const faqs    = useMemo(() => searched.filter((r) => r.type === "faq"),   [searched]);

  const featuredResources = useMemo(() => allResources.filter((r) => r.featured), [allResources]);

  const q = query.trim();
  const show = (tab: FilterTab) => activeTab === "all" || activeTab === tab;
  const totalResults = videos.length + pdfs.length + plans.length + links.length + faqs.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">

      {/* ── Public header ────────────────────────────────────────────────── */}
      <header className="border-b border-orange-100 bg-white/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
            <ChefHat className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-800 text-base tracking-tight">Bitebend</span>
          <span className="text-slate-300 text-lg font-light ml-1 hidden sm:block">/</span>
          <span className="text-slate-500 text-sm hidden sm:block">Tutorials</span>
          <div className="flex-1" />
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto">

        {/* Hero */}
        <div className="py-8 sm:py-12 text-center mb-2">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <BookOpen className="w-3.5 h-3.5" /> Knowledge Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Tutorials
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Everything you need to learn, set up, and grow with Bitebend — videos, guides, plans, and more.
          </p>
        </div>

        {/* Loading */}
        {apiLoading && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <div className="w-8 h-8 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading resources…</p>
          </div>
        )}

        {/* Empty state */}
        {!apiLoading && allResources.length === 0 && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <BookOpen className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-sm">No resources available yet</p>
            <p className="text-xs mt-1">Check back soon — content is curated by the Bitebend team.</p>
          </div>
        )}

        {/* Featured carousel — no search, all tab only */}
        {!apiLoading && !q && activeTab === "all" && featuredResources.length > 0 && (
          <FeaturedCarousel resources={featuredResources} />
        )}

        {/* Search */}
        {!apiLoading && allResources.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, tag, category…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all shadow-sm"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Filter tabs */}
        {!apiLoading && allResources.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6 scrollbar-hide">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                    isActive
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-white text-slate-500 border border-slate-200 hover:border-orange-200 hover:text-orange-600",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {!apiLoading && q && totalResults === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Search className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-sm">No results for "{q}"</p>
            <p className="text-xs mt-1">Try a different keyword, tag, or clear the search</p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 text-xs text-orange-500 hover:underline font-medium"
            >
              Clear search
            </button>
          </div>
        )}

        {/* ── Content sections ──────────────────────────────────────────────── */}
        {!apiLoading && (
          <div className="space-y-10 pb-16">

            {/* Videos — grouped by category */}
            {show("videos") && videos.length > 0 && (() => {
              const groups = new Map<string, Resource[]>();
              for (const r of videos) {
                const cat = r.category?.trim() || "Videos";
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat)!.push(r);
              }
              return Array.from(groups.entries()).map(([cat, items]) => (
                <section key={cat}>
                  <SectionHeader icon={Video} title={cat} description="Watch walkthroughs and tutorials to get started quickly." count={items.length} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((r) => (
                      <VideoCard key={r.id} video={toVideo(r)} />
                    ))}
                  </div>
                </section>
              ));
            })()}

            {/* PDFs */}
            {show("pdfs") && pdfs.length > 0 && (
              <section>
                <SectionHeader icon={FileText} title="Documents & Guides" description="Download setup guides, brochures, and policy documents." count={pdfs.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pdfs.map((r) => (
                    <PdfCard key={r.id} pdf={toPdf(r)} />
                  ))}
                </div>
              </section>
            )}

            {/* Plans */}
            {show("plans") && plans.length > 0 && (
              <section>
                <SectionHeader icon={CreditCard} title="Subscription Plans" description="Usage-based pricing — pay only for the customers you serve." count={plans.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plans.map((r) => <PlanCard key={r.id} plan={toPlan(r)} />)}
                </div>
              </section>
            )}

            {/* Links */}
            {show("links") && links.length > 0 && (
              <section>
                <SectionHeader icon={Link2} title="Useful Links" description="Quick access to support, demos, and external resources." count={links.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {links.map((r) => (
                    <LinkCard key={r.id} link={toLink(r)} />
                  ))}
                </div>
              </section>
            )}

            {/* FAQs */}
            {show("faqs") && faqs.length > 0 && (
              <section id="faq">
                <SectionHeader icon={HelpCircle} title="Frequently Asked Questions" description="Common questions from restaurant owners." count={faqs.length} />
                <FaqAccordion faqs={faqs.map(toFaq)} />
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
