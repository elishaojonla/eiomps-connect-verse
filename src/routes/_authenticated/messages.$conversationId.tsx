import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./feed";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  component: ChatPage,
});

type Message = { id: string; sender_id: string; content: string; created_at: string };

function ChatPage() {
  const { conversationId } = Route.useParams();
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<{ username: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [text, setText] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data: convo } = await supabase
        .from("conversations")
        .select("user_a,user_b")
        .eq("id", conversationId)
        .maybeSingle();
      if (!convo) return;
      const otherId = convo.user_a === me ? convo.user_b : convo.user_a;
      const { data: prof } = await supabase
        .from("profiles")
        .select("username,full_name,avatar_url")
        .eq("id", otherId)
        .maybeSingle();
      setOther(prof);

      const { data: msgs } = await supabase
        .from("messages")
        .select("id,sender_id,content,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages(msgs ?? []);
    })();
  }, [me, conversationId]);

  useEffect(() => {
    const ch = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !me) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: me, content });
    if (error) { toast.error(error.message); setText(content); }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-2xl flex-col md:h-[calc(100vh-3.5rem)]">
      <header className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
        <Link to="/messages" className="rounded-lg p-1.5 hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Link>
        <Avatar url={other?.avatar_url ?? null} name={other?.username ?? "?"} />
        <div>
          <div className="text-sm font-semibold">{other?.full_name || other?.username}</div>
          <div className="text-xs text-muted-foreground">@{other?.username}</div>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  mine ? "bg-brand-gradient text-white" : "bg-card border border-border text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet — say hi 👋</p>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border bg-background p-3 pb-20 md:pb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="flex-1 rounded-full border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
