"use client";
import { useState } from "react";
import { toast } from "sonner";

declare global { interface Window { Razorpay: any; } }

export default function PayButton({
  amount, purpose, refId, label = "Pay now",
}: { amount: number; purpose: "enrollment" | "booking" | "tournament" | "invoice" | "other"; refId?: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  async function pay() {
    setLoading(true);
    try {
      const order = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, purpose, refId }),
      }).then((r) => r.json());
      if (!order.orderId) throw new Error(order.error || "Failed");

      // Load Razorpay checkout script on demand
      await new Promise<void>((resolve, reject) => {
        if (window.Razorpay) return resolve();
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(s);
      });

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Envision Chess Academy",
        theme: { color: "#5a1372" },
        handler: async (resp: any) => {
          const v = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resp),
          }).then((r) => r.json());
          if (v.ok) toast.success(`Payment success • ${v.invoiceNumber}`);
          else toast.error("Verification failed");
        },
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={pay} disabled={loading} className="btn-accent">
      {loading ? "Loading..." : label}
    </button>
  );
}
