import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Bell, Heart, MessageCircle, UserPlus, AtSign } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "./feed";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Notif = {
  id: string;
  type: "like" | "message" | "follow" | "mention";
  read: boolean;
  created_at: string;
  actor: { username: string; avatar_url: string | null } | null;
};

const icons = {
  like: Heart,
  message: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
};
const labels = {
  like: "liked your post",
  message: "sent you a message",
  follow: "started following you",
  mention: "mentioned you",
};

function NotificationsPage() {
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const { data: items, refetch } = useQuery({
    queryKey: ["notifications", me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,read,created_at,actor:profiles!notifications_actor_id_fkey(username,avatar_url)")
        .eq("user_id", me!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Notif[];
    },
  });

  useEffect(() => {
    if (!me) return;
    supabase.from("notifications").update({ read: true }).eq("user_id", me).eq("read", false).then(() => {});
    const ch = supabase
      .channel("notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, refetch]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="font-display text-2xl font-bold">Notifications</h1>
      </div>

      {items && items.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((n) => {
            const Icon = icons[n.type];
            return (
              <div key={n.id} className="flex items-center gap-3 p-4">
                <div className="relative">
                  <Avatar url={n.actor?.avatar_url ?? null} name={n.actor?.username ?? "?"} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow">
                    <Icon className="h-3 w-3" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">@{n.actor?.username ?? "someone"}</span>{" "}
                    <span className="text-muted-foreground">{labels[n.type]}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">You're all caught up.</p>
        </div>
      )}
    </div>
  );
}
