import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyPaystackAndUpgrade } from "@/lib/paystack.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, Loader2 } from "lucide-react";

const PAYSTACK_PUBLIC_KEY = "pk_test_c229a24ac406f19c2ee98f864a934d04fa7fc8ca";
const AMOUNT_KOBO = 750000; // ₦7,500 → Paystack uses kobo (₦1 = 100 kobo)
const CURRENCY = "NGN";

type PaystackPop = {
  setup: (opts: {
    key: string;
    email: string;
    amount: number;
    currency: string;
    ref: string;
    callback: (r: { reference: string }) => void;
    onClose: () => void;
  }) => { openIframe: () => void };
};
declare global {
  interface Window {
    PaystackPop?: PaystackPop;
  }
}

function loadPaystack(): Promise<PaystackPop> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) return resolve(window.PaystackPop);
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => window.PaystackPop ? resolve(window.PaystackPop) : reject(new Error("Paystack failed to load"));
    s.onerror = () => reject(new Error("Paystack script blocked"));
    document.head.appendChild(s);
  });
}

export function UpgradeToProButton({
  className = "",
  label = "Upgrade to Pro — $5/mo",
  onSuccess,
}: { className?: string; label?: string; onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const verify = useServerFn(verifyPaystackAndUpgrade);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleClick() {
    if (!email) { toast.error("Please sign in first"); return; }
    setLoading(true);
    try {
      const Paystack = await loadPaystack();
      const ref = `eiomps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await new Promise<void>((resolve) => {
        const handler = Paystack.setup({
          key: PAYSTACK_PUBLIC_KEY,
          email,
          amount: AMOUNT_CENTS,
          currency: "USD",
          ref,
          callback: async (r) => {
            try {
              const result = await verify({ data: { reference: r.reference } });
              if (result.ok) {
                toast.success("Welcome to Pro! ✨");
                onSuccess?.();
              } else {
                toast.error("Payment could not be verified");
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Verification failed");
            } finally {
              resolve();
            }
          },
          onClose: () => resolve(),
        });
        handler.openIframe();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || !email}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
      {label}
    </button>
  );
}
