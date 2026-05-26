import {
  ChefHat,
  CheckCircle2,
  UtensilsCrossed,
  ShoppingBag,
  MapPin,
  ArrowRight,
} from "lucide-react";
import type { RestaurantData, OrderType, TableData } from "./types";

const C = {
  orange:    "#ea580c",
  orangeBg:  "#fff7ed",
  orangeBdr: "#fed7aa",
  card:      "#ffffff",
  border:    "#ede8e3",
  ink:       "#1a0a00",
  muted:     "#6b7280",
  mutedBg:   "#f5f0eb",
  bg:        "#faf9f6",
  green:     "#16a34a",
} as const;

interface Props {
  restaurant: RestaurantData;
  orderType: OrderType | null;
  setOrderType: (t: OrderType) => void;
  takeAwayOnly: boolean;
  hasAreas: boolean;
  areas: string[];
  selectedArea: string | null;
  setSelectedArea: (a: string | null) => void;
  manualTableNumber: string;
  setManualTableNumber: (n: string) => void;
  selectedTableId: number | null;
  setSelectedTableId: (id: number | null) => void;
  tableInputError: string;
  setTableInputError: (e: string) => void;
  tablesInArea: TableData[];
  onContinue: () => void;
}

export function LandingView({
  restaurant,
  orderType,
  setOrderType,
  takeAwayOnly,
  hasAreas,
  areas,
  selectedArea,
  setSelectedArea,
  manualTableNumber,
  setManualTableNumber,
  selectedTableId,
  setSelectedTableId,
  tableInputError,
  setTableInputError,
  tablesInArea,
  onContinue,
}: Props) {

  /* ── Option-card style factory ───────────────────────────── */
  const optionCard = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "16px 12px",
    borderRadius: "14px",
    border: `2px solid ${active ? C.orange : C.border}`,
    backgroundColor: active ? C.orangeBg : C.card,
    cursor: "pointer",
    transition: "border-color 0.15s, background-color 0.15s",
  });

  const iconWrap = (active: boolean): React.CSSProperties => ({
    width: "48px", height: "48px",
    borderRadius: "12px",
    display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: active ? `${C.orange}18` : C.mutedBg,
  });

  const chipBase: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: "8px",
    border: `1.5px solid ${C.border}`,
    backgroundColor: C.card,
    fontSize: "13px", fontWeight: 600,
    color: C.ink, cursor: "pointer",
  };
  const chipActive: React.CSSProperties = {
    ...chipBase,
    border: `1.5px solid ${C.orange}`,
    backgroundColor: C.orange,
    color: "#fff",
  };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: C.bg }}>

      {/* ── Restaurant header — orange gradient ──────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)",
        color: "#fff",
        paddingLeft: "20px", paddingRight: "20px",
        paddingBottom: "52px",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", maxWidth: "480px", margin: "0 auto" }}>
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              style={{
                width: "48px", height: "48px", borderRadius: "12px",
                objectFit: "cover", backgroundColor: "rgba(255,255,255,0.2)",
                flexShrink: 0,
              }}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div style={{
              width: "48px", height: "48px", borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <ChefHat style={{ width: "24px", height: "24px", color: "#fff" }} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, lineHeight: "1.2", color: "#fff" }}>
              {restaurant.name}
            </h1>
            {restaurant.cuisineType && (
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", marginTop: "2px", textTransform: "capitalize" }}>
                {restaurant.cuisineType.replace(/_/g, " ")}
              </p>
            )}
            {restaurant.city && (
              <div style={{ display: "flex", alignItems: "center", gap: "3px", marginTop: "2px" }}>
                <MapPin style={{ width: "11px", height: "11px", color: "rgba(255,255,255,0.75)" }} />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)" }}>{restaurant.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Selection card ───────────────────────────────────── */}
      <div style={{ marginTop: "-32px", padding: "0 16px 40px" }}>
        <div style={{
          backgroundColor: C.card,
          borderRadius: "20px",
          border: `1px solid ${C.border}`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.09)",
          padding: "20px",
          maxWidth: "480px",
          margin: "0 auto",
        }}>

          <h2 style={{ fontSize: "16px", fontWeight: 700, color: C.ink, textAlign: "center", marginBottom: "4px" }}>
            How would you like to order?
          </h2>
          <p style={{ fontSize: "12px", color: C.muted, textAlign: "center", marginBottom: "20px" }}>
            Choose your preference to continue
          </p>

          {/* ── Dine In / Take Away option row ───────────────── */}
          {/*
           * Using flex instead of CSS grid so this works on older Android
           * WebViews that don't fully support CSS @layer (Tailwind v4 issue).
           * Each card gets flex: 1 for equal width.
           */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>

            {!takeAwayOnly && (
              <button
                type="button"
                onClick={() => { setOrderType("dine_in"); setTableInputError(""); }}
                style={optionCard(orderType === "dine_in")}
              >
                <div style={iconWrap(orderType === "dine_in")}>
                  <UtensilsCrossed style={{ width: "22px", height: "22px", color: orderType === "dine_in" ? C.orange : C.muted }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: C.ink, lineHeight: "1.2" }}>Dine In</p>
                  <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>Eat at restaurant</p>
                </div>
                {orderType === "dine_in" && (
                  <div style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    backgroundColor: C.orange,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CheckCircle2 style={{ width: "13px", height: "13px", color: "#fff" }} />
                  </div>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOrderType("take_away");
                setManualTableNumber("");
                setSelectedTableId(null);
                setTableInputError("");
              }}
              style={optionCard(orderType === "take_away")}
            >
              <div style={iconWrap(orderType === "take_away")}>
                <ShoppingBag style={{ width: "22px", height: "22px", color: orderType === "take_away" ? C.orange : C.muted }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "14px", fontWeight: 700, color: C.ink, lineHeight: "1.2" }}>Take Away</p>
                <p style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>Pick up &amp; go</p>
              </div>
              {orderType === "take_away" && (
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%",
                  backgroundColor: C.orange,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CheckCircle2 style={{ width: "13px", height: "13px", color: "#fff" }} />
                </div>
              )}
            </button>
          </div>

          {/* ── Dine-in: area + table selection ──────────────── */}
          {orderType === "dine_in" && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

              {/* Area picker */}
              {hasAreas && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: C.ink, marginBottom: "8px" }}>
                    <MapPin style={{ width: "13px", height: "13px", color: C.orange }} />
                    Select Area
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {areas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setSelectedArea(area);
                          setManualTableNumber("");
                          setSelectedTableId(null);
                          setTableInputError("");
                        }}
                        style={selectedArea === area ? chipActive : chipBase}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                  {tableInputError && !selectedArea && (
                    <p style={{ fontSize: "11px", color: "#dc2626", marginTop: "6px" }}>{tableInputError}</p>
                  )}
                </div>
              )}

              {/* Table selector */}
              {(!hasAreas || selectedArea) && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: 600, color: C.ink, marginBottom: "8px" }}>
                    <UtensilsCrossed style={{ width: "13px", height: "13px", color: C.orange }} />
                    Your {restaurant.seatingLabel} Number
                    {selectedArea && (
                      <span style={{ fontSize: "11px", color: C.muted, fontWeight: 400 }}>· {selectedArea}</span>
                    )}
                  </label>

                  {tablesInArea.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {tablesInArea.map((t) => {
                        const isSelected = manualTableNumber === t.tableNumber && selectedTableId === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setManualTableNumber(t.tableNumber);
                              setSelectedTableId(t.id);
                              setTableInputError("");
                            }}
                            style={isSelected ? chipActive : {
                              ...chipBase,
                              opacity: t.isOccupied ? 0.55 : 1,
                              color: t.isOccupied ? C.muted : C.ink,
                            }}
                          >
                            {t.tableNumber}
                            {t.isOccupied && <span style={{ marginLeft: "4px", fontSize: "10px", opacity: 0.7 }}>(busy)</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{
                      borderRadius: "12px", border: `1.5px dashed ${C.border}`,
                      backgroundColor: C.mutedBg, padding: "16px 12px", textAlign: "center",
                    }}>
                      <p style={{ fontSize: "13px", color: C.muted, fontWeight: 500 }}>
                        No {restaurant.seatingLabel?.toLowerCase() ?? "table"}s configured
                      </p>
                      <p style={{ fontSize: "11px", color: C.muted, opacity: 0.7, marginTop: "3px" }}>
                        Please ask staff for assistance
                      </p>
                    </div>
                  )}

                  {tableInputError && (selectedArea || !hasAreas) && manualTableNumber === "" && (
                    <p style={{ fontSize: "11px", color: "#dc2626", marginTop: "6px" }}>{tableInputError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── View Menu CTA ─────────────────────────────────── */}
          <button
            type="button"
            onClick={onContinue}
            disabled={!orderType}
            style={{
              width: "100%", height: "50px",
              borderRadius: "14px",
              backgroundColor: orderType ? C.orange : "#e5e7eb",
              color: orderType ? "#fff" : "#9ca3af",
              fontWeight: 700, fontSize: "15px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              cursor: orderType ? "pointer" : "not-allowed",
              transition: "background-color 0.15s",
              boxShadow: orderType ? "0 4px 14px rgba(234,88,12,0.28)" : "none",
            }}
          >
            View Menu
            <ArrowRight style={{ width: "18px", height: "18px" }} />
          </button>

        </div>
      </div>
    </div>
  );
}
