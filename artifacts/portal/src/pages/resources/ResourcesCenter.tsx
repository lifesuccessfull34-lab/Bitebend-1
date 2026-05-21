import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Search, Video, FileText, CreditCard, Link2, HelpCircle, BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIDEOS, PDFS, PLANS, LINKS, FAQS } from "@/data/resources";
import { VideoCard } from "@/components/resources/VideoCard";
import { PdfCard } from "@/components/resources/PdfCard";
import { PlanCard } from "@/components/resources/PlanCard";
import { LinkCard } from "@/components/resources/LinkCard";
import { FaqAccordion } from "@/components/resources/FaqAccordion";
import { SectionHeader } from "@/components/resources/SectionHeader";

type FilterTab = "all" | "videos" | "pdfs" | "plans" | "links" | "faqs";

const TABS: { id: FilterTab; label: string; icon: React.ElementType }[] = [
  { id: "all",    label: "All",    icon: BookOpen   },
  { id: "videos", label: "Videos", icon: Video      },
  { id: "pdfs",   label: "PDFs",   icon: FileText   },
  { id: "plans",  label: "Plans",  icon: CreditCard },
  { id: "links",  label: "Links",  icon: Link2      },
  { id: "faqs",   label: "FAQs",   icon: HelpCircle },
];

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

export default function ResourcesCenter() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");

  const q = query.trim();

  const filteredVideos = useMemo(() =>
    VIDEOS.filter((v) => !q || matchesQuery(v.title, q) || matchesQuery(v.description, q)),
    [q]);

  const filteredPdfs = useMemo(() =>
    PDFS.filter((p) => !q || matchesQuery(p.title, q) || matchesQuery(p.description, q)),
    [q]);

  const filteredPlans = useMemo(() =>
    PLANS.filter((p) => !q || matchesQuery(p.name, q) || matchesQuery(p.description, q) || p.features.some((f) => matchesQuery(f, q))),
    [q]);

  const filteredLinks = useMemo(() =>
    LINKS.filter((l) => !q || matchesQuery(l.title, q) || matchesQuery(l.description, q)),
    [q]);

  const filteredFaqs = useMemo(() =>
    FAQS.filter((f) => !q || matchesQuery(f.question, q) || matchesQuery(f.answer, q)),
    [q]);

  const show = (tab: FilterTab) => activeTab === "all" || activeTab === tab;

  const totalResults =
    filteredVideos.length + filteredPdfs.length + filteredPlans.length +
    filteredLinks.length + filteredFaqs.length;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-orange-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Resources Center</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            Everything you need to learn, setup, explore and grow with Bitebend.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search videos, guides, FAQs…"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                  activeTab === tab.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* No results state */}
        {q && totalResults === 0 && (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-sm">No results for "{q}"</p>
            <p className="text-xs mt-1">Try a different keyword or clear the search</p>
            <button
              onClick={() => setQuery("")}
              className="mt-3 text-xs text-orange-500 hover:underline font-medium"
            >
              Clear search
            </button>
          </div>
        )}

        <div className="space-y-10">

          {/* ── Videos ──────────────────────────────────────────────────── */}
          {show("videos") && filteredVideos.length > 0 && (
            <section>
              <SectionHeader
                icon={Video}
                title="Demo Videos"
                description="Watch walkthroughs and tutorials to get started quickly."
                count={filteredVideos.length}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            </section>
          )}

          {/* ── PDFs ────────────────────────────────────────────────────── */}
          {show("pdfs") && filteredPdfs.length > 0 && (
            <section>
              <SectionHeader
                icon={FileText}
                title="Documents & Guides"
                description="Download setup guides, brochures, and policy documents."
                count={filteredPdfs.length}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPdfs.map((p) => (
                  <PdfCard key={p.id} pdf={p} />
                ))}
              </div>
            </section>
          )}

          {/* ── Plans ───────────────────────────────────────────────────── */}
          {show("plans") && filteredPlans.length > 0 && (
            <section>
              <SectionHeader
                icon={CreditCard}
                title="Subscription Plans"
                description="Usage-based pricing — pay only for the customers you serve."
                count={filteredPlans.length}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlans.map((p) => (
                  <PlanCard key={p.id} plan={p} />
                ))}
              </div>
            </section>
          )}

          {/* ── Links ───────────────────────────────────────────────────── */}
          {show("links") && filteredLinks.length > 0 && (
            <section>
              <SectionHeader
                icon={Link2}
                title="Useful Links"
                description="Quick access to support, demos, and external resources."
                count={filteredLinks.length}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLinks.map((l) => (
                  <LinkCard key={l.id} link={l} />
                ))}
              </div>
            </section>
          )}

          {/* ── FAQs ────────────────────────────────────────────────────── */}
          {show("faqs") && filteredFaqs.length > 0 && (
            <section id="faq">
              <SectionHeader
                icon={HelpCircle}
                title="Frequently Asked Questions"
                description="Common questions from restaurant owners."
                count={filteredFaqs.length}
              />
              <FaqAccordion faqs={filteredFaqs} />
            </section>
          )}

        </div>
      </div>
    </AppShell>
  );
}
