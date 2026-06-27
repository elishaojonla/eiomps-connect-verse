import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Wallet, Mail, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

// Mock wallet connect — generates a deterministic-looking 0x address client-side.
function mockConnectWallet(): string {
  const chars = "0123456789abcdef";
  let addr = "0x";
  const arr = new Uint8Array(40);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 40; i++) addr += chars[arr[i] % 16];
  return addr;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
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
        toast.success("Welcome back");
        navigate({ to: "/feed", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
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

  function handleWallet() {
    const addr = mockConnectWallet();
    setWallet(addr);
    toast.success(`Wallet connected: ${addr.slice(0, 6)}…${addr.slice(-4)}`);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Glowing background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-purple/30 blur-[120px]" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue/30 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-brand-gradient shadow-glow" />
            <span className="font-display text-3xl font-bold text-brand-gradient">Eiomps</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Web3 social for the on-chain generation
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-elegant backdrop-blur-xl">
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === m ? "bg-brand-gradient text-white shadow-glow" : "text-muted-foreground"
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
                className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
            )}
            <input
              type="email"
              required
              placeholder="you@wallet.eth"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#fff" d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.5 12 6.5c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.78 3.92 14.6 3 12 3 6.93 3 2.85 7.04 2.85 12.05S6.93 21.1 12 21.1c6.96 0 9.27-4.86 9.27-7.4 0-.5-.05-.88-.12-1.6z"/>
              </svg>
              Continue with Google
            </button>
            <button
              onClick={handleWallet}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                wallet
                  ? "border-success/40 bg-success/10 text-foreground"
                  : "border-blue/40 bg-blue/10 text-foreground hover:bg-blue/20"
              }`}
            >
              <Wallet className="h-4 w-4" />
              {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
            </button>
            {wallet && mode === "signup" && (
              <p className="text-center text-xs text-muted-foreground">
                Wallet will link to your profile after sign-up.
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our terms · No real blockchain transactions occur in this demo.
        </p>
      </div>
    </div>
  );
}
