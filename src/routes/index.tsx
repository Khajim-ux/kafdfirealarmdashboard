import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PARCELS, ALARM_TYPES, STATUSES, DEVICE_TYPES, type Trouble } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle, Flame, ShieldAlert, PowerOff, CheckCircle2, Plus, Search,
  RefreshCw, LogOut, FileText, FileSpreadsheet, Trash2, Pencil, ClipboardList, Flame as FlameIcon, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { TroubleFormDialog } from "@/components/trouble-form-dialog";
import { exportToExcel, exportToPdf } from "@/lib/exports";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

interface AuditRow { id: string; action: string; actor: string | null; created_at: string; record_id: string | null }

function Dashboard() {
  const navigate = useNavigate();
  const { user, role, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  const [rows, setRows] = useState<Trouble[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [fParcel, setFParcel] = useState<string>("all");
  const [fFloor, setFFloor] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fDeviceType, setFDeviceType] = useState<string>("all");
  const [fTech, setFTech] = useState<string>("");
  const [fTenant, setFTenant] = useState<string>("");
  const [fDate, setFDate] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<Trouble | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase.from("troubles").select("*").order("event_at", { ascending: false }).limit(1000);
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Trouble[]);
    const { data: a } = await supabase.from("audit_log").select("id, action, actor, created_at, record_id").order("created_at", { ascending: false }).limit(50);
    setAudit((a ?? []) as AuditRow[]);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const iv = setInterval(load, 30000);
    const ch = supabase
      .channel("troubles-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "troubles" }, () => { void load(); })
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [user, load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (fParcel !== "all" && r.parcel !== fParcel) return false;
    if (fFloor && (r.floor ?? "").toLowerCase() !== fFloor.toLowerCase()) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fType !== "all" && r.alarm_type !== fType) return false;
    if (fDeviceType !== "all" && r.device_type !== fDeviceType) return false;
    if (fTech && !(r.technician ?? "").toLowerCase().includes(fTech.toLowerCase())) return false;
    if (fTenant && !(r.tenant ?? "").toLowerCase().includes(fTenant.toLowerCase())) return false;
    if (fDate && !r.event_at.startsWith(fDate)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(
        r.device_id.toLowerCase().includes(s) ||
        (r.panel ?? "").toLowerCase().includes(s) ||
        (r.location ?? "").toLowerCase().includes(s)
      )) return false;
    }
    return true;
  }), [rows, fParcel, fFloor, fStatus, fType, fDeviceType, fTech, fTenant, fDate, search]);

  const kpis = useMemo(() => {
    const isOpen = (r: Trouble) => r.status === "open";
    return {
      troubles: rows.filter((r) => r.alarm_type === "trouble" && isOpen(r)).length,
      supervisory: rows.filter((r) => r.alarm_type === "supervisory" && isOpen(r)).length,
      fire: rows.filter((r) => r.alarm_type === "fire_alarm" && isOpen(r)).length,
      disabled: rows.filter((r) => r.alarm_type === "disabled" && isOpen(r)).length,
      monitor: rows.filter((r) => r.alarm_type === "monitor_alert" && isOpen(r)).length,
      closed: rows.filter((r) => r.status === "closed").length,
      open: rows.filter(isOpen).length,
    };
  }, [rows]);

  const byParcel = useMemo(() =>
    PARCELS.map((p) => ({ parcel: p, count: rows.filter((r) => r.parcel === p && r.alarm_type === "trouble").length })),
  [rows]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      map.set(format(d, "MM-dd"), 0);
    }
    rows.forEach((r) => {
      if (r.alarm_type !== "trouble") return;
      const k = format(new Date(r.event_at), "MM-dd");
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map, ([day, count]) => ({ day, count }));
  }, [rows]);

  const openClosed = [
    { name: "Open", value: kpis.open },
    { name: "Closed", value: kpis.closed },
  ];

  const typeDistribution = ALARM_TYPES.map((t) => ({
    name: t.label,
    value: rows.filter((r) => r.alarm_type === t.value).length,
  }));

  const chartColors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
  const cssColors = ["#dc2626", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

  async function del(id: string) {
    if (!confirm("Delete this trouble permanently?")) return;
    const { error } = await supabase.from("troubles").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Deleted");
  }

  const canWrite = role === "admin" || role === "operator";
  const canDelete = role === "admin";

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow"><Flame className="h-5 w-5" /></div>
            <div>
              <h1 className="font-semibold leading-tight">Fire Alarm Dashboard</h1>
              <p className="text-xs text-muted-foreground">{user.email} · <Badge variant="secondary" className="ml-1">{role ?? "viewer"}</Badge></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className={"h-4 w-4 " + (fetching ? "animate-spin" : "")} /></Button>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered)}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportToPdf(filtered)}><FileText className="h-4 w-4 mr-1" />PDF</Button>
            {canWrite && <Button size="sm" onClick={() => { setEditRow(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" />New</Button>}
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Active Troubles" value={kpis.troubles} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
          <KpiCard label="Supervisory" value={kpis.supervisory} icon={<ShieldAlert className="h-5 w-5" />} tone="info" />
          <KpiCard label="Fire Alarms" value={kpis.fire} icon={<FlameIcon className="h-5 w-5" />} tone="destructive" />
          <KpiCard label="Disabled Devices" value={kpis.disabled} icon={<PowerOff className="h-5 w-5" />} tone="muted" />
          <KpiCard label="Closed Tickets" value={kpis.closed} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Troubles by Parcel</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byParcel}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="parcel" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={cssColors[0]} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Daily Trouble Trend (14d)</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={cssColors[1]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Open vs Closed</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={openClosed} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} label>
                    <Cell fill={cssColors[0]} /><Cell fill={cssColors[3]} />
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Alarm Type Distribution</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeDistribution} dataKey="value" nameKey="name" outerRadius={80} label>
                    {typeDistribution.map((_, i) => <Cell key={i} fill={cssColors[i % cssColors.length]} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Table + Audit */}
        <Tabs defaultValue="records">
          <TabsList>
            <TabsTrigger value="records"><ClipboardList className="h-4 w-4 mr-1" />Records</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
          <TabsContent value="records" className="space-y-3">
            {/* Filters */}
            <Card><CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <div className="col-span-2 relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search device / panel / location…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Select value={fParcel} onValueChange={setFParcel}><SelectTrigger><SelectValue placeholder="Parcel" /></SelectTrigger><SelectContent><SelectItem value="all">All parcels</SelectItem>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Floor" value={fFloor} onChange={(e) => setFFloor(e.target.value)} />
              <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <Select value={fType} onValueChange={setFType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{ALARM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
              <Select value={fDeviceType} onValueChange={setFDeviceType}><SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger><SelectContent><SelectItem value="all">All devices</SelectItem>{DEVICE_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Technician" value={fTech} onChange={(e) => setFTech(e.target.value)} />
              <Input placeholder="Tenant" value={fTenant} onChange={(e) => setFTenant(e.target.value)} />
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </CardContent></Card>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Parcel</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No records match your filters.</TableCell></TableRow>
                    )}
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell><div className="font-medium">{r.device_id}</div><div className="text-xs text-muted-foreground">{r.location ?? r.panel ?? ""}</div></TableCell>
                        <TableCell>{r.parcel}</TableCell>
                        <TableCell>{r.floor ?? "—"}</TableCell>
                        <TableCell><TypeBadge type={r.alarm_type} /></TableCell>
                        <TableCell><Badge variant={r.status === "open" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                        <TableCell>{r.technician ?? "—"}</TableCell>
                        <TableCell>{r.tenant ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.event_at), "yyyy-MM-dd HH:mm")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canWrite && <Button size="icon" variant="ghost" onClick={() => { setEditRow(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                            {canDelete && <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No audit entries yet.</TableCell></TableRow>}
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.created_at), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                        <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.record_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{a.actor?.slice(0, 8) ?? "system"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <TroubleFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editRow} onSaved={load} />
    </div>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "warning"|"info"|"destructive"|"muted"|"success" }) {
  const toneMap: Record<string, string> = {
    warning: "bg-warning/15 text-warning-foreground border-warning/30",
    info: "bg-info/15 text-info border-info/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground border-border",
    success: "bg-success/15 text-success border-success/30",
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={"h-11 w-11 rounded-lg border flex items-center justify-center " + toneMap[tone]}>{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string }> = {
    trouble: { label: "Trouble", className: "bg-warning/20 text-warning-foreground border-warning/40" },
    supervisory: { label: "Supervisory", className: "bg-info/20 text-info border-info/40" },
    fire_alarm: { label: "Fire", className: "bg-destructive/20 text-destructive border-destructive/40" },
    disabled: { label: "Disabled", className: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[type] ?? { label: type, className: "" };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}
