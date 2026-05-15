import {
  ChefHat,
  CheckCircle2,
  UtensilsCrossed,
  ShoppingBag,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RestaurantData, OrderType, TableData } from "./types";

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
  return (
    <div className="bg-background overflow-y-auto" style={{ minHeight: "100dvh" }}>
      {/* Restaurant header — compact so it doesn't eat space on small screens */}
      {/* paddingTop: safe-area + 20 px breathing room — pt-8 (32 px) is not
          enough on iPhone 14 whose notch is 47 px. env() falls back to 0
          on flat phones so they get just 20 px, consistent with the old pt-5.
          px-5 kept as a class; paddingTop handled inline because env() can't
          be composed inside a Tailwind class value.                         */}
      <div
        className="bg-gradient-to-br from-orange-500 to-amber-500 text-white px-5 pb-14"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        <div className="flex items-center gap-3 max-w-md mx-auto">
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="w-12 h-12 rounded-xl object-cover bg-white/20 shrink-0"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{restaurant.name}</h1>
            <p className="text-orange-100 text-xs capitalize mt-0.5">
              {(restaurant.cuisineType || "").replace(/_/g, " ")}
            </p>
            <div className="flex items-center gap-1 mt-0.5 text-orange-100 text-xs">
              <MapPin className="w-3 h-3" />
              {restaurant.city}
            </div>
          </div>
        </div>
      </div>

      {/* Selection card */}
      <div className="-mt-8 px-4 pb-10">
        <div className="bg-card border border-border rounded-2xl shadow-lg p-5 max-w-md mx-auto">
          <h2 className="text-base font-bold text-center mb-1">
            How would you like to order?
          </h2>
          <p className="text-xs text-muted-foreground text-center mb-5">
            Choose your preference to continue
          </p>

          <div className={cn("gap-3 mb-5", takeAwayOnly ? "flex" : "grid grid-cols-2")}>
            {/* Dine In — hidden when restaurant is configured as Take Away Only */}
            {!takeAwayOnly && (
              <button
                onClick={() => {
                  setOrderType("dine_in");
                  setTableInputError("");
                }}
                className={cn(
                  "flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all",
                  orderType === "dine_in"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    orderType === "dine_in" ? "bg-primary/10" : "bg-muted",
                  )}
                >
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-sm text-foreground">Dine In</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Eat at restaurant</p>
                </div>
                {orderType === "dine_in" && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </button>
            )}

            {/* Take Away */}
            <button
              onClick={() => {
                setOrderType("take_away");
                setManualTableNumber("");
                setSelectedTableId(null);
                setTableInputError("");
              }}
              className={cn(
                "flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all",
                orderType === "take_away"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  orderType === "take_away" ? "bg-primary/10" : "bg-muted",
                )}
              >
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm text-foreground">Take Away</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pick up & go</p>
              </div>
              {orderType === "take_away" && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </button>
          </div>

          {/* Dine-in: area + table selection */}
          {orderType === "dine_in" && (
            <div className="mb-4 space-y-3">
              {/* Area picker — only shown when the restaurant has areas configured */}
              {hasAreas && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    Select Area
                  </label>
                  <div className="flex flex-wrap gap-2">
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
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                          selectedArea === area
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:border-primary/50",
                        )}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                  {tableInputError && !selectedArea && (
                    <p className="text-xs text-destructive">{tableInputError}</p>
                  )}
                </div>
              )}

              {/* Table selector — chip grid if tables exist for this area, else free-text */}
              {(!hasAreas || selectedArea) && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-primary" />
                    Your {restaurant.seatingLabel} Number
                    {selectedArea && (
                      <span className="text-xs text-muted-foreground font-normal">
                        · {selectedArea}
                      </span>
                    )}
                  </label>

                  {/* Chip grid — selectable table buttons */}
                  {tablesInArea.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {tablesInArea.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setManualTableNumber(t.tableNumber);
                            setSelectedTableId(t.id);
                            setTableInputError("");
                          }}
                          className={cn(
                            "px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                            manualTableNumber === t.tableNumber && selectedTableId === t.id
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : t.isOccupied
                                ? "border-border bg-muted text-muted-foreground opacity-60"
                                : "border-border bg-background text-foreground hover:border-primary/50",
                          )}
                        >
                          {t.tableNumber}
                          {t.isOccupied && (
                            <span className="ml-1 text-[10px] opacity-70">(busy)</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* No tables configured — guide the customer */
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 py-4 px-3 text-center">
                      <p className="text-sm text-muted-foreground font-medium">
                        No {restaurant.seatingLabel?.toLowerCase() ?? "table"}s configured
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Please ask staff for assistance
                      </p>
                    </div>
                  )}

                  {tableInputError && (selectedArea || !hasAreas) && manualTableNumber === "" && (
                    <p className="text-xs text-destructive">{tableInputError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onContinue}
            disabled={!orderType}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            View Menu <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
