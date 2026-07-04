import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

const KEY = "eiomps.policyAcknowledged";

export function ContentPolicy() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(KEY)) setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold">Community Standards</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Eiomps is a professional Web3 space. We have a strict{" "}
          <strong className="text-foreground">no-nudity</strong> and{" "}
          <strong className="text-foreground">no-inappropriate-content</strong> policy.
          Harassment, hate speech, scams, and explicit media will result in removal and a
          permanent ban. By continuing, you agree to follow these standards.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => { localStorage.setItem(KEY, "1"); setOpen(false); }}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            I understand and agree
          </button>
        </div>
      </div>
    </div>
  );
}
