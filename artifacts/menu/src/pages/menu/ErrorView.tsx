import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  error: string | null;
}

export function ErrorView({ error }: Props) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#fff8f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "320px" }}>
        <AlertCircle
          style={{
            width: "48px", height: "48px",
            color: "#dc2626",
            margin: "0 auto 12px",
            display: "block",
          }}
        />
        <h1
          style={{
            fontSize: "18px", fontWeight: 700,
            color: "#1a0a00", marginBottom: "8px",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Menu Unavailable
        </h1>
        <p
          style={{
            fontSize: "14px", color: "#6b7280",
            lineHeight: "1.5", marginBottom: "20px",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {error ?? "Restaurant not found"}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            height: "44px", padding: "0 20px",
            borderRadius: "10px",
            backgroundColor: "#ea580c", color: "#fff",
            fontWeight: 600, fontSize: "14px",
            border: "none", cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <RefreshCw style={{ width: "16px", height: "16px" }} />
          Try Again
        </button>
      </div>
    </div>
  );
}
