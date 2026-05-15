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
}

export function useOrderNotifications({ enabled, onNewOrder }: UseOrderNotificationsOptions) {
  const { toast } = useToast();
  const retryDelayRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        onNewOrder?.();
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
  }, [enabled, onNewOrder, toast]);
}
