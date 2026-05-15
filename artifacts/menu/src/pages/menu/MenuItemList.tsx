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
    <div className="px-3 pt-1 max-w-2xl mx-auto space-y-6" style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}>
      {filteredCategories.length === 0 ? (
        <div className="text-center py-16">
          <ChefHat className="w-12 h-12 mx-auto mb-3" style={{ color: "#d4b08a" }} />
          <p className="font-medium" style={{ color: "#9ca3af" }}>
            {searchQuery ? `No dishes found for "${searchQuery}"` : "Menu coming soon"}
          </p>
        </div>
      ) : (
        filteredCategories.map((cat) => {
          const available = (cat.items ?? []).filter((i) => i.isAvailable);
          if (available.length === 0) return null;
          return (
            <div key={cat.id} id={`cat-${cat.id}`}>
              <h2
                className="text-sm font-black tracking-widest uppercase mb-4"
                style={{ color: "#8b4513" }}
              >
                {cat.name}
              </h2>
              <div className="space-y-2">
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
        })
      )}

      {/* Veg / non-veg legend */}
      {allItems.length > 0 && (
        <div
          className="flex items-center gap-4 text-xs pt-3 border-t"
          style={{ color: "#9ca3af", borderColor: "#e5e7eb" }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-green-600 rounded-sm flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            Vegetarian
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-red-600 rounded-sm flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
            </div>
            Non-Vegetarian
          </div>
        </div>
      )}
    </div>
  );
}
