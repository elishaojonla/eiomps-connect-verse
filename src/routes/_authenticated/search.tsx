import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
});

type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null };
type Post = { id: string; content: string | null; created_at: string; author_id: string };

function SearchPage() {
  const [q, setQ] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setProfiles([]); setPosts([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const term = `%${q.trim()}%`;
      const [{ data: p }, { data: po }] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,avatar_url")
          .or(`username.ilike.${term},full_name.ilike.${term}`).limit(10),
        supabase.from("posts").select("id,content,created_at,author_id")
          .ilike("content", term).order("created_at", { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      setProfiles(p ?? []); setPosts(po ?? []); setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">Search</h1>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people and posts"
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none focus:border-foreground/40"
        />
      </div>

      {loading && <p className="mt-6 text-sm text-muted-foreground">Searching…</p>}

      {profiles.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">People</h2>
          <ul className="space-y-1">
            {profiles.map((p) => (
              <li key={p.id}>
                <Link to="/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary">
                  <div className="h-10 w-10 overflow-hidden rounded-full border border-border bg-secondary">
                    {p.avatar_url && <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.full_name ?? p.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {posts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Posts</h2>
          <ul className="space-y-2">
            {posts.map((po) => (
              <li key={po.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="whitespace-pre-wrap">{po.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(po.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && q && profiles.length === 0 && posts.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">No results.</p>
      )}
    </div>
  );
}
