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
import { UpiPaymentView } from "./menu/UpiPaymentView";
import { OrderSuccessView } from "./menu/OrderSuccessView";
import { CheckoutView } from "./menu/CheckoutView";
import { CartView } from "./menu/CartView";
import { MenuView } from "./menu/MenuView";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const BASE = "";

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId?: string }>();

  // Raw URL param — normalised via the shared @workspace/url-utils utility.
  // Handles: %0A newline (Google Lens), %20 space, uppercase slugs, trailing
  // slash, and any other scanner/browser transformations of the QR URL.
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

  // Order type selection
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [manualTableNumber, setManualTableNumber] = useState("");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [tableInputError, setTableInputError] = useState("");

  // Checkout form — persist name/phone in localStorage so repeat visitors don't retype
  const [customerName, setCustomerName] = useState(() => lsGet("ts_name"));
  const [customerPhone, setCustomerPhone] = useState(() => lsGet("ts_phone"));
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "razorpay" | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [utrNumber, setUtrNumber] = useState("");
  const [countdown, setCountdown] = useState(300);

  // Load Razorpay checkout.js only when this restaurant has it configured.
  // Avoids fetching ~200 KB of third-party JS for restaurants that don't use it.
  const razorpayKeyId = restaurant?.razorpayKeyId;
  useEffect(() => {
    if (!razorpayKeyId) return;
    if (document.getElementById("razorpay-checkout-js")) return;
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, [razorpayKeyId]);

  useEffect(() => {
    if (!rawParam) {
      setError("Invalid restaurant");
      setLoading(false);
      return;
    }
    // AbortController timeout: if the API doesn't respond within 10s on mobile,
    // show an error instead of hanging on the loading spinner indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch(`${BASE}/api/menu/${encodeURIComponent(rawParam)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { restaurant: RestaurantData; categories: CategoryData[]; tables: TableData[] }) => {
        setRestaurant(data.restaurant);
        setCategories(data.categories);
        setTables(data.tables ?? []);
        // Street vendor / take-away only — skip landing screen entirely
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

  // Enforce offering mode: if restaurant is take-away only, always force orderType to
  // take_away and redirect away from the landing screen if the customer somehow reaches it.
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

  // Derived: list of unique areas from the tables the restaurant has configured
  const areas = useMemo(
    () =>
      Array.from(
        new Set(tables.map((t) => t.area).filter((a): a is string => !!a)),
      ),
    [tables],
  );
  const hasAreas = areas.length > 0;

  // True when the restaurant is configured as "Take Away Only" (seatingLabel === null).
  // Used to enforce offering mode restrictions throughout the UI.
  const takeAwayOnly = !restaurant || restaurant.seatingLabel === null;

  // Count of available payment methods to set grid columns dynamically.
  const paymentMethodCount = restaurant
    ? 1 + (restaurant.upiId && restaurant.personalUpiEnabled ? 1 : 0) + (restaurant.razorpayKeyId ? 1 : 0)
    : 1;
  const paymentGridCols =
    paymentMethodCount === 3
      ? "grid-cols-3"
      : paymentMethodCount === 2
        ? "grid-cols-2"
        : "grid-cols-1";

  // Tables filtered to selected area (or all if no areas / area not chosen yet)
  const tablesInArea = useMemo(
    () =>
      selectedArea
        ? tables.filter((t) => t.area === selectedArea)
        : tables.filter((t) => !t.area),
    [tables, selectedArea],
  );

  // ── ALL HOOKS MUST APPEAR BEFORE ANY CONDITIONAL RETURN ────────────────────
  //
  // React requires hooks to be called in the same order on every render.
  // filteredCategories MUST be declared here (not after the early returns below)
  // to satisfy the Rules of Hooks.
  const allItems = categories.flatMap((c) => c.items);

  // Filtered category list based on search query + active category tab
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
      // If the restaurant has areas, an area must be selected first
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

  useEffect(() => {
    if (view !== "pending_upi_payment") return;
    setCountdown(300);
    const interval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  const confirmPaymentDone = async () => {
    if (!orderId) return;
    setConfirmingPayment(true);
    try {
      const res = await fetch(
        `${BASE}/api/menu/${restaurant!.id}/orders/${orderId}/confirm-payment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utrNumber: utrNumber.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Failed to confirm");
      }
      setView("success");
    } finally {
      setConfirmingPayment(false);
    }
  };

  const doPlaceOrder = async (pm: string, extraNotes?: string) => {
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
        paymentMethod: pm,
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

  const handleRazorpayPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) return;
    if (!/^[6-9]\d{9}$/.test(customerPhone.replace(/\s/g, ""))) {
      setPlaceError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    if (!restaurant) return;

    setPlacing(true);
    setPlaceError("");
    try {
      const rzpOrderRes = await fetch(
        `${BASE}/api/menu/${restaurant!.id}/razorpay-order`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: total,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
          }),
        },
      );
      const rzpOrder = await rzpOrderRes.json();
      if (!rzpOrderRes.ok) throw new Error(rzpOrder.error ?? "Could not create payment");

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: rzpOrder.keyId,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: rzpOrder.restaurantName,
          description: `Order · ${orderType === "take_away" ? "Take Away" : `Table ${manualTableNumber}`}`,
          order_id: rzpOrder.razorpayOrderId,
          prefill: { name: customerName.trim(), contact: customerPhone.trim() },
          theme: { color: "#f97316" },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
          }) => {
            try {
              const order = await doPlaceOrder(
                "razorpay",
                `Payment ID: ${response.razorpay_payment_id}`,
              );
              setOrderId(order.id);
              setOrderTotal(total);
              setView("success");
              setCart([]);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      if (msg !== "Payment cancelled") setPlaceError(msg);
    } finally {
      setPlacing(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) return;
    if (!/^[6-9]\d{9}$/.test(customerPhone.replace(/\s/g, ""))) {
      setPlaceError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    if (!paymentMethod) {
      setPlaceError("Please select a payment method");
      return;
    }
    setPlacing(true);
    setPlaceError("");
    try {
      const data = await doPlaceOrder(paymentMethod);
      setOrderId(data.id);
      setOrderTotal(total);
      setCart([]);
      if (paymentMethod === "upi" && restaurant?.upiId && restaurant?.personalUpiEnabled) {
        // Show the payment screen first; the <a href> button there handles the
        // UPI intent dispatch. Auto-redirecting via window.location.href is
        // unreliable across Android browsers and fires before the view renders.
        setView("pending_upi_payment");
      } else {
        setView("success");
      }
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
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

  if (view === "pending_upi_payment" && orderId && restaurant.upiId && restaurant.personalUpiEnabled) {
    return (
      <UpiPaymentView
        orderId={orderId}
        orderTotal={orderTotal}
        restaurant={restaurant}
        orderType={orderType}
        manualTableNumber={manualTableNumber}
        countdown={countdown}
        confirmingPayment={confirmingPayment}
        utrNumber={utrNumber}
        onUtrChange={setUtrNumber}
        onConfirmPayment={confirmPaymentDone}
        onPlaceAnother={() => {
          setView("menu");
          setOrderId(null);
          setPaymentMethod(null);
          setNotes("");
          setUtrNumber("");
        }}
      />
    );
  }

  if (view === "success" && orderId) {
    return (
      <OrderSuccessView
        orderId={orderId}
        orderTotal={orderTotal}
        paymentMethod={paymentMethod}
        orderType={orderType}
        restaurant={restaurant}
        manualTableNumber={manualTableNumber}
        onPlaceAnother={() => {
          setView("menu");
          setOrderId(null);
          setPaymentMethod(null);
          setNotes("");
          setPlaceError("");
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
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        subtotal={subtotal}
        tax={tax}
        total={total}
        placing={placing}
        placeError={placeError}
        paymentGridCols={paymentGridCols}
        onSubmit={paymentMethod === "razorpay" ? handleRazorpayPayment : handlePlaceOrder}
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

  // ── Default: menu browsing view ─────────────────────────────────────────────
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
