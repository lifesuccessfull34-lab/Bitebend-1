import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface OrderEvent {
  id: number;
  customerName: string | null;
  tableNumber: string | null;
  total: number;
  itemCount: number;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    // AudioContext not available (e.g. browser blocked autoplay)
  }
}

interface UseOrderNotificationsOptions {
  enabled: boolean;
  onNewOrder?: () => void;
  onSessionScreenshotReceived?: (sessionId: number) => void;
}

export function useOrderNotifications({ enabled, onNewOrder, onSessionScreenshotReceived }: UseOrderNotificationsOptions) {
  const { toast } = useToast();
  const retryDelayRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs so the SSE connection is never torn down/rebuilt
  // just because the callback identity changes between renders.
  const onNewOrderRef = useRef(onNewOrder);
  const onSessionScreenshotRef = useRef(onSessionScreenshotReceived);
  useEffect(() => { onNewOrderRef.current = onNewOrder; }, [onNewOrder]);
  useEffect(() => { onSessionScreenshotRef.current = onSessionScreenshotReceived; }, [onSessionScreenshotReceived]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;

    function connect() {
      if (stopped) return;

      const es = new EventSource("/api/owner/orders/stream", { withCredentials: true });
      esRef.current = es;

      es.addEventListener("new-order", (e: MessageEvent) => {
        retryDelayRef.current = 1000;

        let order: OrderEvent;
        try {
          order = JSON.parse(e.data as string) as OrderEvent;
        } catch {
          return;
        }

        playNotificationSound();

        const table = order.tableNumber ? `Table ${order.tableNumber}` : "Take-away";
        const name = order.customerName ? ` · ${order.customerName}` : "";
        const amount = `₹${(order.total / 100).toLocaleString("en-IN")}`;

        toast({
          title: "New Order!",
          description: `${table}${name} — ${order.itemCount} item${order.itemCount !== 1 ? "s" : ""} — ${amount}`,
        });

        onNewOrderRef.current?.();
      });

      es.addEventListener("screenshot-received", (e: MessageEvent) => {
        retryDelayRef.current = 1000;

        interface ScreenshotEvent { orderId: number; customerPhone: string; customerName: string | null; total: number; }
        let event: ScreenshotEvent;
        try {
          event = JSON.parse(e.data as string) as ScreenshotEvent;
        } catch {
          return;
        }

        playNotificationSound();

        const name = event.customerName ? ` · ${event.customerName}` : "";
        const amount = `₹${event.total.toLocaleString("en-IN")}`;

        toast({
          title: "📸 Payment Screenshot Received",
          description: `Order #${event.orderId}${name} — ${amount} via WhatsApp`,
        });

        onNewOrderRef.current?.();
      });

      es.addEventListener("session-screenshot-received", (e: MessageEvent) => {
        retryDelayRef.current = 1000;

        interface SessionScreenshotEvent {
          sessionId: number;
          billId: number;
          tableNumber: string;
          billNumber: string;
          total: number;
          customerPhone: string;
        }
        let event: SessionScreenshotEvent;
        try {
          event = JSON.parse(e.data as string) as SessionScreenshotEvent;
        } catch {
          return;
        }

        playNotificationSound();

        toast({
          title: "📸 Payment Screenshot Received",
          description: `Table ${event.tableNumber} — ${event.billNumber} — ₹${event.total.toLocaleString("en-IN")}`,
        });

        // Invalidate cached screenshot for this session so next "Verify Payment"
        // click loads a fresh image even if a previous screenshot was cached.
        onSessionScreenshotRef.current?.(event.sessionId);
        onNewOrderRef.current?.();
      });

      es.addEventListener("heartbeat", () => {
        retryDelayRef.current = 1000;
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!stopped) {
          const delay = retryDelayRef.current;
          retryDelayRef.current = Math.min(delay * 2, 30000);
          retryTimerRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [enabled, toast]);
}
