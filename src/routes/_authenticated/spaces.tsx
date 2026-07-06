import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Crown, Calendar, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/spaces")({
  component: SpacesPage,
});

function SpacesPage() {
  const [me, setMe] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [when, setWhen] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMe(data.user.id);
      const { data: p } = await supabase.from("profiles").select("is_pro").eq("id", data.user.id).maybeSingle();
      setIsPro(!!p?.is_pro);
    });
  }, []);

  const { data: spaces, refetch } = useQuery({
    queryKey: ["spaces"],
    queryFn: async () => {
      const { data } = await supabase
        .from("spaces")
        .select("*,host:profiles!spaces_host_id_fkey(username,full_name,avatar_url,is_verified)")
        .neq("status", "ended")
        .order("scheduled_for", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  async function create() {
    if (!isPro) { toast.error("Spaces are a Pro feature"); return; }
    if (!title.trim()) { toast.error("Title required"); return; }
    const { error } = await supabase.from("spaces").insert({
      host_id: me!, title: title.trim(), description: desc.trim() || null,
      scheduled_for: when ? new Date(when).toISOString() : null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Space scheduled");
    setShowCreate(false); setTitle(""); setDesc(""); setWhen("");
    refetch();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-6 w-6" />
          <h1 className="font-display text-2xl font-bold">Spaces</h1>
        </div>
        <button
          onClick={() => isPro ? setShowCreate(true) : toast.error("Upgrade to Pro to host Spaces")}
          className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
        >
          {!isPro && <Crown className="h-3 w-3" />} Host
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-700 dark:text-yellow-400">
        🚧 Live audio rooms are coming soon. You can schedule Spaces now — attendees will be notified when audio launches.
      </div>

      {spaces && spaces.length > 0 ? (
        <div className="space-y-3">
          {spaces.map((s: any) => (
            <div key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${
                  s.status === "live" ? "bg-red-500 text-white" : "bg-secondary text-muted-foreground"
                }`}>{s.status.toUpperCase()}</span>
                {s.scheduled_for && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" /> {formatDistanceToNow(new Date(s.scheduled_for), { addSuffix: true })}
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
              {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> Hosted by @{s.host?.username}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">No upcoming Spaces yet.</p>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-lg font-semibold">Host a Space</h3>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mt-3 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" rows={3} className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-lg border border-border py-2 text-sm">Cancel</button>
              <button onClick={create} className="flex-1 rounded-lg bg-foreground py-2 text-sm font-semibold text-background">Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
