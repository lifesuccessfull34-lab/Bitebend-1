import { MenuHeader } from "./MenuHeader";
import { CategoryTabs } from "./CategoryTabs";
import { MenuItemList } from "./MenuItemList";
import { CartBar } from "./CartBar";
import type { RestaurantData, CategoryData, MenuItemData, OrderType } from "./types";

interface Props {
  restaurant: RestaurantData;
  categories: CategoryData[];
  filteredCategories: CategoryData[];
  allItems: MenuItemData[];
  activeCategory: number | null;
  searchQuery: string;
  orderType: OrderType | null;
  manualTableNumber: string;
  takeAwayOnly: boolean;
  itemCount: number;
  subtotal: number;
  tableId?: string;
  getQty: (id: number) => number;
  onAdd: (item: MenuItemData) => void;
  onRemove: (itemId: number) => void;
  onSelectCategory: (id: number | null) => void;
  onSearch: (q: string) => void;
  onChangeMode: () => void;
  onOpenCart: () => void;
}

export function MenuView({
  restaurant,
  categories,
  filteredCategories,
  allItems,
  activeCategory,
  searchQuery,
  orderType,
  manualTableNumber,
  takeAwayOnly,
  itemCount,
  subtotal,
  tableId,
  getQty,
  onAdd,
  onRemove,
  onSelectCategory,
  onSearch,
  onChangeMode,
  onOpenCart,
}: Props) {
  return (
    <div className="min-h-dvh" style={{ backgroundColor: "#faf9f6" }}>
      <MenuHeader
        restaurant={restaurant}
        orderType={orderType}
        manualTableNumber={manualTableNumber}
        takeAwayOnly={takeAwayOnly}
        onChangeMode={onChangeMode}
        tableId={tableId}
      />
      <CategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        searchQuery={searchQuery}
        onSelectCategory={onSelectCategory}
        onSearch={onSearch}
      />
      <MenuItemList
        filteredCategories={filteredCategories}
        allItems={allItems}
        searchQuery={searchQuery}
        getQty={getQty}
        onAdd={onAdd}
        onRemove={onRemove}
      />
      <CartBar itemCount={itemCount} subtotal={subtotal} onOpen={onOpenCart} />
    </div>
  );
}
