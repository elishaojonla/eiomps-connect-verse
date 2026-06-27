import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Send, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

type Post = {
  id: string;
  content: string;
  created_at: string;
  likes_count: number;
  author: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    wallet_address: string | null;
  } | null;
};

function FeedPage() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id,content,created_at,likes_count,author:profiles!posts_author_id_fkey(id,username,full_name,avatar_url,wallet_address)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Post[];
    },
  });

  useEffect(() => {
    if (!me) return;
    supabase.from("likes").select("post_id").eq("user_id", me).then(({ data }) => {
      if (data) setLikedIds(new Set(data.map((r) => r.post_id)));
    });
  }, [me, posts]);

  const create = useMutation({
    mutationFn: async (text: string) => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase.from("posts").insert({ author_id: me, content: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Posted!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function toggleLike(post: Post) {
    if (!me) return;
    const liked = likedIds.has(post.id);
    const next = new Set(likedIds);
    if (liked) {
      next.delete(post.id);
      setLikedIds(next);
      await supabase.from("likes").delete().eq("user_id", me).eq("post_id", post.id);
    } else {
      next.add(post.id);
      setLikedIds(next);
      await supabase.from("likes").insert({ user_id: me, post_id: post.id });
    }
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-bold">Home</h1>
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (content.trim()) create.mutate(content.trim()); }}
        className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-elegant"
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's happening on-chain?"
          maxLength={500}
          rows={3}
          className="w-full resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/500</span>
          <button
            type="submit"
            disabled={!content.trim() || create.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Post
          </button>
        </div>
      </form>

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} liked={likedIds.has(p.id)} onLike={() => toggleLike(p)} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="text-muted-foreground">No posts yet. Be the first to share something.</p>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, liked, onLike }: { post: Post; liked: boolean; onLike: () => void }) {
  const author = post.author;
  return (
    <article className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/30">
      <div className="flex gap-3">
        <Avatar url={author?.avatar_url ?? null} name={author?.username ?? "?"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-foreground">{author?.full_name || author?.username}</span>
            <span className="text-sm text-muted-foreground">@{author?.username}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </span>
          </div>
          {author?.wallet_address && (
            <div className="mt-0.5 inline-flex rounded-full bg-blue/10 px-2 py-0.5 text-[10px] font-mono text-blue">
              {author.wallet_address.slice(0, 6)}…{author.wallet_address.slice(-4)}
            </div>
          )}
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
            {post.content}
          </p>
          <button
            onClick={onLike}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition ${
              liked ? "text-destructive" : "text-muted-foreground hover:text-destructive"
            }`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
            {post.likes_count}
          </button>
        </div>
      </div>
    </article>
  );
}

export function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt={name} className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}
