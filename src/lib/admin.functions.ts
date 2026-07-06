import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin only");
}

// Ensure the official @eiomps account exists (idempotent). Admin-only.
export const ensureOfficialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Already configured?
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("official_user_id")
      .eq("id", true)
      .maybeSingle();
    if (settings?.official_user_id) {
      return { ok: true as const, official_user_id: settings.official_user_id, created: false };
    }

    // Check for an existing profile with the reserved username
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", "eiomps")
      .maybeSingle();

    let officialId = existing?.id;

    if (!officialId) {
      // Create an auth user for the official account (email confirmed)
      const email = `official+${Date.now()}@eiomps.app`;
      const password = crypto.randomUUID() + crypto.randomUUID();
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: "eiomps", full_name: "Eiomps" },
      });
      if (cErr || !created.user) throw new Error(cErr?.message ?? "Failed to create official user");
      officialId = created.user.id;

      // handle_new_user trigger already created the profile row; update it
      await supabaseAdmin.from("profiles").update({
        username: "eiomps",
        full_name: "Eiomps",
        bio: "The official Web3 social platform. Web3 news, tips and updates daily 🖤",
        is_official: true,
        is_verified: true,
        is_pro: true,
        linkshine_url: "eiomps.app/dm/eiomps",
      }).eq("id", officialId);
    } else {
      await supabaseAdmin.from("profiles").update({
        is_official: true,
        is_verified: true,
        is_pro: true,
      }).eq("id", officialId);
    }

    await supabaseAdmin.from("app_settings")
      .update({ official_user_id: officialId, updated_at: new Date().toISOString() })
      .eq("id", true);

    // Backfill follow for all existing users
    const { data: allUsers } = await supabaseAdmin.from("profiles").select("id").neq("id", officialId);
    if (allUsers && allUsers.length) {
      const rows = allUsers.map((u) => ({ follower_id: u.id, following_id: officialId }));
      await supabaseAdmin.from("follows").upsert(rows, { onConflict: "follower_id,following_id" });
    }

    return { ok: true as const, official_user_id: officialId, created: !existing };
  });

// Post as the official account. Admin-only.
export const postAsOfficial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => {
    const d = i as { content?: unknown; pinned?: unknown };
    if (typeof d.content !== "string" || !d.content.trim()) throw new Error("content required");
    return { content: d.content.trim().slice(0, 2000), pinned: !!d.pinned };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("app_settings").select("official_user_id").eq("id", true).maybeSingle();
    if (!settings?.official_user_id) throw new Error("Official account not set up");
    const { data: post, error } = await supabaseAdmin.from("posts").insert({
      author_id: settings.official_user_id,
      content: data.content,
      is_official: true,
      is_pinned: data.pinned,
    }).select("id").single();
    if (error) throw error;
    return { ok: true as const, id: post.id };
  });

// Ban/unban a user. Admin-only.
export const setUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => {
    const d = i as { userId?: unknown; banned?: unknown; reason?: unknown };
    if (typeof d.userId !== "string") throw new Error("userId required");
    return { userId: d.userId, banned: !!d.banned, reason: typeof d.reason === "string" ? d.reason : null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prevent banning the official account
    const { data: p } = await supabaseAdmin.from("profiles").select("is_official").eq("id", data.userId).maybeSingle();
    if (p?.is_official) throw new Error("Cannot ban official account");
    await supabaseAdmin.from("profiles").update({
      is_banned: data.banned,
      ban_reason: data.reason,
    }).eq("id", data.userId);
    return { ok: true as const };
  });

// Pin/unpin a post. Admin-only.
export const setPostPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => {
    const d = i as { postId?: unknown; pinned?: unknown };
    if (typeof d.postId !== "string") throw new Error("postId required");
    return { postId: d.postId, pinned: !!d.pinned };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("posts").update({ is_pinned: data.pinned }).eq("id", data.postId);
    return { ok: true as const };
  });
