import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Crown, MessageCircle, Shield, UserPlus, UserCheck, BadgeCheck } from "lucide-react";
import { Avatar } from "./_authenticated/feed";

export const Route = createFileRoute("/u/$username")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Eiomps` },
      { name: "description", content: `${params.username}'s profile on Eiomps` },
    ],
  }),
  component: PublicProfile,
});

function PublicProfile() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-by-username", username],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,full_name,bio,avatar_url,banner_url,profession,profession_other,is_pro,is_verified,is_official,is_banned,founding_member_number,reputation_score,wallet_address,x_handle,telegram_handle,discord_handle,instagram_handle")
        .eq("username", username)
        .maybeSingle();
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["profile-counts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [{ count: followers }, { count: following }, { count: posts }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile!.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile!.id),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", profile!.id),
      ]);
      return { followers: followers ?? 0, following: following ?? 0, posts: posts ?? 0 };
    },
  });

  const { data: isFollowing, refetch: refetchFollow } = useQuery({
    queryKey: ["is-following", me, profile?.id],
    enabled: !!me && !!profile?.id && me !== profile.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", me!)
        .eq("following_id", profile!.id)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["profile-posts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id,content,created_at,likes_count,comments_count")
        .eq("author_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  async function toggleFollow() {
    if (!me) { navigate({ to: "/auth" }); return; }
    if (!profile) return;
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", profile.id);
    } else {
      await supabase.from("follows").insert({ follower_id: me, following_id: profile.id });
    }
    refetchFollow();
  }

  async function startChat() {
    if (!me) { navigate({ to: "/auth" }); return; }
    if (!profile) return;
    const [a, b] = [me, profile.id].sort();
    const { data: existing } = await supabase
      .from("conversations").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
    let convoId = existing?.id;
    if (!convoId) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_a: a, user_b: b }).select("id").single();
      if (error) { toast.error(error.message); return; }
      convoId = data.id;
    }
    navigate({ to: "/messages/$conversationId", params: { conversationId: convoId } });
  }

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (!profile) return <div className="p-10 text-center">User not found</div>;
  if (profile.is_banned) return <div className="p-10 text-center text-muted-foreground">This account has been suspended.</div>;

  const isMe = me === profile.id;

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-background pb-20">
      {/* Banner */}
      <div className="relative h-40 bg-gradient-to-br from-muted to-secondary">
        {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
        <button
          onClick={() => history.length > 1 ? history.back() : navigate({ to: "/feed" })}
          className="absolute left-3 top-3 rounded-full bg-background/80 p-2 backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4">
        <div className="-mt-10 flex items-end justify-between">
          <div className="h-20 w-20 rounded-full border-4 border-background overflow-hidden bg-secondary">
            <Avatar url={profile.avatar_url} name={profile.username} />
          </div>
          <div className="flex gap-2 pb-2">
            {!isMe && (
              <>
                <button onClick={startChat} className="flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-secondary">
                  <MessageCircle className="h-4 w-4" /> Message
                </button>
                <button
                  onClick={toggleFollow}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${
                    isFollowing ? "border border-border" : "bg-foreground text-background"
                  }`}
                >
                  {isFollowing ? <><UserCheck className="h-4 w-4" /> Following</> : <><UserPlus className="h-4 w-4" /> Follow</>}
                </button>
              </>
            )}
            {isMe && (
              <Link to="/profile" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-secondary">
                Edit profile
              </Link>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-bold">{profile.full_name || profile.username}</h1>
            {profile.is_official && <Crown className="h-4 w-4 fill-yellow-400 text-yellow-500" />}
            {!profile.is_official && profile.is_verified && <BadgeCheck className="h-4 w-4 fill-blue-500 text-white" />}
            {profile.wallet_address && <Shield className="h-4 w-4 text-emerald-500" />}
          </div>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
          {profile.profession && <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{profile.profession_other || profile.profession}</p>}
          {profile.bio && <p className="mt-3 text-sm">{profile.bio}</p>}

          <div className="mt-3 flex gap-4 text-sm">
            <span><b>{counts?.posts ?? 0}</b> <span className="text-muted-foreground">Posts</span></span>
            <span><b>{counts?.followers ?? 0}</b> <span className="text-muted-foreground">Followers</span></span>
            <span><b>{counts?.following ?? 0}</b> <span className="text-muted-foreground">Following</span></span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {typeof profile.reputation_score === "number" && (
              <span className="rounded-full bg-secondary px-2 py-0.5">Rep {profile.reputation_score}</span>
            )}
            {profile.founding_member_number && (
              <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-yellow-600">
                Founding #{profile.founding_member_number}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {profile.x_handle && <a href={`https://x.com/${profile.x_handle}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">𝕏 @{profile.x_handle}</a>}
            {profile.telegram_handle && <a href={`https://t.me/${profile.telegram_handle}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">TG @{profile.telegram_handle}</a>}
            {profile.instagram_handle && <a href={`https://instagram.com/${profile.instagram_handle}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">IG @{profile.instagram_handle}</a>}
            {profile.discord_handle && <span className="text-muted-foreground">DC {profile.discord_handle}</span>}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {posts?.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="whitespace-pre-wrap text-sm">{p.content}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                {p.likes_count} likes · {p.comments_count} comments
              </div>
            </div>
          ))}
          {posts && posts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No posts yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
