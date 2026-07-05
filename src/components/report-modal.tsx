import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";

const REASONS = [
  "Nudity or sexual content",
  "Harassment or bullying",
  "Hate speech",
  "Spam or scam",
  "Impersonation",
  "Violence or threats",
  "Other",
] as const;

export function ReportModal({
  targetType,
  targetId,
  onClose,
}: {
  targetType: "post" | "profile" | "comment" | "message";
  targetId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Sign in required"); setSending(false); return; }
    const { error } = await supabase.from("reports").insert({
      reporter_id: u.user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Report submitted — thank you");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elegant">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="font-display text-lg font-semibold">Report {targetType}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Eiomps has zero tolerance for nudity, harassment, hate speech, or illegal content.
          Serious violations may be reported to authorities.
        </p>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none"
        >
          {REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Add details (optional)"
          rows={3}
          maxLength={500}
          className="mt-3 w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none"
        />
        <button
          onClick={submit}
          disabled={sending}
          className="mt-4 w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
        >
          Submit report
        </button>
      </div>
    </div>
  );
}
