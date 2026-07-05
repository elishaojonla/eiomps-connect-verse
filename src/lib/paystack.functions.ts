import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Verifies a Paystack transaction by reference and, if successful,
// upgrades the caller's profile to Pro for 30 days.
export const verifyPaystackAndUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const d = input as { reference?: unknown };
    if (typeof d?.reference !== "string" || d.reference.length < 4) {
      throw new Error("reference required");
    }
    return { reference: d.reference };
  })
  .handler(async ({ data, context }) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("PAYSTACK_SECRET_KEY not configured");

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!res.ok) throw new Error(`Paystack verify failed: ${res.status}`);
    const json = (await res.json()) as {
      status: boolean;
      data?: { status?: string; amount?: number; customer?: { email?: string } };
    };
    if (!json.status || json.data?.status !== "success") {
      return { ok: false as const, reason: "not_successful" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const ends = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await supabaseAdmin.from("pro_subscriptions").upsert(
      {
        user_id: context.userId,
        reference: data.reference,
        amount_cents: json.data?.amount ?? 0,
        status: "success",
        starts_at: now.toISOString(),
        ends_at: ends.toISOString(),
      },
      { onConflict: "reference" },
    );

    await supabaseAdmin
      .from("profiles")
      .update({
        is_pro: true,
        is_verified: true,
        pro_until: ends.toISOString(),
      })
      .eq("id", context.userId);

    return { ok: true as const, ends_at: ends.toISOString() };
  });
