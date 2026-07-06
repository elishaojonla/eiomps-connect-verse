import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Send,
  Image as ImageIcon,
  Film,
  Mic,
  X,
  Square,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { uploadMedia, signed } from "@/lib/media-upload";
import { transcribeStorageAudio } from "@/lib/transcribe.functions";

export const Route = createFileRoute("/_authenticated/feed")({
  component: FeedPage,
});

type Post = {
  id: string;
  content: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  bookmarks_count: number;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  transcript: string | null;
  author: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

function FeedPage() {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [openComments, setOpenComments] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id,content,created_at,likes_count,comments_count,bookmarks_count,media_url,media_type,transcript,is_pinned,is_official,author:profiles!posts_author_id_fkey(id,username,full_name,avatar_url,is_verified,is_official)",
        )
        .order("is_pinned", { ascending: false })
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
    supabase.from("bookmarks").select("post_id").eq("user_id", me).then(({ data }) => {
      if (data) setBookmarkedIds(new Set(data.map((r) => r.post_id)));
    });
  }, [me, posts]);

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

  async function toggleBookmark(post: Post) {
    if (!me) return;
    const has = bookmarkedIds.has(post.id);
    const next = new Set(bookmarkedIds);
    if (has) {
      next.delete(post.id);
      setBookmarkedIds(next);
      await supabase.from("bookmarks").delete().eq("user_id", me).eq("post_id", post.id);
      toast.success("Removed bookmark");
    } else {
      next.add(post.id);
      setBookmarkedIds(next);
      await supabase.from("bookmarks").insert({ user_id: me, post_id: post.id });
      toast.success("Bookmarked");
    }
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  async function sharePost(post: Post) {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Eiomps", url }); return; } catch { /* canceled */ }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Home</h1>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">feed</span>
      </div>

      <Composer onPosted={() => queryClient.invalidateQueries({ queryKey: ["posts"] })} me={me} />

      {isLoading ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="mt-5 space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              liked={likedIds.has(p.id)}
              bookmarked={bookmarkedIds.has(p.id)}
              onLike={() => toggleLike(p)}
              onBookmark={() => toggleBookmark(p)}
              onShare={() => sharePost(p)}
              onComment={() => setOpenComments(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="text-muted-foreground">No posts yet. Be the first to share something.</p>
        </div>
      )}

      {openComments && me && (
        <CommentsDrawer postId={openComments} me={me} onClose={() => setOpenComments(null)} />
      )}
    </div>
  );
}

/* -------------------- Composer -------------------- */

function Composer({ onPosted, me }: { onPosted: () => void; me: string | null }) {
  const transcribe = useServerFn(transcribeStorageAudio);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<{ file: File | Blob; type: "image" | "video" | "audio"; preview: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function pickFile(kind: "image" | "video", f: File | undefined) {
    if (!f) return;
    const max = kind === "image" ? 8 : 50;
    if (f.size > max * 1024 * 1024) { toast.error(`Max ${max}MB`); return; }
    setMedia({ file: f, type: kind, preview: URL.createObjectURL(f) });
  }

  async function startRecord() {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("Mic not available"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1024) { toast.error("Recording too short"); return; }
        setMedia({ file: blob, type: "audio", preview: URL.createObjectURL(blob) });
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch { toast.error("Mic permission denied"); }
  }
  function stopRecord() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (!content.trim() && !media) return;
    setPosting(true);
    try {
      let media_url: string | null = null;
      let media_type: "image" | "video" | "audio" | null = null;
      let audioMime = "";
      if (media) {
        const ext =
          media.type === "image" ? ((media.file as File).name?.split(".").pop() || "jpg") :
          media.type === "video" ? ((media.file as File).name?.split(".").pop() || "mp4") :
          (media.file.type.includes("mp4") ? "mp4" : "webm");
        audioMime = media.file.type;
        const { path } = await uploadMedia(me, "posts", media.file, ext);
        media_url = path;
        media_type = media.type;
      }
      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({ author_id: me, content: content.trim() || null, media_url, media_type })
        .select("id")
        .single();
      if (error) throw error;

      // Background transcription for voice posts
      if (media_url && media_type === "audio" && inserted) {
        transcribe({ data: { path: media_url, mime: audioMime } })
          .then(async (r) => {
            if (r.text) {
              await supabase.from("posts").update({ transcript: r.text }).eq("id", inserted.id);
              onPosted();
            }
          })
          .catch((err) => console.warn("transcribe failed", err));
      }


      setContent("");
      setMedia(null);
      onPosted();
      toast.success("Posted");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-4 shadow-elegant"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        rows={3}
        className="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      {media && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-border">
          <button
            type="button"
            onClick={() => { URL.revokeObjectURL(media.preview); setMedia(null); }}
            className="absolute right-2 top-2 z-10 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {media.type === "image" && <img src={media.preview} alt="" className="max-h-96 w-full object-cover" />}
          {media.type === "video" && <video src={media.preview} controls className="max-h-96 w-full" />}
          {media.type === "audio" && <audio src={media.preview} controls className="w-full" />}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile("image", e.target.files?.[0])} />
          <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={(e) => pickFile("video", e.target.files?.[0])} />
          <ToolButton onClick={() => imageInput.current?.click()} icon={ImageIcon} label="Photo" />
          <ToolButton onClick={() => videoInput.current?.click()} icon={Film} label="Video" />
          {!recording ? (
            <ToolButton onClick={startRecord} icon={Mic} label="Voice" />
          ) : (
            <button type="button" onClick={stopRecord} className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
              <Square className="h-3 w-3 fill-current" /> Stop
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={(!content.trim() && !media) || posting}
          className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Post
        </button>
      </div>
    </form>
  );
}

function ToolButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: any; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/* -------------------- Post card -------------------- */

function PostCard({
  post, liked, bookmarked, onLike, onBookmark, onShare, onComment,
}: {
  post: Post; liked: boolean; bookmarked: boolean;
  onLike: () => void; onBookmark: () => void; onShare: () => void; onComment: () => void;
}) {
  const author = post.author;
  return (
    <article id={`post-${post.id}`} className="rounded-2xl border border-border bg-card p-4 transition hover:border-foreground/30">
      <header className="flex gap-3">
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
        </div>
      </header>

      {post.content && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
          {post.content}
        </p>
      )}

      {post.media_url && post.media_type && (
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <SignedMedia path={post.media_url} type={post.media_type} />
          {post.media_type === "audio" && (
            <div className="border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {post.transcript ? (
                <>
                  <div className="mb-1 font-semibold uppercase tracking-widest text-foreground/70">Transcript</div>
                  <p className="leading-relaxed text-foreground/85">{post.transcript}</p>
                </>
              ) : (
                <span className="italic">Transcribing…</span>
              )}
            </div>
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center gap-1 text-muted-foreground">
        <Action icon={Heart} label={post.likes_count} active={liked} activeClass="text-destructive" onClick={onLike} filled={liked} />
        <Action icon={MessageCircle} label={post.comments_count} onClick={onComment} />
        <Action icon={Share2} onClick={onShare} />
        <div className="ml-auto">
          <Action icon={Bookmark} active={bookmarked} activeClass="text-foreground" onClick={onBookmark} filled={bookmarked} />
        </div>
      </footer>
    </article>
  );
}

function Action({
  icon: Icon, label, active, activeClass, onClick, filled,
}: { icon: any; label?: number | string; active?: boolean; activeClass?: string; onClick: () => void; filled?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-secondary hover:text-foreground ${active ? activeClass : ""}`}
    >
      <Icon className={`h-4 w-4 ${filled ? "fill-current" : ""}`} />
      {label !== undefined && label !== 0 ? <span>{label}</span> : null}
    </button>
  );
}

/* -------------------- Signed media -------------------- */

function SignedMedia({ path, type }: { path: string; type: "image" | "video" | "audio" }) {
  const { data: url } = useQuery({
    queryKey: ["signed", path],
    queryFn: () => signed(path),
    staleTime: 1000 * 60 * 60 * 12,
  });
  if (!url) return <div className="h-48 animate-pulse bg-muted" />;
  if (type === "image") return <img src={url} alt="" className="max-h-[520px] w-full object-cover" loading="lazy" />;
  if (type === "video") return <video src={url} controls className="max-h-[520px] w-full bg-black" />;
  return <audio src={url} controls className="w-full p-2" />;
}

/* -------------------- Avatar -------------------- */

export function Avatar({ url, name, size = "md" }: { url: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "h-8 w-8 text-[10px]", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-xl" }[size];
  if (url) {
    return <img src={url} alt={name} className={`${cls} shrink-0 rounded-full border border-border object-cover`} />;
  }
  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-semibold text-foreground`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

/* -------------------- Comments Drawer -------------------- */

type Comment = {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  transcript: string | null;
  created_at: string;
  author: { id: string; username: string; full_name: string | null; avatar_url: string | null } | null;
};

function CommentsDrawer({ postId, me, onClose }: { postId: string; me: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const transcribe = useServerFn(transcribeStorageAudio);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<{ blob: Blob; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const { data: comments } = useQuery({
    queryKey: ["comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id,content,media_url,media_type,transcript,created_at,author:profiles!comments_author_id_fkey(id,username,full_name,avatar_url)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Comment[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`comments:${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [postId, queryClient]);

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1024) { toast.error("Too short"); return; }
        setAudio({ blob, preview: URL.createObjectURL(blob) });
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch { toast.error("Mic permission denied"); }
  }
  function stopRec() { recRef.current?.stop(); recRef.current = null; setRecording(false); }

  async function send() {
    if (!text.trim() && !audio) return;
    try {
      let media_url: string | null = null;
      let media_type: "audio" | null = null;
      let mime = "";
      if (audio) {
        mime = audio.blob.type;
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const { path } = await uploadMedia(me, "comments", audio.blob, ext);
        media_url = path;
        media_type = "audio";
      }
      const { data: inserted, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, author_id: me, content: text.trim() || null, media_url, media_type })
        .select("id")
        .single();
      if (error) throw error;
      setText(""); setAudio(null);
      if (media_url && inserted) {
        transcribe({ data: { path: media_url, mime } })
          .then(async (r) => {
            if (r.text) await supabase.from("comments").update({ transcript: r.text }).eq("id", inserted.id);
            queryClient.invalidateQueries({ queryKey: ["comments", postId] });
          })
          .catch((e) => console.warn(e));
      }
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center">
      <div className="flex h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl border border-border bg-background md:h-[80vh] md:rounded-3xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-semibold">Comments</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {comments && comments.length > 0 ? comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar url={c.author?.avatar_url ?? null} name={c.author?.username ?? "?"} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{c.author?.full_name || c.author?.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                {c.content && <p className="mt-0.5 text-sm text-foreground/90">{c.content}</p>}
                {c.media_url && c.media_type === "audio" && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-border">
                    <SignedMedia path={c.media_url} type="audio" />
                    <div className="border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {c.transcript ? (
                        <p className="leading-relaxed text-foreground/85">{c.transcript}</p>
                      ) : (
                        <span className="italic">Transcribing…</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )) : (
            <p className="text-center text-sm text-muted-foreground">No comments yet.</p>
          )}
        </div>

        <div className="border-t border-border p-3">
          {audio && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <audio src={audio.preview} controls className="h-8 flex-1" />
              <button onClick={() => setAudio(null)} className="rounded p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {!recording ? (
              <button onClick={startRec} className="rounded-full p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Mic className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={stopRec} className="rounded-full bg-destructive p-2.5 text-destructive-foreground">
                <Square className="h-4 w-4 fill-current" />
              </button>
            )}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={recording ? "Recording…" : "Add a comment"}
              className="flex-1 rounded-full border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={send}
              disabled={!text.trim() && !audio}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
