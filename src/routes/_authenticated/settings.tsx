import { createFileRoute } from "@tanstack/react-router";
import { Shield, Lock, UserX, Activity, Crown, PhoneCall } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [twoFA, setTwoFA] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Settings</h1>

      <div className="space-y-3">
        <Section icon={Crown} title="Eiomps Pro" desc="Unlock voice and video calls, custom themes, and priority support.">
          <button
            onClick={() => toast.info("Pro subscriptions are coming soon.")}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            Upgrade
          </button>
        </Section>

        <Section icon={PhoneCall} title="Calls" desc="Voice and video calls are a Pro feature. Currently locked.">
          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Pro only</span>
        </Section>

        <Section icon={Lock} title="Two-factor authentication" desc="Add an extra layer of security to your account.">
          <button
            onClick={() => { setTwoFA((v) => !v); toast.success(twoFA ? "2FA disabled" : "2FA enrollment coming soon"); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${twoFA ? "bg-secondary text-foreground" : "bg-foreground text-background"}`}
          >
            {twoFA ? "Enabled" : "Enable"}
          </button>
        </Section>

        <Section icon={Shield} title="Privacy" desc="Control who can message you and view your Linkshine.">
          <button onClick={() => toast.info("Privacy controls open on your profile page.")} className="rounded-lg border border-border px-4 py-2 text-sm">Manage</button>
        </Section>

        <Section icon={UserX} title="Blocked users" desc="Users you have blocked cannot see or contact you.">
          <button onClick={() => toast.info("No blocked users.")} className="rounded-lg border border-border px-4 py-2 text-sm">View</button>
        </Section>

        <Section icon={Activity} title="Login activity" desc="Review recent sign-ins to your account.">
          <button onClick={() => toast.info("Activity log coming soon.")} className="rounded-lg border border-border px-4 py-2 text-sm">Open</button>
        </Section>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Eiomps has a strict no-nudity and no-inappropriate-content policy. Report violations from any post.
      </p>
    </div>
  );
}

function Section({
  icon: Icon, title, desc, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; desc: string; children: React.ReactNode;
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
      <div className="shrink-0">{children}</div>
    </div>
  );
}
