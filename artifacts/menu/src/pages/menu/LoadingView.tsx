import { ChefHat } from "lucide-react";

export function LoadingView() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#fff8f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <ChefHat
          style={{
            width: 48,
            height: 48,
            color: "#f97316",
            margin: "0 auto 12px",
            display: "block",
          }}
        />
        <p
          style={{
            color: "#666",
            fontWeight: 500,
            fontFamily: "Inter, sans-serif",
            margin: 0,
          }}
        >
          Loading menu…
        </p>
      </div>
    </div>
  );
}
