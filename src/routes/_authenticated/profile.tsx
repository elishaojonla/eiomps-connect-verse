import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, Link as LinkIcon, Edit3, Check, X, Copy, Instagram } from "lucide-react";
import { Avatar } from "./feed";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

const PROFESSIONS = [
  { value: "web3_designer", label: "Web3 Designer" },
  { value: "nft_artist", label: "NFT Artist" },
  { value: "dao_developer", label: "DAO Developer" },
  { value: "crypto_trader", label: "Crypto Trader" },
  { value: "community_manager", label: "Community Manager" },
  { value: "other", label: "Other" },
] as const;

type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  profession: string;
  profession_other: string | null;
  linkshine_url: string | null;
  linkshine_public: boolean;
  theme_color: string;
  x_handle: string | null;
  instagram_handle: string | null;
};

function mockConnectWallet(): string {
  const chars = "0123456789abcdef";
  let addr = "0x";
  const arr = new Uint8Array(40);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 40; i++) addr += chars[arr[i] % 16];
  return addr;
}

function ProfilePage() {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Profile>>({});

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", me!).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["my-posts", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id,content,created_at,likes_count")
        .eq("author_id", me!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  async function save() {
    if (!me) return;
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name,
      bio: form.bio,
      avatar_url: form.avatar_url,
      profession: form.profession as any,
      profession_other: form.profession_other,
      linkshine_url: form.linkshine_url,
      linkshine_public: form.linkshine_public,
      theme_color: form.theme_color,
      x_handle: form.x_handle,
      instagram_handle: form.instagram_handle,
    }).eq("id", me);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: ["profile", me] });
  }

  async function connectWallet() {
    if (!me) return;
    const addr = mockConnectWallet();
    await supabase.from("profiles").update({ wallet_address: addr }).eq("id", me);
    queryClient.invalidateQueries({ queryKey: ["profile", me] });
    toast.success("Wallet linked");
  }

  if (!profile) {
    return <div className="mx-auto max-w-2xl px-4 py-6"><div className="h-48 animate-pulse rounded-2xl bg-card" /></div>;
  }

  const professionLabel = PROFESSIONS.find((p) => p.value === profile.profession)?.label ?? "Other";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Banner */}
      <div
        className="relative h-32 overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${profile.theme_color}, oklch(0.65 0.22 255))` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,white_0,transparent_60%)] opacity-20" />
      </div>

      {/* Profile card */}
      <div className="-mt-12 rounded-2xl border border-border bg-card p-5 shadow-elegant">
        <div className="flex items-start justify-between">
          <div className="-mt-12 h-20 w-20 overflow-hidden rounded-2xl border-4 border-card bg-card">
            <Avatar url={profile.avatar_url} name={profile.username} />
          </div>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/70"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          ) : (
            <div className="flex gap-1">
              <button onClick={save} className="flex items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow">
                <Check className="h-3 w-3" /> Save
              </button>
              <button onClick={() => { setEditing(false); setForm(profile); }} className="rounded-lg border border-border bg-secondary px-2 py-1.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-3">
          {editing ? (
            <input
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Real name"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-base font-semibold outline-none focus:border-primary"
            />
          ) : (
            <h1 className="font-display text-xl font-bold">{profile.full_name || profile.username}</h1>
          )}
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>

        {editing ? (
          <textarea
            value={form.bio ?? ""}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Bio"
            rows={3}
            maxLength={280}
            className="mt-3 w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
        ) : (
          profile.bio && <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p>
        )}

        {/* Profession */}
        <div className="mt-3">
          {editing ? (
            <div className="space-y-2">
              <select
                value={form.profession ?? "other"}
                onChange={(e) => setForm({ ...form, profession: e.target.value })}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {PROFESSIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {form.profession === "other" && (
                <input
                  value={form.profession_other ?? ""}
                  onChange={(e) => setForm({ ...form, profession_other: e.target.value })}
                  placeholder="Your profession"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
            </div>
          ) : (
            <span className="inline-block rounded-full bg-soft-gradient px-3 py-1 text-xs font-semibold text-foreground">
              {profile.profession === "other" ? (profile.profession_other || "Other") : professionLabel}
            </span>
          )}
        </div>

        {/* Wallet */}
        <div className="mt-4 rounded-xl border border-blue/30 bg-blue/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-4 w-4 text-blue" />
              {profile.wallet_address ? (
                <code className="truncate font-mono text-xs">{profile.wallet_address}</code>
              ) : (
                <span className="text-xs text-muted-foreground">No wallet connected</span>
              )}
            </div>
            {profile.wallet_address ? (
              <button
                onClick={() => { navigator.clipboard.writeText(profile.wallet_address!); toast.success("Copied"); }}
                className="rounded p-1 hover:bg-blue/20"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button onClick={connectWallet} className="rounded-lg bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-white">
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Linkshine + socials */}
        <div className="mt-3 space-y-2">
          {editing ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <input
                  value={form.linkshine_url ?? ""}
                  onChange={(e) => setForm({ ...form, linkshine_url: e.target.value })}
                  placeholder="Linkshine URL"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.linkshine_public ?? true}
                    onChange={(e) => setForm({ ...form, linkshine_public: e.target.checked })}
                  /> public
                </label>
              </div>
              <input
                value={form.x_handle ?? ""}
                onChange={(e) => setForm({ ...form, x_handle: e.target.value })}
                placeholder="X handle (without @)"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                value={form.instagram_handle ?? ""}
                onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })}
                placeholder="Instagram handle (without @)"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Theme color</label>
                <input
                  type="color"
                  value={form.theme_color ?? "#8b5cf6"}
                  onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
                />
              </div>
              <input
                value={form.avatar_url ?? ""}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="Avatar URL"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.linkshine_url && profile.linkshine_public && (
                <a href={profile.linkshine_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs hover:bg-secondary/70">
                  <LinkIcon className="h-3 w-3" /> Linkshine
                </a>
              )}
              {profile.x_handle && (
                <a href={`https://x.com/${profile.x_handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs hover:bg-secondary/70">
                  𝕏 @{profile.x_handle}
                </a>
              )}
              {profile.instagram_handle && (
                <a href={`https://instagram.com/${profile.instagram_handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs hover:bg-secondary/70">
                  <Instagram className="h-3 w-3" /> @{profile.instagram_handle}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Posts</h2>
        {posts && posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="whitespace-pre-wrap text-sm">{p.content}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                  <span>· {p.likes_count} likes</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            No posts yet.
          </p>
        )}
      </div>
    </div>
  );
}
