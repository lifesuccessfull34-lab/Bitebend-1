import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function sendCrashBeacon(error: Error, info: ErrorInfo): void {
  try {
    const payload = {
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack,
      url: typeof window !== "undefined" ? window.location.href : "",
      ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      ts: Date.now(),
      build: typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : null,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/menu/client-error", blob);
    }
  } catch {
    // sendBeacon unavailable — fail silently
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
    sendCrashBeacon(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "16px",
            fontFamily: "Inter, sans-serif",
            padding: "24px",
            textAlign: "center",
            background: "#fff8f5",
          }}
        >
          <div style={{ fontSize: "48px" }}>⚠️</div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#111" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", fontSize: "14px", maxWidth: "320px" }}>
            The menu encountered an error. Please reload or scan the QR code again.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: "11px",
                color: "#999",
                background: "#f5f5f5",
                padding: "8px 12px",
                borderRadius: "6px",
                maxWidth: "480px",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#f97316",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
