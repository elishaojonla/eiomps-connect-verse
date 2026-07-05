import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./feed";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesIndex,
});

type ConvoRow = {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  other: { id: string; username: string; full_name: string | null; avatar_url: string | null } | null;
  last: { content: string | null; created_at: string; media_type?: string | null } | null;
};

function MessagesIndex() {
  const [me, setMe] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: conversations, refetch } = useQuery({
    queryKey: ["conversations", me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id,user_a,user_b,last_message_at")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const enriched: ConvoRow[] = await Promise.all(
        (data ?? []).map(async (c) => {
          const otherId = c.user_a === me ? c.user_b : c.user_a;
          const { data: other } = await supabase
            .from("profiles")
            .select("id,username,full_name,avatar_url")
            .eq("id", otherId)
            .maybeSingle();
          const { data: last } = await supabase
            .from("messages")
            .select("content,created_at,media_type")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return { ...c, other, last } as ConvoRow;
        }),
      );
      return enriched;
    },
  });

  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel("convo-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, refetch]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Messages</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          New chat
        </button>
      </div>

      {conversations && conversations.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {conversations.map((c) => (
            <Link
              key={c.id}
              to="/messages/$conversationId"
              params={{ conversationId: c.id }}
              className="flex items-center gap-3 p-4 transition hover:bg-secondary/50"
            >
              <Avatar url={c.other?.avatar_url ?? null} name={c.other?.username ?? "?"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{c.other?.full_name || c.other?.username}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {c.last?.content ?? "No messages yet"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No conversations yet.</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow"
          >
            Start a chat
          </button>
        </div>
      )}

      {showNew && me && <NewChatModal me={me} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewChatModal({ me, onClose }: { me: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; username: string; full_name: string | null; avatar_url: string | null }>>([]);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .ilike("username", `%${q}%`)
        .neq("id", me)
        .limit(10);
      setResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, me]);

  async function startChat(otherId: string) {
    const [a, b] = [me, otherId].sort();
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    let convoId = existing?.id;
    if (!convoId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_a: a, user_b: b })
        .select("id")
        .single();
      if (error) { toast.error(error.message); return; }
      convoId = data.id;
    }
    window.location.href = `/messages/${convoId}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elegant">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">New chat</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username"
            className="w-full rounded-lg border border-border bg-input py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => startChat(u.id)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-secondary"
            >
              <Avatar url={u.avatar_url} name={u.username} />
              <div>
                <div className="text-sm font-semibold">{u.full_name || u.username}</div>
                <div className="text-xs text-muted-foreground">@{u.username}</div>
              </div>
            </button>
          ))}
          {q.length >= 2 && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
          )}
        </div>
      </div>
    </div>
  );
}
