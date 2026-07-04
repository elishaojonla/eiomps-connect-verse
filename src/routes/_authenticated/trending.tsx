import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Heart, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/trending")({
  component: TrendingPage,
});

type TrendingPost = {
  id: string;
  content: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  author: { username: string; full_name: string | null; avatar_url: string | null } | null;
};

function TrendingPage() {
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("posts")
        .select("id,content,created_at,likes_count,comments_count,author:profiles!posts_author_id_fkey(username,full_name,avatar_url)")
        .gte("created_at", since)
        .order("likes_count", { ascending: false })
        .limit(30);
      setPosts((data as unknown as TrendingPost[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Flame className="h-5 w-5" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Trending</h1>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Popular posts from the last 7 days.</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing trending yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 overflow-hidden rounded-full border border-border bg-secondary">
                  {p.author?.avatar_url && <img src={p.author.avatar_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="text-sm">
                  <span className="font-medium">{p.author?.full_name ?? p.author?.username ?? "Unknown"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">@{p.author?.username}</span>
                </div>
              </div>
              {p.content && <p className="mt-2 whitespace-pre-wrap text-sm">{p.content}</p>}
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {p.likes_count}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {p.comments_count}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
