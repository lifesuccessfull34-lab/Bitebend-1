import { MapPin, UtensilsCrossed, Receipt } from "lucide-react";
import { useLocation } from "wouter";
import { resolveImageUrl } from "@/lib/image";
import type { RestaurantData, OrderType } from "./types";

interface Props {
  restaurant: RestaurantData;
  orderType: OrderType | null;
  manualTableNumber: string;
  takeAwayOnly: boolean;
  onChangeMode: () => void;
  tableId?: string;
}

export function MenuHeader({
  restaurant,
  orderType,
  manualTableNumber,
  takeAwayOnly,
  onChangeMode,
  tableId,
}: Props) {
  const [, setLocation] = useLocation();
  const modeLabel =
    orderType === "take_away"
      ? "Take Away"
      : `${restaurant.seatingLabel ?? "Table"} ${manualTableNumber}`;

  const cuisineLabel = restaurant.cuisineType
    ? restaurant.cuisineType.replace(/_/g, " ")
    : null;

  return (
    <div
      className="text-white"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
        paddingBottom: "18px",
        paddingLeft: "16px",
        paddingRight: "16px",
        background: restaurant.logoUrl
          ? `linear-gradient(rgba(180,55,0,0.72), rgba(220,78,0,0.68)), url(${resolveImageUrl(restaurant.logoUrl)}) center/cover no-repeat`
          : "linear-gradient(135deg, #c2410c 0%, #ea580c 55%, #f97316 100%)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", maxWidth: "640px" }}>
        {/* Logo or icon */}
        {restaurant.logoUrl ? (
          <img
            src={resolveImageUrl(restaurant.logoUrl)!}
            alt={restaurant.name}
            style={{
              width: "48px", height: "48px",
              borderRadius: "12px",
              objectFit: "cover",
              flexShrink: 0,
              border: "2px solid rgba(255,255,255,0.25)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.20)",
            }}
          />
        ) : (
          <div style={{
            width: "44px", height: "44px",
            borderRadius: "12px",
            backgroundColor: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <UtensilsCrossed style={{ width: "22px", height: "22px", color: "#fff" }} />
          </div>
        )}

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: "20px", fontWeight: 900,
            lineHeight: "1.2", letterSpacing: "-0.01em",
            color: "#fff", margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {restaurant.name}
          </h1>

          {/* Cuisine type + city */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
            {cuisineLabel && (
              <span style={{ color: "rgba(255,255,255,0.82)", fontSize: "12px", fontWeight: 500, textTransform: "capitalize" }}>
                {cuisineLabel}
              </span>
            )}
            {cuisineLabel && restaurant.city && (
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>·</span>
            )}
            {restaurant.city && (
              <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "rgba(255,255,255,0.72)", fontSize: "12px" }}>
                <MapPin style={{ width: "11px", height: "11px", flexShrink: 0 }} />
                {restaurant.city}
              </span>
            )}
          </div>

          {/* Mode row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
            <span style={{
              backgroundColor: "rgba(255,255,255,0.18)",
              borderRadius: "20px",
              padding: "2px 10px",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.01em",
            }}>
              {modeLabel}
            </span>
            {!takeAwayOnly && (
              <button
                onClick={onChangeMode}
                style={{
                  color: "rgba(255,255,255,0.60)",
                  fontSize: "11px",
                  textDecoration: "underline",
                  padding: "2px 0",
                }}
              >
                change
              </button>
            )}
          </div>
        </div>

        {/* My Orders button */}
        <button
          onClick={() => setLocation(`/my-orders?rid=${restaurant.id}${tableId ? `&tid=${tableId}` : ""}`)}
          aria-label="My Orders"
          title="My Orders"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "36px", height: "36px",
            borderRadius: "10px",
            backgroundColor: "rgba(255,255,255,0.18)",
            flexShrink: 0,
            border: "none",
            cursor: "pointer",
          }}
        >
          <Receipt style={{ width: "18px", height: "18px", color: "#fff" }} />
        </button>
      </div>
    </div>
  );
}
