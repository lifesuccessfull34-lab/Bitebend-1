import { ShoppingCart, ArrowRight } from "lucide-react";

interface Props {
  itemCount: number;
  subtotal: number;
  onOpen: () => void;
}

export function CartBar({ itemCount, subtotal, onOpen }: Props) {
  if (itemCount === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      zIndex: 30,
      /* Gradient fade prevents a hard content cut-off behind the bar */
      background: "linear-gradient(to top, #faf9f6 55%, rgba(250,249,246,0) 100%)",
      padding: "18px 16px",
      /*
       * paddingBottom: safe-area-inset-bottom (0 on flat phones / Android w/o notch,
       * ~34px on iPhone 14, ~20px on Android with gesture nav) + 12px breathing room.
       * Works correctly because viewport-fit=cover is set in index.html.
       */
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
    }}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <button
          onClick={onOpen}
          style={{
            width: "100%",
            height: "50px",
            borderRadius: "13px",
            backgroundColor: "#ea580c",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 14px",
            boxShadow: "0 4px 16px rgba(234,88,12,0.36)",
          }}
        >
          {/* Cart icon */}
          <ShoppingCart style={{ width: "18px", height: "18px", flexShrink: 0, opacity: 0.9 }} />

          {/* Item count badge */}
          <div style={{
            backgroundColor: "rgba(255,255,255,0.22)",
            borderRadius: "6px",
            minWidth: "22px", height: "22px",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px",
            fontSize: "11px", fontWeight: 800,
            flexShrink: 0,
          }}>
            {itemCount}
          </div>

          {/* Label */}
          <span style={{ flex: 1, textAlign: "left", fontSize: "14px", fontWeight: 700 }}>
            View Cart
          </span>

          {/* Total + arrow */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: "15px" }}>₹{subtotal}</span>
            <ArrowRight style={{ width: "15px", height: "15px", opacity: 0.85 }} />
          </div>
        </button>
      </div>
    </div>
  );
}
