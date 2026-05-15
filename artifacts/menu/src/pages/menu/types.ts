export interface MenuItemData {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isVeg: boolean;
  isAvailable: boolean;
  categoryId: number;
}

export interface CategoryData {
  id: number;
  name: string;
  displayOrder: number;
  items: MenuItemData[];
}

export interface RestaurantData {
  id: number;
  name: string;
  description: string | null;
  cuisineType: string;
  logoUrl: string | null;
  address: string;
  city: string;
  phone: string;
  taxPercent: number;
  upiId: string | null;
  seatingLabel: string | null;
  razorpayKeyId: string | null;
}

export interface TableData {
  id: number;
  tableNumber: string;
  area: string | null;
  isOccupied: boolean;
}

export interface CartItem {
  item: MenuItemData;
  quantity: number;
}

export type OrderType = "dine_in" | "take_away";
export type ViewState =
  | "landing"
  | "menu"
  | "cart"
  | "form"
  | "pending_upi_payment"
  | "success";
