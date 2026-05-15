import {
  Smartphone,
  ShoppingBag,
  UtensilsCrossed,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { generateUPILink } from "./utils";
import type { RestaurantData, OrderType } from "./types";

interface Props {
  orderId: number;
  orderTotal: number;
  restaurant: RestaurantData;
  orderType: OrderType | null;
  manualTableNumber: string;
  countdown: number;
  confirmingPayment: boolean;
  onConfirmPayment: () => void;
  onPlaceAnother: () => void;
}

export function UpiPaymentView({
  orderId,
  orderTotal,
  restaurant,
  orderType,
  manualTableNumber,
  countdown,
  confirmingPayment,
  onConfirmPayment,
  onPlaceAnother,
}: Props) {
  const upiLink = generateUPILink(
    restaurant.upiId!,
    restaurant.name,
    orderTotal,
    orderId,
  );
  const isTakeAway = orderType === "take_away";
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const timedOut = countdown === 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm w-full">

        {/* Amber phone icon */}
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Smartphone className="w-10 h-10 text-amber-500" />
        </div>

        <h1 className="text-2xl font-bold mb-1">Complete Your Payment</h1>
        <p className="text-muted-foreground mb-1">
          Please complete your UPI payment to confirm your order
        </p>
        <p className="text-xs text-muted-foreground mb-4">Order #{orderId}</p>

        {/* Location */}
        <div className="flex items-center justify-center gap-2 mb-5 text-sm text-muted-foreground">
          {isTakeAway ? (
            <>
              <ShoppingBag className="w-4 h-4" /> Take Away · {restaurant.name}
            </>
          ) : (
            <>
              <UtensilsCrossed className="w-4 h-4" /> {restaurant.seatingLabel}{" "}
              {manualTableNumber} · {restaurant.name}
            </>
          )}
        </div>

        {/* UPI payment card */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 space-y-3 text-left">
          <p className="text-sm font-bold text-amber-800">
            Total: ₹{orderTotal.toFixed(2)}
          </p>

          {/* Step 1 */}
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <p className="text-xs text-amber-800">
              Tap the button below to open your UPI app and complete payment
            </p>
          </div>

          <a
            href={upiLink}
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 active:bg-amber-700 transition-colors"
          >
            <Smartphone className="w-5 h-5" /> Pay ₹{orderTotal.toFixed(2)} via UPI
          </a>
          <p className="text-xs text-amber-600 text-center">
            Opens GPay, PhonePe, Paytm or any UPI app
          </p>

          {/* Step 2 */}
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <p className="text-xs text-amber-800">
              After paying, return here and tap{" "}
              <strong>"I have completed payment"</strong> below
            </p>
          </div>

          <div className="bg-amber-100 rounded-lg px-3 py-2.5 text-center">
            <p className="text-xs text-amber-800 font-medium">
              📸 Screenshot your payment as proof for staff
            </p>
          </div>
        </div>

        {/* Countdown */}
        {!timedOut ? (
          <p className="text-xs text-muted-foreground mb-5 flex items-center justify-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Order expires in {mins}:{secs.toString().padStart(2, "0")}
          </p>
        ) : (
          <p className="text-xs text-red-500 font-medium mb-5">
            Payment time has expired. Please place a new order.
          </p>
        )}

        {/* "I have completed payment" */}
        {!timedOut && (
          <button
            onClick={onConfirmPayment}
            disabled={confirmingPayment}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm mb-3 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {confirmingPayment ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> I have completed payment
              </>
            )}
          </button>
        )}

        <button
          onClick={onPlaceAnother}
          className="w-full py-2.5 text-muted-foreground text-sm rounded-xl hover:bg-muted transition-colors"
        >
          Place Another Order
        </button>
      </div>
    </div>
  );
}
