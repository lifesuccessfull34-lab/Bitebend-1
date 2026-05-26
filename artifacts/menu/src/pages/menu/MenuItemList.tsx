import { ChefHat } from "lucide-react";
import { MenuItemCard } from "./MenuItemCard";
import type { CategoryData, MenuItemData } from "./types";

interface Props {
  filteredCategories: CategoryData[];
  allItems: MenuItemData[];
  searchQuery: string;
  getQty: (id: number) => number;
  onAdd: (item: MenuItemData) => void;
  onRemove: (itemId: number) => void;
}

export function MenuItemList({
  filteredCategories,
  allItems,
  searchQuery,
  getQty,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div
      style={{
        padding: "8px 14px 0",
        paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        maxWidth: "640px",
        margin: "0 auto",
      }}
    >
      {filteredCategories.length === 0 ? (
        <div style={{ textAlign: "center", paddingTop: "64px", paddingBottom: "64px" }}>
          <ChefHat style={{ width: "48px", height: "48px", margin: "0 auto 12px", color: "#d4b08a" }} />
          <p style={{ fontWeight: 500, color: "#9ca3af", fontSize: "15px" }}>
            {searchQuery ? `No dishes found for "${searchQuery}"` : "Menu coming soon"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {filteredCategories.map((cat) => {
            const available = (cat.items ?? []).filter((i) => i.isAvailable);
            if (available.length === 0) return null;
            return (
              <div key={cat.id} id={`cat-${cat.id}`}>
                {/* Category heading */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  marginBottom: "12px",
                }}>
                  <h2 style={{
                    fontSize: "11px", fontWeight: 800,
                    letterSpacing: "0.10em", textTransform: "uppercase",
                    color: "#c2410c", margin: 0, flexShrink: 0,
                  }}>
                    {cat.name}
                  </h2>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "#ede8e3" }} />
                  <span style={{ fontSize: "11px", color: "#9ca3af", flexShrink: 0 }}>
                    {available.length} item{available.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Items */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {available.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      qty={getQty(item.id)}
                      onAdd={() => onAdd(item)}
                      onRemove={() => onRemove(item.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Veg / non-veg legend */}
      {allItems.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "20px",
          marginTop: "24px", paddingTop: "16px",
          borderTop: "1px solid #e5e7eb",
          fontSize: "12px", color: "#9ca3af",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "13px", height: "13px", borderRadius: "3px",
              border: "2px solid #16a34a",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#16a34a" }} />
            </div>
            Vegetarian
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "13px", height: "13px", borderRadius: "3px",
              border: "2px solid #dc2626",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#dc2626" }} />
            </div>
            Non-Vegetarian
          </div>
        </div>
      )}
    </div>
  );
}
