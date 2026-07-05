import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet, Link as LinkIcon, Edit3, Check, X, Copy, Camera, ImageIcon, Loader2,
  Twitter, Instagram, Send as SendIcon, MessageSquare, Flag,
} from "lucide-react";
import { Avatar } from "./feed";
import { formatDistanceToNow } from "date-fns";
import { uploadMedia, signed } from "@/lib/media-upload";
import { connectInjectedWallet, hasInjectedWallet } from "@/lib/wallet";
import { UpgradeToProButton } from "@/components/paystack-button";
import { FoundingBadge, VerifiedBadge } from "@/components/pro-badge";
import { ReportModal } from "@/components/report-modal";

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
  banner_url: string | null;
  wallet_address: string | null;
  profession: string;
  profession_other: string | null;
  linkshine_url: string | null;
  linkshine_public: boolean;
  x_handle: string | null;
  instagram_handle: string | null;
  telegram_handle: string | null;
  discord_handle: string | null;
  founding_member_number: number | null;
  is_pro: boolean;
  is_verified: boolean;
  pro_until: string | null;
};

function ProfilePage() {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [tab, setTab] = useState<"posts" | "bookmarks">("posts");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", me!).single();
      if (error) throw error;
      return data as unknown as Profile;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["profile-counts", me],
    enabled: !!me,
    queryFn: async () => {
      const [posts, followers, following] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", me!),
        supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", me!),
        supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", me!),
      ]);
      return {
        posts: posts.count ?? 0,
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      };
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["my-posts", me, tab],
    enabled: !!me && tab === "posts",
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id,content,created_at,likes_count,comments_count")
        .eq("author_id", me!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: bookmarks } = useQuery({
    queryKey: ["my-bookmarks", me, tab],
    enabled: !!me && tab === "bookmarks",
    queryFn: async () => {
      const { data } = await supabase
        .from("bookmarks")
        .select("post:posts(id,content,created_at,likes_count,comments_count,author:profiles!posts_author_id_fkey(username,full_name))")
        .order("created_at", { ascending: false });
      return (data ?? []).map((r) => r.post).filter(Boolean);
    },
  });

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  async function save() {
    if (!me) return;
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name,
      bio: form.bio,
      profession: form.profession as never,
      profession_other: form.profession_other,
      linkshine_url: form.linkshine_url,
      linkshine_public: form.linkshine_public,
      x_handle: form.x_handle,
      instagram_handle: form.instagram_handle,
      telegram_handle: form.telegram_handle,
      discord_handle: form.discord_handle,
    }).eq("id", me);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: ["profile", me] });
  }

  async function connectWallet() {
    if (!me) return;
    try {
      const addr = await connectInjectedWallet();
      await supabase.from("profiles").update({ wallet_address: addr }).eq("id", me);
      queryClient.invalidateQueries({ queryKey: ["profile", me] });
      toast.success("Wallet linked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wallet connect failed");
    }
  }

  async function uploadProfileImage(kind: "avatar" | "banner", file: File | undefined) {
    if (!file || !me) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    try {
      const { path } = await uploadMedia(me, kind === "avatar" ? "avatars" : "banners", file, file.name.split(".").pop() || "jpg");
      const url = await signed(path, 60 * 60 * 24 * 365);
      const patch = kind === "avatar" ? { avatar_url: url } : { banner_url: url };
      await supabase.from("profiles").update(patch).eq("id", me);
      queryClient.invalidateQueries({ queryKey: ["profile", me] });
      toast.success(`${kind === "avatar" ? "Photo" : "Banner"} updated`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
  }

  function copyLinkshine() {
    if (!profile?.linkshine_url) return;
    const full = profile.linkshine_url.startsWith("http") ? profile.linkshine_url : `https://${profile.linkshine_url}`;
    navigator.clipboard.writeText(full);
    toast.success("Linkshine copied");
  }

  if (!profile) {
    return <div className="mx-auto max-w-2xl px-4 py-6"><div className="h-48 animate-pulse rounded-2xl bg-card" /></div>;
  }

  const professionLabel = PROFESSIONS.find((p) => p.value === profile.profession)?.label ?? "Other";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative h-44 overflow-hidden md:rounded-b-2xl">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,oklch(0.25_0_0),oklch(0.04_0_0))]" />
        )}
        <BannerUpload onPick={(f) => uploadProfileImage("banner", f)} />
      </div>

      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between">
          <div className="relative">
            <div className="rounded-full border-4 border-background">
              <Avatar url={profile.avatar_url} name={profile.username} size="lg" />
            </div>
            <AvatarUpload onPick={(f) => uploadProfileImage("avatar", f)} />
          </div>
          {!editing ? (
            <div className="flex gap-1">
              <button
                onClick={() => setEditing(true)}
                className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                <span className="inline-flex items-center gap-1.5"><Edit3 className="h-3 w-3" /> Edit profile</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button onClick={save} className="flex items-center gap-1 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background">
                <Check className="h-3 w-3" /> Save
              </button>
              <button onClick={() => { setEditing(false); setForm(profile); }} className="rounded-full border border-border bg-card p-2">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {editing ? (
            <input
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Display name"
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-base font-semibold outline-none focus:border-foreground"
            />
          ) : (
            <h1 className="flex items-center gap-1.5 font-display text-2xl font-bold tracking-tight">
              {profile.full_name || profile.username}
              {profile.is_verified && <VerifiedBadge className="h-5 w-5" />}
            </h1>
          )}
          <p className="text-sm text-muted-foreground">@{profile.username}</p>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            {profile.founding_member_number && (
              <FoundingBadge number={profile.founding_member_number} />
            )}
            {profile.is_pro && !profile.founding_member_number && (
              <span className="rounded-full border border-foreground bg-foreground px-3 py-1 text-xs font-bold uppercase tracking-wider text-background">Pro</span>
            )}
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {profile.profession === "other" ? (profile.profession_other || "Member") : professionLabel}
            </span>
          </div>

          {editing && (
            <div className="space-y-2">
              <select
                value={form.profession ?? "other"}
                onChange={(e) => setForm({ ...form, profession: e.target.value })}
                className="rounded-full border border-border bg-input px-3 py-1.5 text-xs outline-none"
              >
                {PROFESSIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {form.profession === "other" && (
                <input
                  value={form.profession_other ?? ""}
                  onChange={(e) => setForm({ ...form, profession_other: e.target.value })}
                  placeholder="Your profession"
                  className="w-full rounded-lg border border-border bg-input px-3 py-1.5 text-xs outline-none"
                />
              )}
            </div>
          )}

          {editing ? (
            <textarea
              value={form.bio ?? ""}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Bio" rows={3} maxLength={280}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          ) : (
            profile.bio && <p className="text-[15px] leading-relaxed text-foreground/90">{profile.bio}</p>
          )}

          <div className="flex gap-6 pt-1 text-sm">
            <Stat label="Posts" value={counts?.posts ?? 0} />
            <Stat label="Followers" value={counts?.followers ?? 0} />
            <Stat label="Following" value={counts?.following ?? 0} />
          </div>

          {/* Upgrade CTA for non-pro users */}
          {!profile.is_pro && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-foreground/20 bg-foreground/5 p-3">
              <div>
                <div className="text-sm font-semibold">Unlock Pro</div>
                <div className="text-xs text-muted-foreground">Verified checkmark, calls, themes · $5/mo</div>
              </div>
              <UpgradeToProButton onSuccess={() => queryClient.invalidateQueries({ queryKey: ["profile", me] })} label="Upgrade" />
            </div>
          )}

          {/* Wallet */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              {profile.wallet_address ? (
                <code className="truncate font-mono text-xs text-foreground/90">{profile.wallet_address}</code>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {hasInjectedWallet() ? "No wallet connected" : "Install MetaMask to connect"}
                </span>
              )}
            </div>
            {profile.wallet_address ? (
              <button
                onClick={() => { navigator.clipboard.writeText(profile.wallet_address!); toast.success("Copied"); }}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button onClick={connectWallet} className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                Connect
              </button>
            )}
          </div>

          {/* Linkshine */}
          {editing ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
              <input
                value={form.linkshine_url ?? ""}
                onChange={(e) => setForm({ ...form, linkshine_url: e.target.value })}
                placeholder="Your Linkshine URL"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={form.linkshine_public ?? true} onChange={(e) => setForm({ ...form, linkshine_public: e.target.checked })} /> public
              </label>
            </div>
          ) : profile.linkshine_url && (
            <button
              onClick={copyLinkshine}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-foreground/90 hover:bg-secondary/70"
              title={profile.linkshine_public ? "Public DM link" : "Private DM link (only you)"}
            >
              <LinkIcon className="h-3 w-3" /> {profile.linkshine_url}
              {!profile.linkshine_public && <span className="ml-1 text-muted-foreground">(private)</span>}
            </button>
          )}

          {/* Social links */}
          {editing ? (
            <div className="grid grid-cols-2 gap-2">
              <SocialInput icon={Twitter} placeholder="X / Twitter" value={form.x_handle ?? ""} onChange={(v) => setForm({ ...form, x_handle: v })} />
              <SocialInput icon={Instagram} placeholder="Instagram" value={form.instagram_handle ?? ""} onChange={(v) => setForm({ ...form, instagram_handle: v })} />
              <SocialInput icon={SendIcon} placeholder="Telegram" value={form.telegram_handle ?? ""} onChange={(v) => setForm({ ...form, telegram_handle: v })} />
              <SocialInput icon={MessageSquare} placeholder="Discord" value={form.discord_handle ?? ""} onChange={(v) => setForm({ ...form, discord_handle: v })} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {profile.x_handle && <SocialChip icon={Twitter} href={`https://x.com/${profile.x_handle.replace(/^@/, "")}`} label={`@${profile.x_handle.replace(/^@/, "")}`} />}
              {profile.instagram_handle && <SocialChip icon={Instagram} href={`https://instagram.com/${profile.instagram_handle.replace(/^@/, "")}`} label={`@${profile.instagram_handle.replace(/^@/, "")}`} />}
              {profile.telegram_handle && <SocialChip icon={SendIcon} href={`https://t.me/${profile.telegram_handle.replace(/^@/, "")}`} label={`@${profile.telegram_handle.replace(/^@/, "")}`} />}
              {profile.discord_handle && <SocialChip icon={MessageSquare} href="#" label={profile.discord_handle} />}
            </div>
          )}
        </div>

        <div className="mt-6 flex border-b border-border">
          {(["posts", "bookmarks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-3 text-sm font-semibold capitalize transition ${
                tab === t ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-3 py-4 pb-10">
          {(tab === "posts" ? posts : bookmarks)?.map((p) => {
            const post = p as { id: string; content: string | null; created_at: string; likes_count: number; comments_count: number; author?: { username: string; full_name: string | null } };
            return (
              <div key={post.id} className="rounded-2xl border border-border bg-card p-4">
                {post.author && (
                  <div className="mb-1 text-xs text-muted-foreground">
                    @{post.author.username}{post.author.full_name ? ` · ${post.author.full_name}` : ""}
                  </div>
                )}
                {post.content && <p className="whitespace-pre-wrap text-sm">{post.content}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                  <span>· {post.likes_count} likes</span>
                  <span>· {post.comments_count ?? 0} comments</span>
                </div>
              </div>
            );
          })}
          {tab === "posts" && posts && posts.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No posts yet.</p>
          )}
          {tab === "bookmarks" && bookmarks && bookmarks.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No bookmarks yet.</p>
          )}
        </div>

        <div className="pb-24">
          <button
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Flag className="h-3 w-3" /> Report a problem with this profile
          </button>
        </div>
      </div>

      {reportOpen && me && (
        <ReportModal targetType="profile" targetId={me} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-base font-bold text-foreground">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function SocialInput({ icon: Icon, placeholder, value, onChange }: { icon: React.ComponentType<{ className?: string }>; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-xs outline-none"
      />
    </div>
  );
}

function SocialChip({ icon: Icon, href, label }: { icon: React.ComponentType<{ className?: string }>; href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70"
    >
      <Icon className="h-3 w-3" /> {label}
    </a>
  );
}

function BannerUpload({ onPick }: { onPick: (f: File | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        setLoading(true); await onPick(e.target.files?.[0]); setLoading(false);
        if (ref.current) ref.current.value = "";
      }} />
      <button
        onClick={() => ref.current?.click()}
        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/80"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
        Banner
      </button>
    </>
  );
}

function AvatarUpload({ onPick }: { onPick: (f: File | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        setLoading(true); await onPick(e.target.files?.[0]); setLoading(false);
        if (ref.current) ref.current.value = "";
      }} />
      <button
        onClick={() => ref.current?.click()}
        className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-background hover:opacity-90"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
      </button>
    </>
  );
}
