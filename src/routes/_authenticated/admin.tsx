import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Send, Ban, CheckCircle, Pin, Gift, Loader2 } from "lucide-react";
import { ensureOfficialAccount, postAsOfficial, setUserBan, setPostPinned } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const ensure = useServerFn(ensureOfficialAccount);
  const post = useServerFn(postAsOfficial);
  const ban = useServerFn(setUserBan);
  const pin = useServerFn(setPostPinned);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setIsAdmin(false); return; }
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      setIsAdmin(!!data);
    })();
  }, []);

  const { data: officialId, refetch: refetchOfficial } = useQuery({
    queryKey: ["official-id"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("official_user_id").eq("id", true).maybeSingle();
      return data?.official_user_id as string | null;
    },
  });

  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,full_name,is_banned,is_official,is_verified,is_pro,created_at,reputation_score")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: recentPosts, refetch: refetchPosts } = useQuery({
    queryKey: ["admin-posts"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id,content,is_pinned,is_official,author:profiles!posts_author_id_fkey(username)")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  async function handleEnsure() {
    setBusy(true);
    try { await ensure({}); toast.success("Official account ready"); refetchOfficial(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function handlePost() {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await post({ data: { content, pinned } });
      toast.success("Posted as @eiomps");
      setContent(""); setPinned(false); refetchPosts();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  if (isAdmin === null) return <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  if (!isAdmin) return <div className="p-10 text-center text-muted-foreground">Admins only.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-6 w-6" />
        <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
      </div>

      {/* Official account setup */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 font-display text-lg font-semibold">Official @eiomps account</h2>
        {officialId ? (
          <p className="text-xs text-muted-foreground">Configured. All new signups auto-follow this account.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Not created yet. This sets up the official verified account and auto-follows every existing user.</p>
            <button onClick={handleEnsure} disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Set up official account"}
            </button>
          </>
        )}
      </section>

      {/* Post as official */}
      {officialId && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-display text-lg font-semibold">Post as @eiomps</h2>
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)}
            rows={4} maxLength={2000}
            placeholder="What's happening in Web3?"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
          />
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <Pin className="h-3 w-3" /> Pin to top of feed
            </label>
            <button onClick={handlePost} disabled={busy || !content.trim()} className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              <Send className="h-4 w-4" /> Post
            </button>
          </div>
        </section>
      )}

      {/* Recent posts management */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">Recent posts</h2>
        <div className="space-y-2">
          {recentPosts?.map((p: any) => (
            <div key={p.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">@{p.author?.username} {p.is_pinned && "· 📌"} {p.is_official && "· 👑"}</div>
                <p className="mt-1 line-clamp-2 text-sm">{p.content}</p>
              </div>
              <button
                onClick={async () => { await pin({ data: { postId: p.id, pinned: !p.is_pinned } }); refetchPosts(); }}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs"
              >
                {p.is_pinned ? "Unpin" : "Pin"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Users */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">Users</h2>
        <div className="space-y-1">
          {users?.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  @{u.username}
                  {u.is_official && <span className="text-yellow-500">👑</span>}
                  {u.is_verified && <CheckCircle className="h-3 w-3 text-blue-500" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  Rep {u.reputation_score ?? 0} {u.is_banned && " · 🚫 BANNED"}
                </div>
              </div>
              {!u.is_official && (
                <button
                  onClick={async () => {
                    await ban({ data: { userId: u.id, banned: !u.is_banned, reason: u.is_banned ? null : "Policy violation" } });
                    toast.success(u.is_banned ? "Unbanned" : "Banned");
                    refetchUsers();
                  }}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                    u.is_banned ? "border border-border" : "bg-red-500 text-white"
                  }`}
                >
                  <Ban className="h-3 w-3" /> {u.is_banned ? "Unban" : "Ban"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
