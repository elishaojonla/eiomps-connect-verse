import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { Avatar } from "./feed";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const INTERESTS = [
  { id: "nft", label: "NFT Artists", emoji: "🎨" },
  { id: "web3-design", label: "Web3 Designers", emoji: "✨" },
  { id: "trading", label: "Crypto Traders", emoji: "📈" },
  { id: "dao", label: "DAO Communities", emoji: "🏛️" },
  { id: "defi", label: "DeFi Projects", emoji: "💰" },
  { id: "dev", label: "Web3 Developers", emoji: "⚡" },
  { id: "gaming", label: "GameFi", emoji: "🎮" },
  { id: "memes", label: "Crypto Memes", emoji: "🐸" },
];

function Onboarding() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const { data: suggestions } = useQuery({
    queryKey: ["suggestions", Array.from(selected).sort().join(",")],
    enabled: step === 2 && selected.size > 0,
    queryFn: async () => {
      const cats = Array.from(selected);
      const { data } = await supabase
        .from("suggested_accounts")
        .select("category,sort_order,profile:profiles!suggested_accounts_user_id_fkey(id,username,full_name,bio,avatar_url,is_verified,is_official)")
        .in("category", cats)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
  });

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function saveInterestsAndContinue() {
    if (!me || selected.size === 0) { toast.error("Pick at least one topic"); return; }
    setSaving(true);
    await supabase.from("profiles").update({ interests: Array.from(selected) }).eq("id", me);
    setSaving(false);
    setStep(2);
  }

  async function toggleFollowSuggestion(userId: string) {
    if (!me) return;
    if (followed.has(userId)) {
      await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", userId);
      setFollowed((s) => { const n = new Set(s); n.delete(userId); return n; });
    } else {
      await supabase.from("follows").insert({ follower_id: me, following_id: userId });
      setFollowed((s) => new Set(s).add(userId));
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {step === 1 ? (
        <>
          <div className="mb-6 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8" />
            <h1 className="font-display text-2xl font-bold">What are you into?</h1>
            <p className="text-sm text-muted-foreground">Pick a few topics to personalize your feed.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {INTERESTS.map((i) => {
              const on = selected.has(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    on ? "border-foreground bg-foreground/5" : "border-border hover:bg-secondary"
                  }`}
                >
                  <div className="text-2xl">{i.emoji}</div>
                  <div className="mt-1 text-sm font-semibold">{i.label}</div>
                  {on && <Check className="mt-2 h-4 w-4" />}
                </button>
              );
            })}
          </div>
          <button
            onClick={saveInterestsAndContinue}
            disabled={saving || selected.size === 0}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </button>
        </>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold">People to follow</h1>
            <p className="text-sm text-muted-foreground">Curated Web3 accounts based on your interests.</p>
          </div>
          <div className="space-y-2">
            {(suggestions ?? []).map((s: any) => (
              <div key={s.profile?.id ?? Math.random()} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <Avatar url={s.profile?.avatar_url} name={s.profile?.username ?? "?"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.profile?.full_name || s.profile?.username}</div>
                  <div className="truncate text-xs text-muted-foreground">@{s.profile?.username} · {s.category}</div>
                </div>
                <button
                  onClick={() => s.profile && toggleFollowSuggestion(s.profile.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    s.profile && followed.has(s.profile.id) ? "border border-border" : "bg-foreground text-background"
                  }`}
                >
                  {s.profile && followed.has(s.profile.id) ? "Following" : "Follow"}
                </button>
              </div>
            ))}
            {suggestions && suggestions.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No suggestions yet — check the feed to discover people.
              </p>
            )}
          </div>
          <button
            onClick={() => navigate({ to: "/feed" })}
            className="mt-6 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background"
          >
            Go to feed
          </button>
        </>
      )}
    </div>
  );
}
