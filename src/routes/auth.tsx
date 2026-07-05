import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Wallet, Mail, Loader2, Crown } from "lucide-react";
import { connectInjectedWallet, hasInjectedWallet, shortAddr } from "@/lib/wallet";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  const { data: fmData } = useQuery({
    queryKey: ["fm-counter"],
    queryFn: async () => {
      const { data } = await supabase.from("founding_member_counter").select("count").eq("id", true).maybeSingle();
      return { count: data?.count ?? 0, remaining: Math.max(0, 100 - (data?.count ?? 0)) };
    },
    refetchInterval: 15000,
  });

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !policy) { toast.error("Please accept the community standards"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username || undefined },
          },
        });
        if (error) throw error;
        if (wallet && data.user) {
          await supabase.from("profiles").update({ wallet_address: wallet }).eq("id", data.user.id);
        }
        toast.success("Account created");
        navigate({ to: "/feed", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Log login activity
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          supabase.from("login_activity").insert({
            user_id: u.user.id,
            user_agent: navigator.userAgent.slice(0, 200),
          }).then(() => {});
        }
        toast.success("Welcome back");
        navigate({ to: "/feed", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/feed", replace: true });
  }

  async function handleWallet() {
    try {
      const addr = await connectInjectedWallet();
      setWallet(addr);
      toast.success(`Wallet connected: ${shortAddr(addr)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wallet connect failed");
    }
  }

  const remaining = fmData?.remaining ?? 0;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-foreground/[0.03] blur-[120px]" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-foreground/[0.03] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-foreground font-display text-base font-bold text-background">e</div>
            <span className="font-display text-3xl font-bold tracking-tighter text-foreground" style={{ letterSpacing: "-0.04em" }}>
              eiomps<span className="text-muted-foreground">.</span>
            </span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">Web3 social, done right</p>
        </div>

        {/* Founding member counter */}
        {remaining > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-foreground/20 bg-foreground/5 p-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">Founding Member</div>
                <div className="text-[10px] text-muted-foreground">1 month Pro free · Permanent badge</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{remaining}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">spots left</div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-elegant backdrop-blur-xl">
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === m ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-foreground"
              />
            )}
            <input
              type="email" required placeholder="you@wallet.eth"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-foreground"
            />
            <input
              type="password" required minLength={6} placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-foreground"
            />

            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={policy}
                  onChange={(e) => setPolicy(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I agree to Eiomps' zero-tolerance policy: no nudity, sexual content, harassment,
                  hate speech, or illegal content. Violations may result in permanent ban and
                  reporting to authorities.
                </span>
              </label>
            )}

            <button
              type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <button
              onClick={handleGoogle} disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-secondary/70 disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.78 3.92 14.6 3 12 3 6.93 3 2.85 7.04 2.85 12.05S6.93 21.1 12 21.1c6.96 0 9.27-4.86 9.27-7.4 0-.5-.05-.88-.12-1.6z"/>
              </svg>
              Continue with Google
            </button>
            <button
              onClick={handleWallet}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                wallet ? "border-foreground/40 bg-foreground/5" : "border-border bg-secondary hover:bg-secondary/70"
              }`}
            >
              <Wallet className="h-4 w-4" />
              {wallet ? shortAddr(wallet) : hasInjectedWallet() ? "Connect wallet" : "Install MetaMask to connect"}
            </button>
            {wallet && mode === "signup" && (
              <p className="text-center text-xs text-muted-foreground">
                Wallet will link to your profile after sign-up.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
