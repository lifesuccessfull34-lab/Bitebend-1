import { useEffect, useRef } from "react";

// Razorpay's checkout.js is loaded dynamically — no npm package needed.
// It injects a global `Razorpay` constructor on the window.

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    contact?: string;
  };
  theme?: { color?: string };
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    animation?: boolean;
  };
  handler: (response: RazorpayResponse) => void;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: () => void): void;
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface Props {
  /** Razorpay publishable key (rzp_live_... or rzp_test_...) */
  keyId: string;
  /** Razorpay order ID returned by the server (order_...) */
  razorpayOrderId: string;
  /** Amount in paise (integer) */
  amountPaise: number;
  restaurantName: string;
  customerName: string;
  /** Canonical phone "91XXXXXXXXXX" */
  customerPhone: string;
  onSuccess: (response: RazorpayResponse) => void;
  onDismiss: () => void;
}

let scriptLoaded = false;
let scriptLoading = false;
const waiters: Array<() => void> = [];

function loadRazorpayScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    if (scriptLoading) return;
    scriptLoading = true;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      waiters.forEach((fn) => fn());
      waiters.length = 0;
    };
    document.head.appendChild(s);
  });
}

export function RazorpayCheckout({
  keyId,
  razorpayOrderId,
  amountPaise,
  restaurantName,
  customerName,
  customerPhone,
  onSuccess,
  onDismiss,
}: Props) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    void loadRazorpayScript().then(() => {
      const options: RazorpayOptions = {
        key: keyId,
        amount: amountPaise,
        currency: "INR",
        name: restaurantName,
        description: "Table Order Payment",
        order_id: razorpayOrderId,
        prefill: {
          name: customerName,
          contact: customerPhone,
        },
        theme: { color: "#ea580c" },
        modal: {
          ondismiss: onDismiss,
          escape: true,
          animation: true,
        },
        handler: onSuccess,
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // This component is purely imperative — it renders nothing visible itself.
  return null;
}
