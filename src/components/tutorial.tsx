import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Search, Crown, PenSquare, X } from "lucide-react";

const KEY = "eiomps.tutorialShown";

const STEPS = [
  {
    icon: PenSquare,
    title: "Share your thoughts",
    body: "Tap the composer on your feed to post text, photos, videos, or voice notes. Voice notes are auto-transcribed.",
  },
  {
    icon: MessageCircle,
    title: "Message anyone",
    body: "Start a DM from Messages → New chat. Send text or record voice notes in real time.",
  },
  {
    icon: Search,
    title: "Discover people",
    body: "Search for creators by username and follow them. Check Trending for the loudest Web3 conversations.",
  },
  {
    icon: Crown,
    title: "Go Pro",
    body: "Unlock voice/video calls, custom themes, verified checkmark, and priority support for $5/month.",
  },
];

export function Tutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  function close() {
    localStorage.setItem(KEY, "1");
    setOpen(false);
  }

  if (!open) return null;
  const S = STEPS[step];
  const Icon = S.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 px-4 backdrop-blur">
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <button onClick={close} className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-foreground text-background">
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="text-center font-display text-xl font-bold">{S.title}</h3>
        <p className="mt-2 text-center text-sm text-muted-foreground">{S.body}</p>

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-foreground" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-border p-2 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
            >
              Next
            </button>
          ) : (
            <button
              onClick={close}
              className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
            >
              Get started
            </button>
          )}
          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={step === STEPS.length - 1}
            className="rounded-lg border border-border p-2 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button onClick={close} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">
          Skip
        </button>
      </div>
    </div>
  );
}
