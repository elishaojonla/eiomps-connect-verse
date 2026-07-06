import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Gift, ExternalLink, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/airdrops")({
  component: AirdropsPage,
});

function AirdropsPage() {
  const { data: airdrops } = useQuery({
    queryKey: ["airdrops"],
    queryFn: async () => {
      const { data } = await supabase
        .from("airdrops")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <Gift className="h-6 w-6" />
        <h1 className="font-display text-2xl font-bold">Airdrop Alerts</h1>
      </div>

      {airdrops && airdrops.length > 0 ? (
        <div className="space-y-3">
          {airdrops.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{a.project}</div>
                  <h3 className="mt-0.5 text-lg font-bold">{a.title}</h3>
                  {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                  {a.reward && <div className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">Reward: {a.reward}</div>}
                  {a.ends_at && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> Ends {formatDistanceToNow(new Date(a.ends_at), { addSuffix: true })}
                    </div>
                  )}
                </div>
                {a.url && (
                  <a
                    href={a.url} target="_blank" rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                  >
                    Claim <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Gift className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No active airdrops right now.</p>
          <p className="mt-1 text-xs text-muted-foreground">Check back soon — admins post alerts here.</p>
        </div>
      )}
    </div>
  );
}
