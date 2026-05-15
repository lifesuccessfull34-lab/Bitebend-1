import type { RestaurantData, OrderType } from "./types";

interface Props {
  restaurant: RestaurantData;
  orderType: OrderType | null;
  manualTableNumber: string;
  takeAwayOnly: boolean;
  onChangeMode: () => void;
}

export function MenuHeader({
  restaurant,
  orderType,
  manualTableNumber,
  takeAwayOnly,
  onChangeMode,
}: Props) {
  const modeLabel =
    orderType === "take_away"
      ? "Take Away"
      : `${restaurant.seatingLabel ?? "Table"} ${manualTableNumber}`;

  return (
    <div
      className="text-white"
      style={{
        /* paddingTop accounts for the iOS notch / Android punch-hole camera once
         * viewport-fit=cover is set. env(safe-area-inset-top) is 0 on flat phones
         * so this gracefully degrades to 16px. */
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
        paddingBottom: "14px",
        paddingLeft: "16px",
        paddingRight: "16px",
        background: restaurant.logoUrl
          ? `linear-gradient(rgba(194,65,12,0.75), rgba(234,88,12,0.70)), url(${restaurant.logoUrl}) center/cover no-repeat`
          : "linear-gradient(135deg, #ea580c 0%, #f97316 60%, #fb923c 100%)",
      }}
    >
      <h1 style={{ fontSize: "20px", fontWeight: 900, lineHeight: "1.25", letterSpacing: "-0.01em", margin: 0 }}>
        {restaurant.name}
      </h1>
      <div className="flex items-center gap-2" style={{ marginTop: "4px" }}>
        <span style={{ color: "rgba(255,255,255,0.80)", fontSize: "13px", fontWeight: 500 }}>{modeLabel}</span>
        {!takeAwayOnly && (
          <button
            onClick={onChangeMode}
            style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", textDecoration: "underline" }}
          >
            change
          </button>
        )}
      </div>
    </div>
  );
}
