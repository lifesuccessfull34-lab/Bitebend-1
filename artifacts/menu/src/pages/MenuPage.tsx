import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
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
  RazorpayCheckoutState,
  PlacedOrderItem,
} from "./menu/types";
import { LoadingView } from "./menu/LoadingView";
import { ErrorView } from "./menu/ErrorView";
import { LandingView } from "./menu/LandingView";
import { OrderSuccessView } from "./menu/OrderSuccessView";
import { CheckoutView } from "./menu/CheckoutView";
import { CartView } from "./menu/CartView";
import { MenuView } from "./menu/MenuView";
import { PaymentBillView } from "./menu/PaymentBillView";
import type { UploadStage } from "./menu/PaymentBillView";
// Legacy Razorpay — only imported when VITE_ENABLE_CUSTOMER_RAZORPAY=true
import { RazorpayCheckout } from "./menu/RazorpayCheckout";
import type { RazorpayResponse } from "./menu/RazorpayCheckout";


/**
 * Feature flag: VITE_ENABLE_CUSTOMER_RAZORPAY
 * false (default) — new QR bill flow active.
 * true            — legacy per-restaurant Razorpay checkout available.
 */
const CUSTOMER_RAZORPAY_ENABLED = import.meta.env["VITE_ENABLE_CUSTOMER_RAZORPAY"] === "true";

const BASE = import.meta.env.VITE_API_URL;
if (!BASE) {
  throw new Error("VITE_API_URL is not set in environment variables");
}

interface ProofResult {
  ocrConfigured: boolean;
  matched?: boolean;
  confidence?: number;
  utr?: string | null;
  amount?: number | null;
  error?: string;
  alreadyHasScreenshot?: boolean;
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
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  // Items from the placed order — used by PaymentBillView
  const [placedOrderItems, setPlacedOrderItems] = useState<PlacedOrderItem[]>([]);

  // Legacy Razorpay checkout state — non-null only when CUSTOMER_RAZORPAY_ENABLED=true
  const [razorpayCheckout, setRazorpayCheckout] = useState<(RazorpayCheckoutState & { customerName: string; customerPhone: string }) | null>(null);
  const [paymentMode, setPaymentMode] = useState<"cash" | "online" | null>(null);
  const [, setLocation] = useLocation();

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
        paymentMethod: paymentMode === "cash" ? "cash" : paymentMode === "online" ? "upi" : null,
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
    if (!paymentMode) {
      setPlaceError("Please select a payment method to continue");
      return;
    }
    setPlacing(true);
    setPlaceError("");
    try {
      const data = await doPlaceOrder();
      setOrderId(data.id);
      setOrderTotal(total);
      // Capture items before clearing cart — PaymentBillView needs them
      setPlacedOrderItems(
        (data.items as Array<{ name: string; quantity: number; unitPrice: number; isVeg: boolean }> ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          isVeg: i.isVeg,
        })),
      );
      setCart([]);
      setProofResult(null);

      if (paymentMode === "online") {
        // Legacy Razorpay path — only when flag is on and restaurant has Razorpay key
        if (CUSTOMER_RAZORPAY_ENABLED && restaurant?.razorpayKeyId) {
          const rzpRes = await fetch(`${BASE}/api/menu/${restaurant.id}/razorpay-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: data.id,
              amount: total,
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim(),
            }),
          });
          const rzpData = await rzpRes.json() as {
            razorpayOrderId: string;
            keyId: string;
            amount: number;
            restaurantName: string;
            error?: string;
          };
          if (!rzpRes.ok) throw new Error(rzpData.error ?? "Failed to create payment");
          setRazorpayCheckout({
            keyId: rzpData.keyId,
            razorpayOrderId: rzpData.razorpayOrderId,
            amountPaise: rzpData.amount,
            restaurantName: rzpData.restaurantName,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
          });
          setView("razorpay_checkout");
        } else {
          // New QR bill flow — show order bill + restaurant QR + screenshot upload
          setView("payment_bill");
        }
      } else {
        setView("success");
      }
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  const handleRazorpaySuccess = async (response: RazorpayResponse) => {
    // Verify payment server-side
    if (orderId && restaurant) {
      try {
        await fetch(`${BASE}/api/menu/${restaurant.id}/orders/${orderId}/verify-razorpay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature,
          }),
        });
      } catch { /* Webhook will handle marking paid — non-fatal */ }
    }
    setRazorpayCheckout(null);
    setView("success");
  };

  const handleRazorpayDismiss = () => {
    // Customer closed the modal without paying — show success view anyway
    // (order is already placed; they can pay at the table or retry)
    setRazorpayCheckout(null);
    setView("success");
  };

  const handleUploadProof = async (file: File, forceReplace = false) => {
    if (!orderId || !restaurant) return;
    setUploadStage("uploading");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadStage("verifying");
      const res = await fetch(
        `${BASE}/api/menu/${restaurant.id}/orders/${orderId}/payment-proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenshotBase64: base64, mimeType: file.type, forceReplace }),
        },
      );
      if (res.status === 409) {
        setProofResult({ ocrConfigured: false, alreadyHasScreenshot: true });
        return;
      }
      const data = await res.json();
      setProofResult(data as ProofResult);
    } catch {
      setProofResult({ ocrConfigured: false, error: "Upload failed. Please try again." });
    } finally {
      setUploadStage("idle");
    }
  };

  const handleReplaceProof = (file: File) => handleUploadProof(file, true);

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
        uploadingProof={uploadStage !== "idle"}
        proofResult={proofResult}
        onUploadProof={handleUploadProof}
        onReplaceProof={handleReplaceProof}
        paymentMode={paymentMode}
        onGoToMenu={() => {
          setView("menu");
          setOrderId(null);
          setNotes("");
          setPlaceError("");
          setProofResult(null);
        }}
        onGoToOrders={() => setLocation("/my-orders")}
      />
    );
  }

  if (view === "razorpay_checkout" && razorpayCheckout) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#faf9f6", padding: "24px",
      }}>
        <RazorpayCheckout
          keyId={razorpayCheckout.keyId}
          razorpayOrderId={razorpayCheckout.razorpayOrderId}
          amountPaise={razorpayCheckout.amountPaise}
          restaurantName={razorpayCheckout.restaurantName}
          customerName={razorpayCheckout.customerName}
          customerPhone={razorpayCheckout.customerPhone}
          onSuccess={handleRazorpaySuccess}
          onDismiss={handleRazorpayDismiss}
        />
        <div style={{ textAlign: "center", maxWidth: "320px" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%",
            background: "#fff7ed", border: "2px solid #fed7aa",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          </div>
          <p style={{ fontWeight: 700, fontSize: "18px", color: "#111827", marginBottom: "8px" }}>
            Complete Your Payment
          </p>
          <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.5 }}>
            A secure payment window should open. If it didn't appear, please check if your browser blocked a popup.
          </p>
          <button
            onClick={handleRazorpayDismiss}
            style={{
              marginTop: "20px", fontSize: "13px", color: "#6b7280",
              background: "none", border: "none", cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Skip — I'll pay later
          </button>
        </div>
      </div>
    );
  }

  if (view === "payment_bill" && orderId) {
    return (
      <PaymentBillView
        orderId={orderId}
        orderTotal={orderTotal}
        restaurant={restaurant}
        orderType={orderType}
        manualTableNumber={manualTableNumber}
        customerName={customerName.trim()}
        orderItems={placedOrderItems}
        uploadStage={uploadStage}
        proofResult={proofResult}
        onUploadProof={handleUploadProof}
        onPrevious={() => {
          setView("menu");
          setOrderId(null);
          setNotes("");
          setPlaceError("");
          setProofResult(null);
        }}
        onNext={() => setView("success")}
        onCashPayment={() => {
          setPaymentMode("cash");
          setView("success");
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
        paymentMode={paymentMode}
        onPaymentModeChange={setPaymentMode}
        hasPaymentQr={restaurant.hasPaymentQr}
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
