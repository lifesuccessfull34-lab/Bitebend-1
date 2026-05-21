import { useState, useMemo, useCallback, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Search, Video, FileText, CreditCard, Link2, HelpCircle,
  BookOpen, X, Heart, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getResources,
  searchResources,
  getFavorites,
  toggleFavorite,
  getHistory,
  getNotifications,
  isRecent,
  isNew,
  type Resource,
  type ResourceNotification,
  type HistoryEntry,
} from "@/services/resourceService";
import { VideoCard } from "@/components/resources/VideoCard";
import { PdfCard } from "@/components/resources/PdfCard";
import { PlanCard } from "@/components/resources/PlanCard";
import { LinkCard } from "@/components/resources/LinkCard";
import { FaqAccordion } from "@/components/resources/FaqAccordion";
import { SectionHeader } from "@/components/resources/SectionHeader";
import { FeaturedCarousel } from "@/components/resources/FeaturedCarousel";
import { RecentlyAdded } from "@/components/resources/RecentlyAdded";
import { ContinueLearning } from "@/components/resources/ContinueLearning";
import { NotificationBanner } from "@/components/resources/NotificationBanner";
import type { VideoResource, PdfResource, PlanResource, LinkResource, FaqResource } from "@/data/resources";
import { Link } from "wouter";

type FilterTab = "all" | "videos" | "pdfs" | "plans" | "links" | "faqs" | "saved";

const TABS: { id: FilterTab; label: string; icon: React.ElementType }[] = [
  { id: "all",    label: "All",    icon: BookOpen   },
  { id: "videos", label: "Videos", icon: Video      },
  { id: "pdfs",   label: "PDFs",   icon: FileText   },
  { id: "plans",  label: "Plans",  icon: CreditCard },
  { id: "links",  label: "Links",  icon: Link2      },
  { id: "faqs",   label: "FAQs",   icon: HelpCircle },
  { id: "saved",  label: "Saved",  icon: Heart      },
];

// ── Resource → typed adapters ─────────────────────────────────────────────────

function toVideo(r: Resource): VideoResource {
  return { id: r.id, type: "video", title: r.title, description: r.description, url: r.url, thumbnailUrl: r.thumbnail, duration: r.duration, source: r.videoSource ?? "youtube" };
}
function toPdf(r: Resource): PdfResource {
  return { id: r.id, type: "pdf", title: r.title, description: r.description, url: r.fileUrl ?? r.url, sizeLabel: r.sizeLabel };
}
function toPlan(r: Resource): PlanResource {
  return { id: r.id, type: "plan", name: r.planName ?? r.title, price: r.planPrice ?? "", period: r.planPeriod, description: r.description, features: r.planFeatures ?? [], cta: r.planCta ?? "trial", highlight: r.planHighlight, badge: r.planBadge };
}
function toLink(r: Resource): LinkResource {
  return { id: r.id, type: "link", title: r.title, description: r.description, url: r.url, iconName: r.iconName ?? "link", color: r.iconColor ?? "bg-gray-50 text-gray-600 border-gray-200" };
}
function toFaq(r: Resource): FaqResource {
  return { id: r.id, type: "faq", question: r.question ?? r.title, answer: r.answer ?? r.description, category: r.category };
}

export default function ResourcesCenter() {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<number[]>(() => getFavorites());
  const [notifications, setNotifications] = useState<ResourceNotification[]>(() => getNotifications());
  const [history] = useState<HistoryEntry[]>(() => getHistory());

  const allResources = useMemo(() => getResources({ status: "active" }), []);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const handleToggleFavorite = useCallback((id: number) => {
    toggleFavorite(id);
    setFavorites(getFavorites());
  }, []);

  const searched = useMemo(() => searchResources(allResources, query), [allResources, query]);

  const videos  = useMemo(() => searched.filter((r) => r.type === "video"), [searched]);
  const pdfs    = useMemo(() => searched.filter((r) => r.type === "pdf"),   [searched]);
  const plans   = useMemo(() => searched.filter((r) => r.type === "plan"),  [searched]);
  const links   = useMemo(() => searched.filter((r) => r.type === "link"),  [searched]);
  const faqs    = useMemo(() => searched.filter((r) => r.type === "faq"),   [searched]);

  const featuredResources = useMemo(() => allResources.filter((r) => r.featured), [allResources]);
  const recentResources   = useMemo(() =>
    allResources.filter(isRecent).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allResources],
  );
  const savedResources    = useMemo(() => allResources.filter((r) => favorites.includes(r.id)), [allResources, favorites]);
  const savedSearched     = useMemo(() => searchResources(savedResources, query), [savedResources, query]);

  const q = query.trim();
  const show = (tab: FilterTab) => activeTab === "all" || activeTab === tab;

  const totalResults =
    activeTab === "saved"
      ? savedSearched.length
      : videos.length + pdfs.length + plans.length + links.length + faqs.length;

  const isTabActive = (tab: FilterTab) => activeTab === tab;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">

        {/* Notification banners */}
        {notifications.map((n) => (
          <NotificationBanner
            key={n.id}
            notification={n}
            onDismiss={() => setNotifications((prev) => prev.filter((x) => x.id !== n.id))}
          />
        ))}

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
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
          <Link
            href="/restaurant/resources/manage"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
            Manage
          </Link>
        </div>

        {/* Featured carousel — only when no search and no non-all tab */}
        {!q && activeTab === "all" && featuredResources.length > 0 && (
          <FeaturedCarousel resources={featuredResources} />
        )}

        {/* Continue Learning — only when no search, no tab filter, and has history */}
        {!q && activeTab === "all" && history.length > 0 && (
          <ContinueLearning history={history} resources={allResources} />
        )}

        {/* Recently Added — only when no search and no non-all tab */}
        {!q && activeTab === "all" && recentResources.length > 0 && (
          <RecentlyAdded resources={recentResources.slice(0, 8)} />
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, tag, category…"
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
            const isSaved = tab.id === "saved";
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                  isTabActive(tab.id)
                    ? isSaved ? "bg-red-500 text-white shadow-sm" : "bg-orange-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", isTabActive(tab.id) && isSaved && "fill-white")} />
                {tab.label}
                {isSaved && savedResources.length > 0 && (
                  <span className={cn("text-[10px] rounded-full px-1 font-bold", isTabActive(tab.id) ? "bg-white/30" : "bg-red-100 text-red-600")}>
                    {savedResources.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* No results state */}
        {q && totalResults === 0 && (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
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

        {/* ── Saved Resources tab ────────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <div className="space-y-10">
            {savedSearched.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Heart className="w-10 h-10 mb-3 opacity-20" />
                <p className="font-medium text-sm">No saved resources yet</p>
                <p className="text-xs mt-1">Tap the heart icon on any resource to save it here</p>
              </div>
            ) : (
              <>
                {savedSearched.filter((r) => r.type === "video").length > 0 && (
                  <section>
                    <SectionHeader icon={Video} title="Saved Videos" count={savedSearched.filter((r) => r.type === "video").length} description="" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedSearched.filter((r) => r.type === "video").map((r) => (
                        <VideoCard key={r.id} video={toVideo(r)} isFavorited onToggleFavorite={() => handleToggleFavorite(r.id)} />
                      ))}
                    </div>
                  </section>
                )}
                {savedSearched.filter((r) => r.type === "pdf").length > 0 && (
                  <section>
                    <SectionHeader icon={FileText} title="Saved Documents" count={savedSearched.filter((r) => r.type === "pdf").length} description="" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedSearched.filter((r) => r.type === "pdf").map((r) => (
                        <PdfCard key={r.id} pdf={toPdf(r)} isFavorited onToggleFavorite={() => handleToggleFavorite(r.id)} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Main content sections ──────────────────────────────────────────── */}
        {activeTab !== "saved" && (
          <div className="space-y-10">

            {/* Videos */}
            {show("videos") && videos.length > 0 && (
              <section>
                <SectionHeader icon={Video} title="Demo Videos" description="Watch walkthroughs and tutorials to get started quickly." count={videos.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map((r) => (
                    <VideoCard
                      key={r.id}
                      video={toVideo(r)}
                      isFavorited={favorites.includes(r.id)}
                      onToggleFavorite={() => handleToggleFavorite(r.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* PDFs */}
            {show("pdfs") && pdfs.length > 0 && (
              <section>
                <SectionHeader icon={FileText} title="Documents & Guides" description="Download setup guides, brochures, and policy documents." count={pdfs.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pdfs.map((r) => (
                    <PdfCard
                      key={r.id}
                      pdf={toPdf(r)}
                      isFavorited={favorites.includes(r.id)}
                      onToggleFavorite={() => handleToggleFavorite(r.id)}
                    />
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
                    <LinkCardWithFavorite
                      key={r.id}
                      link={toLink(r)}
                      isFavorited={favorites.includes(r.id)}
                      onToggleFavorite={() => handleToggleFavorite(r.id)}
                    />
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
    </AppShell>
  );
}

// ── LinkCard with Favorite overlay ───────────────────────────────────────────

function LinkCardWithFavorite({
  link,
  isFavorited,
  onToggleFavorite,
}: {
  link: LinkResource;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="relative group">
      <LinkCard link={link} />
      <button
        onClick={onToggleFavorite}
        className={cn(
          "absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10",
          isFavorited
            ? "bg-red-100 text-red-500"
            : "bg-white/80 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400",
        )}
        title={isFavorited ? "Remove from saved" : "Save resource"}
      >
        <Heart className={cn("w-3.5 h-3.5", isFavorited && "fill-red-500")} />
      </button>
    </div>
  );
}
