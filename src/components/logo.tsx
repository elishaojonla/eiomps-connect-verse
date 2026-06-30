export function Logo({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const wordmark = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  }[size];
  return (
    <span
      className={`font-display font-bold tracking-tighter text-foreground ${wordmark} ${className}`}
      style={{ letterSpacing: "-0.04em" }}
    >
      eiomps<span className="text-muted-foreground">.</span>
    </span>
  );
}
