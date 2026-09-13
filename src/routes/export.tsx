import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PARCELS } from "@/lib/constants";
import { toRecordRows, type Trouble } from "@/lib/exports";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/export")({
  component: ExportPage,
  head: () => ({
    meta: [
      { title: "Daily Log Export — Fire Alarm Management" },
      { name: "description", content: "Export all fire alarm records and daily shift logs to Excel." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Daily Log Export — Fire Alarm Management" },
      { property: "og:description", content: "Export all fire alarm records and daily shift logs to Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Daily Log Export — Fire Alarm Management" },
      { name: "twitter:description", content: "Export all fire alarm records and daily shift logs to Excel." },
    ],
  }),
});

const ALL_TOWERS = "__all__";

const LOG_HEADER = [
  "Date", "Tower", "Operator", "Day/Night", "Event",
  "Total Trouble", "Isolation Disabled", "Supervisory", "Maintenance Alert",
  "Ground Fault", "Open/Short", "Fire Incident", "Isolated Area", "Remarks",
];

function ExportPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [parcel, setParcel] = useState<string>(ALL_TOWERS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  async function exportAll() {
    if (!user) return;
    setBusy(true);
    try {
      // Fire Alarm Records (troubles)
      let rq = supabase.from("troubles").select("*").order("event_at", { ascending: false }).limit(10000);
      if (parcel !== ALL_TOWERS) rq = rq.eq("parcel", parcel);
      if (from) rq = rq.gte("event_at", from + "T00:00:00Z");
      if (to) rq = rq.lte("event_at", to + "T23:59:59Z");
      const { data: troubles, error: rErr } = await rq;
      if (rErr) throw rErr;

      // Daily shift logs (tracker fields)
      let lq = supabase.from("daily_logs").select("*").order("log_date", { ascending: false }).order("created_at", { ascending: true }).limit(10000);
      if (parcel !== ALL_TOWERS) lq = lq.eq("parcel", parcel);
      if (from) lq = lq.gte("log_date", from);
      if (to) lq = lq.lte("log_date", to);
      const { data: logs, error: lErr } = await lq;
      if (lErr) throw lErr;

      // Operator display names (own profile always readable; admins see all)
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, employee_id");
      const labelById = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? p.employee_id ?? ""]));
      const userLabel = (id: string | null) => (id ? (labelById.get(id) ?? (id === user.id ? (user.user_metadata?.full_name ?? user.email ?? "") : "")) : "");

      const wb = XLSX.utils.book_new();

      const wsRecords = XLSX.utils.json_to_sheet(toRecordRows((troubles ?? []) as Trouble[], userLabel));
      XLSX.utils.book_append_sheet(wb, wsRecords, "Fire Alarm Records");

      const logRows = (logs ?? []).map((l) => [
        l.log_date, l.parcel, l.operator_name ?? "", l.shift, l.event,
        l.total_trouble, l.isolation_disabled, l.supervisory, l.maintenance_alert,
        l.ground_fault, l.open_short, l.fire_incident, l.isolated_area ?? "", l.remarks ?? "",
      ]);
      const wsLogs = XLSX.utils.aoa_to_sheet([LOG_HEADER, ...logRows]);
      XLSX.utils.book_append_sheet(wb, wsLogs, "Daily Logs");

      const scope = parcel === ALL_TOWERS ? "all-towers" : `tower-${parcel}`;
      XLSX.writeFile(wb, `daily-log-export-${scope}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success(`Exported ${troubles?.length ?? 0} records and ${logs?.length ?? 0} daily log rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" aria-label="Back to dashboard" onClick={() => navigate({ to: "/" })}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Daily Log Export</h1>
            <p className="text-xs text-muted-foreground">Dump all fire alarm records and shift logs to Excel</p>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export options</CardTitle>
            <CardDescription>
              The Excel file contains two sheets: <strong>Fire Alarm Records</strong> (all 22 columns) and{" "}
              <strong>Daily Logs</strong> (check in/out tracker with all counters). Leave the tower on
              "All towers" and the dates blank to dump everything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Tower</Label>
                <Select value={parcel} onValueChange={setParcel}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Tower" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TOWERS}>All towers</SelectItem>
                    {PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
              {(from || to) && (
                <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>
              )}
            </div>
            <Button onClick={() => void exportAll()} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden />}
              {busy ? "Preparing export…" : "Export to Excel"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
