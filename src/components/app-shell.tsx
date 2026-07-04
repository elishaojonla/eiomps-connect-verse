import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, MessageCircle, Bell, User, LogOut, Search, Flame, Settings } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ContentPolicy } from "@/components/content-policy";

const navItems = [
  { to: "/feed", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/trending", label: "Trending", icon: Flame },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.user.id)
        .eq("read", false);
      if (active) setUnread(count ?? 0);
    };
    load();
    const channel = supabase
      .channel("notif-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    to === "/feed" ? pathname === "/feed" : pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/feed" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-foreground font-display text-sm font-bold text-background">e</div>
            <span className="font-display text-xl font-bold tracking-tighter text-foreground" style={{ letterSpacing: "-0.04em" }}>
              eiomps<span className="text-muted-foreground">.</span>
            </span>
          </Link>

          <button
            onClick={handleSignOut}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Desktop side nav (md+) */}
      <div className="mx-auto flex max-w-6xl">
        <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-1 px-3 py-6 md:flex">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-soft-gradient text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className={cn("h-5 w-5", active && "text-primary")} />
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-destructive" />
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 pb-20 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
          {navItems.filter(i => ["/feed","/search","/messages","/notifications","/profile"].includes(i.to)).map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.to === "/notifications" && unread > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <ContentPolicy />
    </div>
  );

}
