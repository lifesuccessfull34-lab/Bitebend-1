import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "wouter";
import { normalizeRestaurantParam } from "@workspace/url-utils";
import { lsGet, lsSet } from "./menu/utils";
import type {
  RestaurantData,
  CategoryData,
  TableData,
  CartItem,
  MenuItemData,
  OrderType,
  ViewState,
} from "./menu/types";
import { LoadingView } from "./menu/LoadingView";
import { ErrorView } from "./menu/ErrorView";
import { LandingView } from "./menu/LandingView";
import { OrderSuccessView } from "./menu/OrderSuccessView";
import { CheckoutView } from "./menu/CheckoutView";
import { CartView } from "./menu/CartView";
import { MenuView } from "./menu/MenuView";

const BASE = "";

interface ProofResult {
  ocrConfigured: boolean;
  matched?: boolean;
  confidence?: number;
  utr?: string | null;
  amount?: number | null;
  error?: string;
}

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId?: string }>();

  const rawParam = useMemo(
    () => normalizeRestaurantParam(params.restaurantId ?? ""),
    [params.restaurantId],
  );

  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tables, setTables] = useState<TableData[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<ViewState>("landing");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [manualTableNumber, setManualTableNumber] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [tableInputError, setTableInputError] = useState("");

  const [customerName, setCustomerName] = useState(() => lsGet("ts_name"));
  const [customerPhone, setCustomerPhone] = useState(() => lsGet("ts_phone"));
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);

  // Payment proof upload state
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  useEffect(() => {
    if (!rawParam) {
      setError("Invalid restaurant");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch(`${BASE}/api/menu/${encodeURIComponent(rawParam)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { restaurant: RestaurantData; categories: CategoryData[]; tables: TableData[] }) => {
        setRestaurant(data.restaurant);
        setCategories(data.categories);
        setTables(data.tables ?? []);
        if (data.restaurant.seatingLabel === null) {
          setOrderType("take_away");
          setView("menu");
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") {
          setError("Menu took too long to load. Please check your connection and try again.");
        } else {
          setError("Failed to load menu. Please try again.");
        }
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  }, [rawParam]);

  useEffect(() => {
    if (!restaurant) return;
    if (restaurant.seatingLabel === null) {
      if (orderType !== "take_away") setOrderType("take_away");
      if (view === "landing") setView("menu");
    }
  }, [restaurant, orderType, view]);

  const addToCart = useCallback((item: MenuItemData) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing)
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      return [...prev, { item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === itemId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((c) => c.item.id !== itemId);
      return prev.map((c) =>
        c.item.id === itemId ? { ...c, quantity: c.quantity - 1 } : c,
      );
    });
  }, []);

  const getQty = useCallback(
    (itemId: number) => cart.find((c) => c.item.id === itemId)?.quantity ?? 0,
    [cart],
  );

  const { subtotal, tax, total, itemCount } = useMemo(() => {
    const sub = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
    const t = restaurant
      ? parseFloat(((sub * restaurant.taxPercent) / 100).toFixed(2))
      : 0;
    return {
      subtotal: sub,
      tax: t,
      total: parseFloat((sub + t).toFixed(2)),
      itemCount: cart.reduce((sum, c) => sum + c.quantity, 0),
    };
  }, [cart, restaurant]);

  const areas = useMemo(
    () =>
      Array.from(
        new Set(tables.map((t) => t.area).filter((a): a is string => !!a)),
      ),
    [tables],
  );
  const hasAreas = areas.length > 0;
  const takeAwayOnly = !restaurant || restaurant.seatingLabel === null;

  const tablesInArea = useMemo(
    () =>
      selectedArea
        ? tables.filter((t) => t.area === selectedArea)
        : tables.filter((t) => !t.area),
    [tables, selectedArea],
  );

  // ── ALL HOOKS MUST APPEAR BEFORE ANY CONDITIONAL RETURN ────────────────────
  const allItems = categories.flatMap((c) => c.items);

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const source = activeCategory
      ? categories.filter((c) => c.id === activeCategory)
      : categories;
    if (!query) return source;
    return source
      .map((cat) => ({
        ...cat,
        items: (cat.items ?? []).filter(
          (i) =>
            i.isAvailable &&
            (i.name.toLowerCase().includes(query) ||
              (i.description?.toLowerCase().includes(query) ?? false)),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery, activeCategory]);

  const handleContinueFromLanding = () => {
    if (!orderType) return;
    if (orderType === "dine_in") {
      if (hasAreas && !selectedArea) {
        setTableInputError("Please select your area first");
        return;
      }
      if (!manualTableNumber.trim()) {
        if (tablesInArea.length === 0 && tables.length > 0 && hasAreas && !selectedArea) {
          setTableInputError("Please select your area first");
        } else {
          setTableInputError(
            `Please select your ${restaurant?.seatingLabel?.toLowerCase() ?? "table"}`,
          );
        }
        return;
      }
    }
    setTableInputError("");
    setView("menu");
  };

  const doPlaceOrder = async (extraNotes?: string) => {
    const tableNum =
      orderType === "dine_in"
        ? selectedArea
          ? `${selectedArea} · ${manualTableNumber.trim()}`
          : manualTableNumber.trim()
        : null;
    const res = await fetch(`${BASE}/api/menu/${restaurant!.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: selectedTableId,
        tableNumber: tableNum,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod: null,
        notes:
          [
            orderType === "take_away" ? "Take Away" : null,
            extraNotes ?? null,
            notes.trim() || null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        items: cart.map((c) => ({ menuItemId: c.item.id, quantity: c.quantity })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to place order");
    return data;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) return;
    if (!/^[6-9]\d{9}$/.test(customerPhone.replace(/\s/g, ""))) {
      setPlaceError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    setPlacing(true);
    setPlaceError("");
    try {
      const data = await doPlaceOrder();
      setOrderId(data.id);
      setOrderTotal(total);
      setCart([]);
      setProofResult(null);
      setView("success");
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  const handleUploadProof = async (file: File) => {
    if (!orderId || !restaurant) return;
    setUploadingProof(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(
        `${BASE}/api/menu/${restaurant.id}/orders/${orderId}/payment-proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenshotBase64: base64, mimeType: file.type }),
        },
      );
      const data = await res.json();
      setProofResult(data as ProofResult);
    } catch {
      setProofResult({ ocrConfigured: false, error: "Upload failed. Please try again." });
    } finally {
      setUploadingProof(false);
    }
  };

  // ── View routing ────────────────────────────────────────────────────────────

  if (loading) return <LoadingView />;

  if (error || !restaurant) return <ErrorView error={error} />;

  if (view === "landing") {
    return (
      <LandingView
        restaurant={restaurant}
        orderType={orderType}
        setOrderType={setOrderType}
        takeAwayOnly={takeAwayOnly}
        hasAreas={hasAreas}
        areas={areas}
        selectedArea={selectedArea}
        setSelectedArea={setSelectedArea}
        manualTableNumber={manualTableNumber}
        setManualTableNumber={setManualTableNumber}
        selectedTableId={selectedTableId}
        setSelectedTableId={setSelectedTableId}
        tableInputError={tableInputError}
        setTableInputError={setTableInputError}
        tablesInArea={tablesInArea}
        onContinue={handleContinueFromLanding}
      />
    );
  }

  if (view === "success" && orderId) {
    return (
      <OrderSuccessView
        orderId={orderId}
        orderTotal={orderTotal}
        orderType={orderType}
        restaurant={restaurant}
        manualTableNumber={manualTableNumber}
        uploadingProof={uploadingProof}
        proofResult={proofResult}
        onUploadProof={handleUploadProof}
        onRedirectToMenu={() => {
          setView("menu");
          setOrderId(null);
          setNotes("");
          setPlaceError("");
          setProofResult(null);
        }}
      />
    );
  }

  if (view === "form") {
    return (
      <CheckoutView
        restaurant={restaurant}
        cart={cart}
        orderType={orderType}
        manualTableNumber={manualTableNumber}
        customerName={customerName}
        onCustomerNameChange={(name) => {
          setCustomerName(name);
          lsSet("ts_name", name);
        }}
        customerPhone={customerPhone}
        onCustomerPhoneChange={(phone) => {
          setCustomerPhone(phone);
          lsSet("ts_phone", phone);
        }}
        notes={notes}
        onNotesChange={setNotes}
        subtotal={subtotal}
        tax={tax}
        total={total}
        placing={placing}
        placeError={placeError}
        onSubmit={handlePlaceOrder}
        onBack={() => setView("cart")}
      />
    );
  }

  if (view === "cart") {
    return (
      <CartView
        cart={cart}
        itemCount={itemCount}
        subtotal={subtotal}
        tax={tax}
        total={total}
        restaurant={restaurant}
        onAdd={addToCart}
        onRemove={removeFromCart}
        onClose={() => setView("menu")}
        onCheckout={() => setView("form")}
      />
    );
  }

  return (
    <MenuView
      restaurant={restaurant}
      categories={categories}
      filteredCategories={filteredCategories}
      allItems={allItems}
      activeCategory={activeCategory}
      searchQuery={searchQuery}
      orderType={orderType}
      manualTableNumber={manualTableNumber}
      takeAwayOnly={takeAwayOnly}
      itemCount={itemCount}
      subtotal={subtotal}
      getQty={getQty}
      onAdd={addToCart}
      onRemove={removeFromCart}
      onSelectCategory={(id) => {
        setActiveCategory(id);
        setSearchQuery("");
      }}
      onSearch={setSearchQuery}
      onChangeMode={() => setView("landing")}
      onOpenCart={() => setView("cart")}
    />
  );
}
