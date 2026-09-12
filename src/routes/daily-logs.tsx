import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PARCELS, type AppRole } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, LogIn, LogOut as LogOutIcon, Pencil, RefreshCw, Trash2, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/daily-logs")({
  component: DailyLogsPage,
  head: () => ({
    meta: [
      { title: "Daily Shift Log Tracker — Fire Alarm Management" },
      { name: "description", content: "Per-tower daily fire alarm shift log with check in / check out and event counters." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Daily Shift Log Tracker — Fire Alarm Management" },
      { property: "og:description", content: "Per-tower daily fire alarm shift log with check in / check out and event counters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Daily Shift Log Tracker — Fire Alarm Management" },
      { name: "twitter:description", content: "Per-tower daily fire alarm shift log with check in / check out and event counters." },
    ],
  }),
});

type Shift = "DAY" | "NIGHT";
type LogEvent = "CHECK IN" | "CHECK OUT";

interface DailyLog {
  id: string;
  parcel: string;
  log_date: string;
  shift: Shift;
  event: LogEvent;
  operator_id: string | null;
  operator_name: string | null;
  total_trouble: number;
  isolation_disabled: number;
  supervisory: number;
  maintenance_alert: number;
  ground_fault: number;
  open_short: number;
  fire_incident: number;
  isolated_area: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
}

const COUNT_FIELDS = [
  { key: "total_trouble", label: "Total Trouble" },
  { key: "isolation_disabled", label: "Isolation / Disabled" },
  { key: "supervisory", label: "Supervisory" },
  { key: "maintenance_alert", label: "Maintenance Alert" },
  { key: "ground_fault", label: "Ground Fault" },
  { key: "open_short", label: "Open / Short" },
  { key: "fire_incident", label: "Fire Incident" },
] as const;

type CountKey = (typeof COUNT_FIELDS)[number]["key"];

function currentShift(): Shift {
  // Riyadh local time (UTC+3): DAY = 06:00–18:00
  const riyadhHour = (new Date().getUTCHours() + 3) % 24;
  return riyadhHour >= 6 && riyadhHour < 18 ? "DAY" : "NIGHT";
}

function todayRiyadh(): string {
  const now = new Date();
  const riyadh = new Date(now.getTime() + 3 * 3600 * 1000);
  return riyadh.toISOString().slice(0, 10);
}

function emptyCounts(): Record<CountKey, number> {
  return { total_trouble: 0, isolation_disabled: 0, supervisory: 0, maintenance_alert: 0, ground_fault: 0, open_short: 0, fire_incident: 0 };
}

function DailyLogsPage() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const canWrite: boolean = !!role && role !== "viewer";
  const canDelete = role === ("admin" as AppRole);

  const [parcel, setParcel] = useState<string>(PARCELS[0]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [fetching, setFetching] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // dialog state
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<DailyLog | null>(null);
  const [event, setEvent] = useState<LogEvent>("CHECK IN");
  const [shift, setShift] = useState<Shift>("DAY");
  const [logDate, setLogDate] = useState(todayRiyadh());
  const [counts, setCounts] = useState<Record<CountKey, number>>(emptyCounts());
  const [isolatedArea, setIsolatedArea] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  const load = useCallback(async () => {
    setFetching(true);
    let q = supabase.from("daily_logs").select("*").eq("parcel", parcel).order("log_date", { ascending: false }).order("created_at", { ascending: true }).limit(500);
    if (from) q = q.gte("log_date", from);
    if (to) q = q.lte("log_date", to);
    const { data, error } = await q;
    setFetching(false);
    if (error) toast.error(error.message);
    else setLogs((data ?? []) as DailyLog[]);
  }, [parcel, from, to]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  // realtime refresh
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("daily-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_logs" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, load]);

  function openDialog(ev: LogEvent, row?: DailyLog) {
    if (row) {
      setEditRow(row);
      setEvent(row.event);
      setShift(row.shift);
      setLogDate(row.log_date);
      setCounts({
        total_trouble: row.total_trouble, isolation_disabled: row.isolation_disabled,
        supervisory: row.supervisory, maintenance_alert: row.maintenance_alert,
        ground_fault: row.ground_fault, open_short: row.open_short, fire_incident: row.fire_incident,
      });
      setIsolatedArea(row.isolated_area ?? "");
      setRemarks(row.remarks ?? "");
    } else {
      setEditRow(null);
      setEvent(ev);
      setShift(currentShift());
      setLogDate(todayRiyadh());
      setCounts(emptyCounts());
      setIsolatedArea("");
      setRemarks("");
    }
    setOpen(true);
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    const payload = {
      parcel,
      log_date: logDate,
      shift,
      event,
      ...counts,
      isolated_area: isolatedArea || null,
      remarks: remarks || null,
    };
    const { error } = editRow
      ? await supabase.from("daily_logs").update(payload).eq("id", editRow.id)
      : await supabase.from("daily_logs").insert({
          ...payload,
          operator_id: user.id,
          operator_name: user.user_metadata?.full_name ?? user.email ?? null,
          created_by: user.id,
        });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editRow ? "Log updated" : `${event === "CHECK IN" ? "Checked in" : "Checked out"} — ${shift} shift, tower ${parcel}`);
    setOpen(false);
    void load();
  }

  async function remove(row: DailyLog) {
    if (!confirm(`Delete this ${row.event} log from ${row.log_date}?`)) return;
    const { error } = await supabase.from("daily_logs").delete().eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("Log deleted"); void load(); }
  }

  function exportCsv() {
    const header = ["Date", "Operator", "Day/Night", "Event", "Total Trouble", "Isolation Disabled", "Supervisory", "Maintenance Alert", "Ground Fault", "Open/Short", "Fire Incident", "Isolated Area", "Remarks"];
    const rows = logs.map((l) => [
      l.log_date, l.operator_name ?? "", l.shift, l.event,
      l.total_trouble, l.isolation_disabled, l.supervisory, l.maintenance_alert,
      l.ground_fault, l.open_short, l.fire_incident,
      l.isolated_area ?? "", l.remarks ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-log-${parcel}-${todayRiyadh()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // group by date, newest date first
  const grouped = useMemo(() => {
    const map = new Map<string, DailyLog[]>();
    for (const l of logs) {
      const arr = map.get(l.log_date) ?? [];
      arr.push(arr.length, l as never).pop; // placeholder no-op
      arr.push;
    }
    return map;
  }, [logs]);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" aria-label="Back to dashboard" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">Daily Shift Log</h1>
              <p className="text-xs text-muted-foreground">Fire alarm daily log tracker per tower</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" aria-label="Refresh logs" onClick={() => void load()}>
              <RefreshCw className={"h-4 w-4 " + (fetching ? "animate-spin" : "")} aria-hidden />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logs.length}>
              <FileSpreadsheet className="h-4 w-4 mr-1" aria-hidden />CSV
            </Button>
            {canWrite && (
              <>
                <Button size="sm" onClick={() => openDialog("CHECK IN")}>
                  <LogIn className="h-4 w-4 mr-1" aria-hidden />Check In
                </Button>
                <Button variant="secondary" size="sm" onClick={() => openDialog("CHECK OUT")}>
                  <LogOutIcon className="h-4 w-4 mr-1" aria-hidden />Check Out
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tower & date range</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Tower</Label>
              <Select value={parcel} onValueChange={setParcel}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Tower" /></SelectTrigger>
                <SelectContent>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
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
            {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {parcel} — Fire Alarm Logs <Badge variant="secondary">{logs.length} rows</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DATE</TableHead>
                    <TableHead>OPERATOR</TableHead>
                    <TableHead>DAY/NIGHT</TableHead>
                    <TableHead>EVENT</TableHead>
                    <TableHead className="text-right">TOTAL TROUBLE</TableHead>
                    <TableHead className="text-right">ISOLATION DISABLED</TableHead>
                    <TableHead className="text-right">SUPERVISORY</TableHead>
                    <TableHead className="text-right">MAINTENANCE ALERT</TableHead>
                    <TableHead className="text-right">GROUND FAULT</TableHead>
                    <TableHead className="text-right">OPEN/SHORT</TableHead>
                    <TableHead className="text-right">FIRE INCIDENT</TableHead>
                    <TableHead>ISOLATED AREA</TableHead>
                    <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-muted-foreground py-10">
                        No log entries for tower {parcel} yet{canWrite ? " — press Check In to start a shift" : ""}.
                      </TableCell>
                    </TableRow>
                  )}
                  {logs.map((l, i) => {
                    const newDate = i === 0 || logs[i - 1].log_date !== l.log_date;
                    return (
                      <TableRow key={l.id} className={newDate && i > 0 ? "border-t-4 border-t-muted" : ""}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {newDate ? format(new Date(l.log_date + "T00:00:00"), "d/M/yyyy") : ""}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{l.operator_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.shift === "DAY" ? "secondary" : "outline"}>{l.shift}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap uppercase text-xs font-medium">{l.event}</TableCell>
                        <TableCell className="text-right">{l.total_trouble}</TableCell>
                        <TableCell className="text-right">{l.isolation_disabled}</TableCell>
                        <TableCell className="text-right">{l.supervisory}</TableCell>
                        <TableCell className="text-right">{l.maintenance_alert}</TableCell>
                        <TableCell className="text-right">{l.ground_fault}</TableCell>
                        <TableCell className="text-right">{l.open_short}</TableCell>
                        <TableCell className={"text-right font-semibold " + (l.fire_incident > 0 ? "bg-destructive text-destructive-foreground" : "")}>
                          {l.fire_incident}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{l.isolated_area ?? ""}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {canWrite && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit log" onClick={() => openDialog(l.event, l)}>
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete log" onClick={() => void remove(l)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRow ? "Edit log entry" : event === "CHECK IN" ? "Check In" : "Check Out"} — Tower {parcel}</DialogTitle>
            <DialogDescription>Enter the shift counters as shown on the panel.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Shift</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as Shift)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">DAY</SelectItem>
                  <SelectItem value="NIGHT">NIGHT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Event</Label>
              <Select value={event} onValueChange={(v) => setEvent(v as LogEvent)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECK IN">CHECK IN</SelectItem>
                  <SelectItem value="CHECK OUT">CHECK OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Isolated area</Label>
              <Input value={isolatedArea} onChange={(e) => setIsolatedArea(e.target.value)} placeholder="e.g. L-31,32 RT14-19&L-4" />
            </div>
            {COUNT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Input
                  type="number" min={0} inputMode="numeric"
                  value={counts[f.key]}
                  onChange={(e) => setCounts((c) => ({ ...c, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </div>
            ))}
            <div className="space-y-1 col-span-2">
              <Label>Remarks</Label>
              <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
