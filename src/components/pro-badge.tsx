import { BadgeCheck, Crown } from "lucide-react";

export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <BadgeCheck
      className={`inline h-4 w-4 fill-foreground text-background ${className}`}
      aria-label="Verified"
    />
  );
}

export function FoundingBadge({ number, compact = false }: { number: number; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-foreground/40 bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        <Crown className="h-2.5 w-2.5" /> #{number}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3 py-1 text-xs font-bold uppercase tracking-wider text-background">
      <Crown className="h-3 w-3" /> Founding Member #{number}
    </span>
  );
}
