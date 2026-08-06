import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  PARCELS, ALARM_TYPES, STATUSES, DEVICE_TYPES, EVENT_TYPES, ACTIVE_STATUSES,
  canEditTicket, canDeleteTicket, canManageUsers, formatUser, normalizeEventType,
  type Trouble, type Profile,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle, Flame, ShieldAlert, PowerOff, CheckCircle2, Plus, Search,
  RefreshCw, LogOut, FileText, FileSpreadsheet, Trash2, Pencil, ClipboardList,
  Flame as FlameIcon, Activity, Camera, ImageOff, Table2, Paperclip, UserCog,
  Bell, Wrench, RotateCcw, Wind, Droplets,
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { TroubleFormDialog } from "@/components/trouble-form-dialog";
import { NotificationsBell } from "@/components/notifications-bell";
import { SearchableSelect } from "@/components/searchable-select";
import { exportToExcel, exportToPdf, exportToCsv } from "@/lib/exports";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Live Dashboard — Fire Alarm Management" },
      { name: "description", content: "Live KPIs, real-time records, alarm trends, and device analytics for your fire alarm system." },
      { property: "og:title", content: "Live Dashboard — Fire Alarm Management" },
      { property: "og:description", content: "Track active events, fire alarms, supervisory records, and device analytics in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Live Dashboard — Fire Alarm Management" },
      { name: "twitter:description", content: "Track active events, fire alarms, supervisory records, and device analytics in real time." },
      { property: "og:url", content: "https://kafdfirealarmdashboard.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://kafdfirealarmdashboard.lovable.app/" }],
  }),
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
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [fParcel, setFParcel] = useState<string>("all");
  const [fFloor, setFFloor] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fActive, setFActive] = useState<string>("all");
  const [fEventType, setFEventType] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fDeviceType, setFDeviceType] = useState<string>("all");
  const [fTech, setFTech] = useState<string>("");
  const [fTenant, setFTenant] = useState<string>("");
  const [fUserName, setFUserName] = useState<string>("");
  const [fUserId, setFUserId] = useState<string>("");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<Trouble | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase.from("troubles").select("*").order("event_at", { ascending: false }).limit(1000);
    if (error) toast.error(error.message);
    else setRows((data ?? []) as unknown as Trouble[]);
    const { data: a } = await supabase.from("audit_log").select("id, action, actor, created_at, record_id").order("created_at", { ascending: false }).limit(50);
    setAudit((a ?? []) as AuditRow[]);
    const { data: p } = await supabase.from("profiles").select("user_id, full_name, employee_id");
    setProfiles(Object.fromEntries(((p ?? []) as Profile[]).map((x) => [x.user_id, x])));
    const { data: ur } = await supabase.from("user_roles").select("user_id, role");
    setUserRoles(Object.fromEntries(((ur ?? []) as { user_id: string; role: string }[]).map((x) => [x.user_id, x.role])));
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

  const userLabel = useCallback(
    (id: string | null) => formatUser(id, profiles, userRoles),
    [profiles, userRoles],
  );

  const filtered = useMemo(() => rows.filter((r) => {
    if (fParcel !== "all" && r.parcel !== fParcel) return false;
    if (fFloor && (r.floor ?? "").toLowerCase() !== fFloor.toLowerCase()) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fActive !== "all" && (r.active_status ?? "Active") !== fActive) return false;
    if (fEventType !== "all" && normalizeEventType(r.event_type) !== fEventType) return false;
    if (fType !== "all" && r.alarm_type !== fType) return false;
    if (fDeviceType !== "all" && r.device_type !== fDeviceType) return false;
    if (fTech && !(r.technician ?? "").toLowerCase().includes(fTech.toLowerCase())) return false;
    if (fTenant && !(r.tenant ?? "").toLowerCase().includes(fTenant.toLowerCase())) return false;
    if (fUserName) {
      const name = (profiles[r.created_by ?? ""]?.full_name ?? "").toLowerCase();
      if (!name.includes(fUserName.toLowerCase())) return false;
    }
    if (fUserId) {
      const emp = (profiles[r.created_by ?? ""]?.employee_id ?? r.created_by ?? "").toLowerCase();
      if (!emp.includes(fUserId.toLowerCase())) return false;
    }
    const day = r.event_at.slice(0, 10);
    if (fFrom && day < fFrom) return false;
    if (fTo && day > fTo) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(
        r.device_id.toLowerCase().includes(s) ||
        (r.panel ?? "").toLowerCase().includes(s) ||
        (r.location ?? "").toLowerCase().includes(s) ||
        (r.fault_name ?? "").toLowerCase().includes(s) ||
        (r.device_number ?? "").toLowerCase().includes(s)
      )) return false;
    }
    return true;
  }), [rows, fParcel, fFloor, fStatus, fActive, fEventType, fType, fDeviceType, fTech, fTenant, fUserName, fUserId, fFrom, fTo, search, profiles]);

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

  const eventCounters = useMemo(() => {
    const count = (t: string) => rows.filter((r) => normalizeEventType(r.event_type) === t).length;
    return {
      "Fire / Alarm": count("Fire / Alarm"), Warning: count("Warning"),
      Fault: count("Fault"), Trouble: count("Trouble"), Supervisory: count("Supervisory"),
      Monitor: count("Monitor"), Disablement: count("Disablement"),
      "FM-200": count("FM-200"), CO2: count("CO2"), Restore: count("Restore"),
      Active: rows.filter((r) => (r.active_status ?? "Active") === "Active").length,
    };
  }, [rows]);

  const byParcel = useMemo(() =>
    PARCELS.map((p) => ({ parcel: p, count: rows.filter((r) => r.parcel === p).length })),
  [rows]);

  const [trendPeriod, setTrendPeriod] = useState<"daily"|"weekly"|"monthly">("daily");

  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    if (trendPeriod === "daily") {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        map.set(format(d, "MM-dd"), 0);
      }
      rows.forEach((r) => {
        const k = format(new Date(r.event_at), "MM-dd");
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
      });
    } else if (trendPeriod === "weekly") {
      for (let i = 11; i >= 0; i--) {
        const d = startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7));
        map.set(format(d, "MM-dd"), 0);
      }
      rows.forEach((r) => {
        const k = format(startOfWeek(new Date(r.event_at)), "MM-dd");
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
      });
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        map.set(format(d, "yyyy-MM"), 0);
      }
      rows.forEach((r) => {
        const k = format(startOfMonth(new Date(r.event_at)), "yyyy-MM");
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
      });
    }
    return Array.from(map, ([label, count]) => ({ label, count }));
  }, [rows, trendPeriod]);

  const openClosed = [
    { name: "Open", value: kpis.open },
    { name: "Closed", value: kpis.closed },
  ];

  const typeDistribution = useMemo(() =>
    EVENT_TYPES.map((t) => ({ name: t, value: rows.filter((r) => normalizeEventType(r.event_type) === t).length }))
      .filter((d) => d.value > 0),
  [rows]);

  const deviceTypeCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (!r.device_type) return;
      m.set(r.device_type, (m.get(r.device_type) ?? 0) + 1);
    });
    return Array.from(m, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const analytics = useMemo(() => ({
    totalAlarms: rows.filter((r) => normalizeEventType(r.event_type) === "Fire / Alarm").length,
    totalTroubles: rows.filter((r) => r.event_type === "Trouble").length,
    totalSupervisory: rows.filter((r) => r.event_type === "Supervisory").length,
    totalMonitor: rows.filter((r) => r.event_type === "Monitor").length,
    totalDeviceTypes: deviceTypeCounts.length,
    mostFrequent: deviceTypeCounts[0]?.name ?? "—",
  }), [rows, deviceTypeCounts]);

  const cssColors = ["#dc2626", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

  async function del(id: string) {
    if (!confirm("Delete this record permanently?")) return;
    const { error } = await supabase.from("troubles").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Deleted");
  }

  const canWrite = canEditTicket(role);
  const canDelete = canDeleteTicket(role);
  const canUsers = canManageUsers(role);

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
          <div className="flex items-center gap-2 flex-wrap">
            <NotificationsBell />
            <Button variant="outline" size="sm" aria-label="Refresh records" onClick={load}><RefreshCw className={"h-4 w-4 " + (fetching ? "animate-spin" : "")} aria-hidden /></Button>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, userLabel)}><FileSpreadsheet className="h-4 w-4 mr-1" aria-hidden />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => exportToCsv(filtered, userLabel)}><Table2 className="h-4 w-4 mr-1" aria-hidden />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportToPdf(filtered, userLabel)}><FileText className="h-4 w-4 mr-1" aria-hidden />PDF</Button>
            {canWrite && <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)}><Sparkles className="h-4 w-4 mr-1" aria-hidden />AI Scan</Button>}
            {canWrite && <Button size="sm" onClick={() => { setEditRow(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" aria-hidden />New</Button>}
            <Button variant="outline" size="sm" aria-label="My profile" onClick={() => navigate({ to: "/profile" })}><UserCog className="h-4 w-4" aria-hidden /></Button>
            {canUsers && <Button variant="outline" size="sm" onClick={() => navigate({ to: "/users" })}>Users</Button>}
            <Button variant="ghost" size="sm" aria-label="Sign out" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 space-y-4">
        {/* KPIs */}
        <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Key performance indicators</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Active Troubles" value={kpis.troubles} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
          <KpiCard label="Supervisory" value={kpis.supervisory} icon={<ShieldAlert className="h-5 w-5" />} tone="info" />
          <KpiCard label="Fire Alarms" value={kpis.fire} icon={<FlameIcon className="h-5 w-5" />} tone="destructive" />
          <KpiCard label="Disabled Devices" value={kpis.disabled} icon={<PowerOff className="h-5 w-5" />} tone="muted" />
          <KpiCard label="Monitor Alerts" value={kpis.monitor} icon={<Activity className="h-5 w-5" />} tone="monitor" />
          <KpiCard label="Closed Tickets" value={kpis.closed} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        </div>
        </section>

        {/* Live event-type counters */}
        <section aria-labelledby="event-counters-heading">
          <h2 id="event-counters-heading" className="sr-only">Live event type counters</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <MiniCounter label="Fire / Alarm" value={eventCounters["Fire / Alarm"]} icon={<FlameIcon className="h-4 w-4" />} tone="destructive" />
            <MiniCounter label="Warning" value={eventCounters.Warning} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
            <MiniCounter label="Fault" value={eventCounters.Fault} icon={<Wrench className="h-4 w-4" />} tone="warning" />
            <MiniCounter label="Trouble" value={eventCounters.Trouble} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
            <MiniCounter label="Supervisory" value={eventCounters.Supervisory} icon={<ShieldAlert className="h-4 w-4" />} tone="info" />
            <MiniCounter label="Monitor" value={eventCounters.Monitor} icon={<Activity className="h-4 w-4" />} tone="monitor" />
            <MiniCounter label="Disablement" value={eventCounters.Disablement} icon={<PowerOff className="h-4 w-4" />} tone="muted" />
            <MiniCounter label="FM-200" value={eventCounters["FM-200"]} icon={<Wind className="h-4 w-4" />} tone="info" />
            <MiniCounter label="CO2" value={eventCounters.CO2} icon={<Droplets className="h-4 w-4" />} tone="info" />
            <MiniCounter label="Restore" value={eventCounters.Restore} icon={<RotateCcw className="h-4 w-4" />} tone="success" />
            <MiniCounter label="Active Events" value={eventCounters.Active} icon={<Activity className="h-4 w-4" />} tone="destructive" />
          </div>
        </section>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Records by Tower</CardTitle></CardHeader>
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
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Event Trend</CardTitle>
              <div className="flex gap-1 text-xs">
                {(["daily","weekly","monthly"] as const).map((p) => (
                  <button key={p} onClick={() => setTrendPeriod(p)} className={"px-2 py-1 rounded border " + (trendPeriod === p ? "bg-primary text-primary-foreground border-primary" : "bg-background")}>{p}</button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
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
            <CardHeader><CardTitle className="text-base">Event Type Distribution</CardTitle></CardHeader>
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

        {/* Analytics summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Alarms" value={analytics.totalAlarms} icon={<FlameIcon className="h-5 w-5" />} tone="destructive" />
          <KpiCard label="Total Troubles" value={analytics.totalTroubles} icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
          <KpiCard label="Total Supervisory" value={analytics.totalSupervisory} icon={<ShieldAlert className="h-5 w-5" />} tone="info" />
          <KpiCard label="Total Monitor Events" value={analytics.totalMonitor} icon={<Activity className="h-5 w-5" />} tone="monitor" />
          <KpiCard label="Device Types Used" value={analytics.totalDeviceTypes} icon={<ClipboardList className="h-5 w-5" />} tone="muted" />
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Most Frequent Device/Event</div>
              <div className="text-sm font-semibold mt-1 truncate" title={analytics.mostFrequent}>{analytics.mostFrequent}</div>
            </CardContent>
          </Card>
        </div>

        {/* Top Device/Event Types */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Device/Event Types</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deviceTypeCounts.slice(0, 12)} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill={cssColors[2]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Tabs: Table + Audit */}
        <Tabs defaultValue="records">
          <TabsList>
            <TabsTrigger value="records"><ClipboardList className="h-4 w-4 mr-1" />Records</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
          <TabsContent value="records" className="space-y-3">
            {/* Filters */}
            <Card><CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <div className="col-span-2 relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search device / panel / location…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Input type="date" aria-label="From date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
              <Input type="date" aria-label="To date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
              <Select value={fParcel} onValueChange={setFParcel}><SelectTrigger><SelectValue placeholder="Tower" /></SelectTrigger><SelectContent><SelectItem value="all">All towers</SelectItem>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Floor" value={fFloor} onChange={(e) => setFFloor(e.target.value)} />
              <SearchableSelect
                value={fEventType}
                onChange={setFEventType}
                options={EVENT_TYPES as unknown as string[]}
                allOption={{ value: "all", label: "All event types" }}
                placeholder="Event Type"
                searchPlaceholder="Search event type…"
              />
              <SearchableSelect
                value={fDeviceType}
                onChange={setFDeviceType}
                options={DEVICE_TYPES as unknown as string[]}
                allOption={{ value: "all", label: "All device/events" }}
                placeholder="Device/Event"
                searchPlaceholder="Search device/event…"
              />
              <Select value={fActive} onValueChange={setFActive}><SelectTrigger><SelectValue placeholder="Active/Restore" /></SelectTrigger><SelectContent><SelectItem value="all">Active & Restore</SelectItem>{ACTIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All ticket statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
              <Select value={fType} onValueChange={setFType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All alarm types</SelectItem>{ALARM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Operator" value={fTech} onChange={(e) => setFTech(e.target.value)} />
              <Input placeholder="User Name" value={fUserName} onChange={(e) => setFUserName(e.target.value)} />
              <Input placeholder="User ID" value={fUserId} onChange={(e) => setFUserId(e.target.value)} />
              <Input placeholder="Tenant" value={fTenant} onChange={(e) => setFTenant(e.target.value)} />
            </CardContent></Card>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Tower</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Panel</TableHead>
                      <TableHead>Loop</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>Device Type</TableHead>
                      <TableHead>Device No.</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Fault/Warning</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cause</TableHead>
                      <TableHead>Action Taken</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>User Name</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead>Attachment</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={22} className="text-center text-muted-foreground py-8">No records match your filters.</TableCell></TableRow>
                    )}
                    {filtered.map((r) => {
                      const p = profiles[r.created_by ?? ""];
                      return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.event_at), "yyyy-MM-dd")}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{format(new Date(r.event_at), "HH:mm")}</TableCell>
                        <TableCell>{r.parcel}</TableCell>
                        <TableCell>{r.floor ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.panel ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.loop ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.zone ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.device_type ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.device_number ?? r.device_id}</TableCell>
                        <TableCell><EventBadge type={normalizeEventType(r.event_type)} /></TableCell>
                        <TableCell className="text-xs">{r.fault_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.priority ?? "—"}</TableCell>
                        <TableCell><Badge variant={(r.active_status ?? "Active") === "Active" ? "destructive" : "secondary"}>{r.active_status ?? "Active"}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={r.cause ?? ""}>{r.cause ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={r.action_taken ?? ""}>{r.action_taken ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.technician ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{p?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{p?.employee_id ?? r.created_by?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell><PhotoStatus status={r.photo_status} url={r.photo_url} /></TableCell>
                        <TableCell>{r.attachment_url ? <a href={r.attachment_url} target="_blank" rel="noreferrer" aria-label="Open attachment"><Paperclip className="h-4 w-4 text-primary" /></a> : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate" title={r.remarks ?? r.description ?? ""}>{r.remarks ?? r.description ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canWrite && <Button size="icon" variant="ghost" aria-label={`Edit ${r.device_id}`} onClick={() => { setEditRow(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" aria-hidden /></Button>}
                            {canDelete && <Button size="icon" variant="ghost" aria-label={`Delete ${r.device_id}`} onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" aria-hidden /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {audit.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No audit entries yet.</TableCell></TableRow>}
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.created_at), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                        <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.record_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{a.actor ? userLabel(a.actor) : "system"}</TableCell>
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

const TONE_MAP: Record<string, string> = {
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  info: "bg-info/15 text-info border-info/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
  success: "bg-success/15 text-success border-success/30",
  monitor: "bg-chart-5/15 text-chart-5 border-chart-5/30",
};

type Tone = "warning"|"info"|"destructive"|"muted"|"success"|"monitor";

function KpiCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: Tone }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={"h-11 w-11 rounded-lg border flex items-center justify-center " + TONE_MAP[tone]}>{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCounter({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: Tone }) {
  return (
    <div className={"rounded-lg border p-2 flex items-center gap-2 " + TONE_MAP[tone]}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-[10px] truncate opacity-80">{label}</div>
      </div>
    </div>
  );
}

function EventBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    "Fire / Alarm": "bg-destructive/20 text-destructive border-destructive/40",
    Warning: "bg-warning/20 text-warning-foreground border-warning/40",
    Trouble: "bg-warning/20 text-warning-foreground border-warning/40",
    Fault: "bg-warning/20 text-warning-foreground border-warning/40",
    Supervisory: "bg-info/20 text-info border-info/40",
    Monitor: "bg-chart-5/20 text-chart-5 border-chart-5/40",
    Disablement: "bg-muted text-muted-foreground border-border",
    Restore: "bg-success/20 text-success border-success/40",
  };
  return <Badge variant="outline" className={map[type] ?? ""}>{type}</Badge>;
}

function PhotoStatus({ status, url }: { status: string | null; url: string | null }) {
  const s = status ?? "No Photo";
  const none = s === "No Photo";
  const icon = none
    ? <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
    : <Camera className="h-4 w-4 text-primary" aria-hidden />;
  const inner = (
    <span className="flex items-center gap-1 whitespace-nowrap" title={s}>
      {icon}<span className="text-xs">{s}</span>
    </span>
  );
  return url && !none ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Photo: ${s}`}>{inner}</a> : inner;
}
