import { Search, X } from "lucide-react";
import type { CategoryData } from "./types";

interface Props {
  categories: CategoryData[];
  activeCategory: number | null;
  searchQuery: string;
  onSelectCategory: (id: number | null) => void;
  onSearch: (q: string) => void;
}

export function CategoryTabs({
  categories,
  activeCategory,
  searchQuery,
  onSelectCategory,
  onSearch,
}: Props) {
  return (
    <div
      className="sticky top-0 z-20"
      style={{
        backgroundColor: "#faf9f6",
        boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
        /*
         * NOTE: Do NOT add transform: translateZ(0) / will-change: transform
         * to this sticky wrapper.
         *
         * Applying any transform to a position:sticky element promotes it to
         * a GPU compositor layer. The compositor stores the layer's hit-test
         * rectangle in the PRE-ZOOM coordinate space. After the user pinch-
         * zooms (visualViewport.scale > 1), the visible position shifts but
         * the hit-test rectangle stays in old coordinates, so:
         *   • touch events aimed at the scrollable content below are
         *     intercepted by the wrong compositor layer
         *   • vertical scroll gestures become unreliable or stop working
         *     entirely — confirmed on Android Chrome ≤110, Samsung Internet
         *     ≤22, and OPPO Browser on ColorOS <12.
         *
         * The browser's native sticky positioning already repositions the
         * element during scroll without a repaint (it's accelerated by
         * default). The GPU compositing hint gives no measurable benefit
         * here while introducing a post-zoom compositor bug.
         */
      }}
    >
      {/* Search bar */}
      <div style={{ padding: "12px 16px 10px" }}>
        <div style={{ position: "relative" }}>
          <Search
            style={{
              position: "absolute", left: "14px", top: "50%",
              transform: "translateY(-50%)",
              width: "15px", height: "15px",
              color: "#9ca3af",
              pointerEvents: "none",
            }}
          />
          <input
            type="search"
            inputMode="search"
            placeholder="Search for dishes…"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="rounded-full"
            style={{
              width: "100%",
              height: "42px",
              paddingLeft: "42px",
              paddingRight: searchQuery ? "38px" : "16px",
              borderRadius: "9999px",
              border: "1.5px solid #e5e7eb",
              backgroundColor: "#fff",
              color: "#111827",
              fontSize: "14px",
              outline: "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              boxSizing: "border-box",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearch("")}
              style={{
                position: "absolute", right: "13px", top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                display: "flex", alignItems: "center",
              }}
            >
              <X style={{ width: "15px", height: "15px" }} />
            </button>
          )}
        </div>
      </div>

      {/* Category pill tabs */}
      {categories.length > 0 && (
        <div style={{
          display: "flex",
          gap: "6px",
          padding: "0 16px 11px",
          overflowX: "auto",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}>
          {/* "All" pill */}
          <button
            onClick={() => onSelectCategory(null)}
            style={{
              flexShrink: 0,
              padding: "6px 16px",
              borderRadius: "9999px",
              fontSize: "13px",
              fontWeight: activeCategory === null ? 700 : 500,
              whiteSpace: "nowrap",
              backgroundColor: activeCategory === null ? "#3d2012" : "transparent",
              color: activeCategory === null ? "#fff" : "#374151",
              border: activeCategory === null ? "none" : "1px solid transparent",
              transition: "background-color 0.15s",
            }}
          >
            All
          </button>

          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "13px",
                fontWeight: activeCategory === cat.id ? 700 : 500,
                whiteSpace: "nowrap",
                backgroundColor: activeCategory === cat.id ? "#3d2012" : "transparent",
                color: activeCategory === cat.id ? "#fff" : "#374151",
                border: "none",
                transition: "background-color 0.15s",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
