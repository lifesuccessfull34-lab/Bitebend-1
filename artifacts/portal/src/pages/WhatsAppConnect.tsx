import { useState, useEffect, useRef, useCallback } from "react";
import { Redirect } from "wouter";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { Wifi, WifiOff, Loader2, Smartphone, CheckCircle2, XCircle, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

type WhatsAppStatus =
  | "not_initialised"
  | "initialising"
  | "qr_pending"
  | "connecting"
  | "connected"
  | "disconnected"
  | "auth_failed";

const STATUS_LABEL: Record<WhatsAppStatus, string> = {
  not_initialised: "Not connected",
  initialising:    "Starting up…",
  qr_pending:      "Scan QR code",
  connecting:      "Authenticating…",
  connected:       "Connected",
  disconnected:    "Disconnected",
  auth_failed:     "Auth failed — please try again",
};

const STATUS_COLOR: Record<WhatsAppStatus, string> = {
  not_initialised: "text-muted-foreground",
  initialising:    "text-orange-500",
  qr_pending:      "text-orange-500",
  connecting:      "text-orange-500",
  connected:       "text-green-600",
  disconnected:    "text-red-500",
  auth_failed:     "text-red-500",
};

export default function WhatsAppConnect() {
  const { user, loading: authLoading } = useAuth();
  const restaurantId = user?.restaurantId;

  const [status, setStatus]         = useState<WhatsAppStatus>("not_initialised");
  const [qrString, setQrString]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const socketRef                   = useRef<Socket | null>(null);

  // Fetch initial status from the API server
  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/owner/whatsapp/status", { credentials: "include" });
      if (r.ok) {
        const data = await r.json() as { status: WhatsAppStatus };
        setStatus(data.status ?? "not_initialised");
      }
    } catch {
      // bridge might not be running yet — keep "not_initialised"
    }
  }, []);

  // Connect Socket.IO to the bridge via the API-server proxy
  useEffect(() => {
    if (!restaurantId) return;

    fetchStatus();

    const socket = io(window.location.origin, {
      path: "/whatsapp-bridge/socket.io",
      query: { restaurantId: String(restaurantId) },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("whatsapp:qr", ({ qr }: { qr: string }) => {
      setQrString(qr);
      setStatus("qr_pending");
    });

    socket.on("whatsapp:status", ({ status: s }: { status: WhatsAppStatus }) => {
      setStatus(s);
      if (s === "connected") {
        setQrString(null);
        setLoading(false);
      }
      if (s === "auth_failed" || s === "disconnected") {
        setQrString(null);
        setLoading(false);
      }
    });

    socket.on("connect_error", () => {
      // Bridge not running — silently degrade (status stays as polled value)
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [restaurantId, fetchStatus]);

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    setQrString(null);
    setStatus("initialising");

    try {
      const r = await fetch("/api/owner/whatsapp/connect", {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json() as { success?: boolean; error?: string };
      if (!r.ok || !data.success) {
        setError(data.error ?? "Failed to start WhatsApp connection");
        setStatus("not_initialised");
        setLoading(false);
      }
      // QR + status will arrive via Socket.IO
    } catch {
      setError("Could not reach the WhatsApp Bridge. Make sure it is running.");
      setStatus("not_initialised");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await fetch("/api/owner/whatsapp/disconnect", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setStatus("not_initialised");
    setQrString(null);
    setLoading(false);
  };

  // Auth guard — all hooks above, redirect is safe here
  if (!authLoading && !user) {
    return <Redirect to="/restaurant/auth" />;
  }

  const isConnected   = status === "connected";
  const isPending     = status === "initialising" || status === "connecting";
  const isQrPending   = status === "qr_pending";
  const showConnect   = !isConnected && !isPending && !isQrPending;

  return (
    <AppShell>
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Connection</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect your restaurant's WhatsApp account to send order confirmations and communicate with customers directly.
          </p>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-border bg-card p-5 mb-5 flex items-center gap-4">
          <div className={`flex-shrink-0 rounded-full p-2.5 ${isConnected ? "bg-green-50" : "bg-muted"}`}>
            {isConnected
              ? <Wifi className="w-6 h-6 text-green-600" />
              : <WifiOff className="w-6 h-6 text-muted-foreground" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Status</p>
            <p className={`text-sm font-semibold ${STATUS_COLOR[status]}`}>
              {STATUS_LABEL[status]}
            </p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active
            </div>
          )}
          {(status === "disconnected" || status === "auth_failed") && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium bg-red-50 px-2.5 py-1 rounded-full">
              <XCircle className="w-3.5 h-3.5" />
              Offline
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {/* QR Code panel */}
        {isQrPending && qrString && (
          <div className="rounded-xl border border-border bg-card p-6 mb-5 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm">
              <Smartphone className="w-4 h-4" />
              Scan with WhatsApp on your phone
            </div>
            <div className="p-4 bg-white rounded-xl border border-border shadow-sm">
              <QRCodeSVG value={qrString} size={220} />
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside text-left w-full max-w-xs">
              <li>Open WhatsApp on your phone</li>
              <li>Tap <strong>Menu</strong> (⋮) → <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Point your phone at this QR code</li>
            </ol>
            <p className="text-xs text-muted-foreground">QR code expires in ~60 seconds. A new one will appear automatically.</p>
          </div>
        )}

        {/* Initialising / connecting spinner */}
        {isPending && (
          <div className="rounded-xl border border-border bg-card p-6 mb-5 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-sm text-muted-foreground">
              {status === "initialising" ? "Starting WhatsApp client…" : "Authenticating with WhatsApp…"}
            </p>
            <p className="text-xs text-muted-foreground">This usually takes 10–30 seconds</p>
          </div>
        )}

        {/* Connected state */}
        {isConnected && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 mb-5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">WhatsApp is connected</p>
              <p className="text-sm text-green-700 mt-0.5">
                Your restaurant can now send and receive WhatsApp messages. The session persists automatically — no need to scan again after a restart.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {showConnect && (
            <Button
              onClick={handleConnect}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting…</>
                : <><Wifi className="w-4 h-4 mr-2" />Connect WhatsApp</>
              }
            </Button>
          )}

          {isQrPending && (
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate QR
            </Button>
          )}

          {isConnected && (
            <Button variant="outline" onClick={handleDisconnect} className="text-red-600 border-red-200 hover:bg-red-50">
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          )}

          {(status === "disconnected" || status === "auth_failed") && (
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
        </div>

        {/* Info panel */}
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5 space-y-2">
          <p className="text-sm font-semibold text-foreground">How it works</p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Click <strong>Connect WhatsApp</strong> — a QR code appears</li>
            <li>Scan it with WhatsApp on your phone (Linked Devices)</li>
            <li>Your session is saved — it auto-reconnects after restarts</li>
            <li>Customers can now receive order updates on WhatsApp</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
