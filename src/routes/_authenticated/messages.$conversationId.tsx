import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, Mic, Square, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./feed";
import { uploadMedia, signed } from "@/lib/media-upload";
import { transcribeStorageAudio } from "@/lib/transcribe.functions";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  component: ChatPage,
});

type Message = {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  transcript: string | null;
};

function ChatPage() {
  const { conversationId } = Route.useParams();
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<{ username: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [text, setText] = useState("");
  const [signedMap, setSignedMap] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);
  const transcribe = useServerFn(transcribeStorageAudio);

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
        .select("id,sender_id,content,created_at,media_url,media_type,transcript")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);
    })();
  }, [me, conversationId]);

  // Sign media URLs
  useEffect(() => {
    (async () => {
      const toSign = messages.filter((m) => m.media_url && !signedMap[m.media_url]);
      if (toSign.length === 0) return;
      const entries = await Promise.all(
        toSign.map(async (m) => {
          try { return [m.media_url!, await signed(m.media_url!)] as const; }
          catch { return [m.media_url!, ""] as const; }
        }),
      );
      setSignedMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [messages, signedMap]);

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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || !me) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: me, content });
    if (error) { toast.error(error.message); setText(content); }
  }

  async function sendVoice(blob: Blob) {
    if (!me) return;
    const id = toast.loading("Uploading voice note…");
    try {
      const { path } = await uploadMedia(me, "voice", blob, "webm");
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: me,
        media_url: path,
        media_type: "audio",
      });
      if (error) throw error;
      toast.success("Voice note sent, transcribing…", { id });
      // Transcribe in background and update the just-inserted row
      transcribe({ data: { path, mime: "audio/webm" } }).then(async ({ text: transcript }) => {
        if (transcript) {
          await supabase.from("messages").update({ transcript })
            .eq("conversation_id", conversationId)
            .eq("media_url", path);
        }
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send voice note", { id });
    }
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
          const url = m.media_url ? signedMap[m.media_url] : "";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  mine ? "bg-foreground text-background" : "bg-card border border-border text-foreground"
                }`}
              >
                {m.media_type === "audio" && url && (
                  <div>
                    <audio src={url} controls className="max-w-full" />
                    {m.transcript && (
                      <p className={`mt-1 text-xs italic ${mine ? "text-background/70" : "text-muted-foreground"}`}>
                        “{m.transcript}”
                      </p>
                    )}
                  </div>
                )}
                {m.media_type === "image" && url && <img src={url} alt="" className="max-h-64 rounded-lg" />}
                {m.content && <p className={m.media_url ? "mt-1" : ""}>{m.content}</p>}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet — say hi 👋</p>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border bg-background p-3 pb-20 md:pb-3">
        <VoiceRecorder onRecorded={sendVoice} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="flex-1 rounded-full border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function VoiceRecorder({ onRecorded }: { onRecorded: (blob: Blob) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) { setState("idle"); setSeconds(0); return; }
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setState("idle");
        setSeconds(0);
        onRecorded(blob);
      };
      rec.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone permission denied");
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
    setState("processing");
  }

  function cancel() {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1">
        <button type="button" onClick={cancel} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Cancel">
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="min-w-[3ch] font-mono text-xs">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span>
        <button type="button" onClick={stop} className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background" aria-label="Send voice note">
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      </div>
    );
  }
  if (state === "processing") {
    return <div className="flex h-10 w-10 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  return (
    <button
      type="button"
      onClick={start}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
      aria-label="Record voice note"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
