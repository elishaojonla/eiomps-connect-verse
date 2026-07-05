import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Lock, UserX, Activity, Crown, PhoneCall, ShieldAlert, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UpgradeToProButton } from "@/components/paystack-button";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Profile = {
  id: string;
  is_pro: boolean;
  pro_until: string | null;
  dm_privacy: "everyone" | "followers" | "nobody";
  posts_privacy: "everyone" | "followers";
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [twoFA, setTwoFA] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setTwoFA((data?.totp?.length ?? 0) > 0);
    }).catch(() => {});
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["settings-profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id,is_pro,pro_until,dm_privacy,posts_privacy")
        .eq("id", me!).single();
      return data as unknown as Profile;
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["login-activity", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("login_activity")
        .select("id,user_agent,ip,created_at")
        .eq("user_id", me!)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: blocks } = useQuery({
    queryKey: ["blocks", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("blocks")
        .select("blocked_id,created_at,blocked:profiles!blocks_blocked_id_fkey(username,full_name,avatar_url)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function updatePrivacy(patch: Partial<Profile>) {
    if (!me) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", me);
    if (error) { toast.error(error.message); return; }
    toast.success("Privacy updated");
    queryClient.invalidateQueries({ queryKey: ["settings-profile", me] });
  }

  async function unblock(userId: string) {
    if (!me) return;
    const { error } = await supabase.from("blocks")
      .delete().eq("blocker_id", me).eq("blocked_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Unblocked");
    queryClient.invalidateQueries({ queryKey: ["blocks", me] });
  }

  async function enroll2FA() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      toast.success("Scan the QR from your account settings to complete setup");
      console.info("MFA factor:", data);
      setTwoFA(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "2FA setup failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-3">
        <Section icon={Crown} title={profile?.is_pro ? "Eiomps Pro ✓" : "Eiomps Pro"} desc={
          profile?.is_pro
            ? profile.pro_until ? `Active until ${new Date(profile.pro_until).toLocaleDateString()}` : "Active"
            : "$5/month. Unlock voice/video calls, verified checkmark, custom themes."
        }>
          {profile?.is_pro ? (
            <span className="rounded-md border border-foreground bg-foreground px-2 py-1 text-xs font-semibold text-background">Active</span>
          ) : (
            <UpgradeToProButton
              label="Upgrade"
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ["settings-profile", me] })}
            />
          )}
        </Section>

        <Section icon={PhoneCall} title="Voice & video calls" desc="Included with Pro. Coming soon.">
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Pro only</span>
        </Section>

        <Section icon={Lock} title="Two-factor authentication (TOTP)" desc="Add an extra layer of security using an authenticator app.">
          <button
            onClick={enroll2FA}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${twoFA ? "bg-secondary text-foreground" : "bg-foreground text-background"}`}
          >
            {twoFA ? "Enrolled" : "Enable"}
          </button>
        </Section>

        <Section icon={Users} title="Who can DM me" desc="Choose who is allowed to start a direct message with you.">
          <select
            value={profile?.dm_privacy ?? "everyone"}
            onChange={(e) => updatePrivacy({ dm_privacy: e.target.value as Profile["dm_privacy"] })}
            className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
          >
            <option value="everyone">Everyone</option>
            <option value="followers">Followers only</option>
            <option value="nobody">No one</option>
          </select>
        </Section>

        <Section icon={Shield} title="Who can see my posts" desc="Control your default post audience.">
          <select
            value={profile?.posts_privacy ?? "everyone"}
            onChange={(e) => updatePrivacy({ posts_privacy: e.target.value as Profile["posts_privacy"] })}
            className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
          >
            <option value="everyone">Everyone</option>
            <option value="followers">Followers only</option>
          </select>
        </Section>

        <Section icon={UserX} title="Blocked users" desc={`${blocks?.length ?? 0} blocked`} noAction>
          <span />
        </Section>
        {blocks && blocks.length > 0 && (
          <div className="ml-2 space-y-1 rounded-xl border border-border bg-card p-2">
            {blocks.map((b) => {
              const blocked = b.blocked as { username: string; full_name: string | null } | null;
              return (
                <div key={b.blocked_id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span>@{blocked?.username ?? "user"}</span>
                  <button onClick={() => unblock(b.blocked_id)} className="text-xs text-muted-foreground hover:text-foreground">
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Section icon={Activity} title="Login activity" desc="Recent sign-ins to your account." noAction><span /></Section>
        {activity && activity.length > 0 ? (
          <div className="ml-2 space-y-1 rounded-xl border border-border bg-card p-2">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs">
                <span className="truncate text-muted-foreground">{a.user_agent ?? "Unknown device"}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ml-2 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No activity recorded yet.</p>
        )}

        <Section icon={ShieldAlert} title="Community standards" desc="Zero tolerance policy — read again.">
          <button
            onClick={() => { localStorage.removeItem("eiomps.policyAcknowledged"); window.location.reload(); }}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            View
          </button>
        </Section>

        <Section icon={Trash2} title="Delete account" desc="Contact support to permanently delete your account and all data.">
          <button
            onClick={() => toast.info("Email deletion@eiomps.app to request deletion.")}
            className="rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            Request
          </button>
        </Section>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Eiomps has a strict no-nudity, no-harassment, no-hate-speech policy. Violations lead to permanent bans and, when illegal, are reported to authorities.
      </p>
    </div>
  );
}

function Section({
  icon: Icon, title, desc, children, noAction = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; desc: string; children: React.ReactNode; noAction?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {!noAction && <div className="shrink-0">{children}</div>}
    </div>
  );
}
