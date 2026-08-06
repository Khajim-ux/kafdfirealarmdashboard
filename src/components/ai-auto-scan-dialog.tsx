import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { scanPanelPhoto, type ScanResult } from "@/lib/ai-scan.functions";
import { findExistingDevice, matchDeviceType, matchEventType, matchParcel } from "@/lib/device-match";
import { DEVICE_TYPES, EVENT_TYPES, PARCELS, type Trouble } from "@/lib/constants";
import { toast } from "sonner";
import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CONFIDENCE_THRESHOLD = 0.95;

type Draft = Partial<Trouble> & { photo_url?: string | null };

export function AiAutoScanDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const runScan = useServerFn(scanPanelPhoto);
  const [step, setStep] = useState<"capture" | "review">("capture");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [uncertain, setUncertain] = useState<Set<string>>(new Set());
  const [overall, setOverall] = useState<number | null>(null);
  const [linked, setLinked] = useState<string[]>([]);

  function reset() {
    setStep("capture"); setDraft({}); setUncertain(new Set()); setOverall(null); setLinked([]); setStatusText("");
  }

  function upd<K extends keyof Trouble>(k: K, v: Trouble[K] | null) {
    setDraft((d) => ({ ...d, [k]: v }));
    setUncertain((s) => { const n = new Set(s); n.delete(k as string); return n; });
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      setStatusText("Uploading photo…");
      const path = `${user?.id ?? "anon"}/scan-${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`;
      let photoUrl: string | null = null;
      const { error: upErr } = await supabase.storage.from("trouble-photos").upload(path, file, { upsert: true });
      if (!upErr) {
        const { data } = await supabase.storage.from("trouble-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
        photoUrl = data?.signedUrl ?? path;
      }

      setStatusText("Reading the panel with AI…");
      const imageDataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Could not read the image"));
        fr.readAsDataURL(file);
      });
      const r: ScanResult = await runScan({ data: { imageDataUrl } });

      setStatusText("Matching the device database…");
      const panel = r.panel_name || r.panel_id || r.panel_number || null;
      const deviceNumber = r.device_number || r.device_address || null;
      const known = await findExistingDevice({
        device_id: r.panel_id || r.device_address || r.device_label || null,
        panel,
        loop: r.loop || null,
        device_number: deviceNumber,
      });

      const deviceType = matchDeviceType(r.device_type) || matchDeviceType(r.event_details) || known?.device_type || null;
      const eventType = matchEventType(r.event_type) || matchEventType(r.reason) || matchEventType(r.event_details) || null;
      const parcel = matchParcel(r.building, r.location, r.panel_name, r.panel_id) || known?.parcel || null;

      const marks: string[] = [];
      if (known) marks.push("existing device record");
      if (deviceType) marks.push("device type");
      if (eventType) marks.push("event type");
      if (parcel) marks.push("tower");
      setLinked(marks);

      const conf = r.confidence ?? {};
      const low = new Set<string>();
      const flag = (formKey: string, aiKey: string, matched: boolean) => {
        const c = typeof conf[aiKey] === "number" ? (conf[aiKey] as number) : null;
        if (!matched || (c !== null && c < CONFIDENCE_THRESHOLD)) low.add(formKey);
      };

      const next: Draft = {
        device_id: r.panel_id || r.device_label || r.device_address || known?.device_id || "",
        panel: panel || known?.panel || null,
        panel_brand: undefined,
        loop: r.loop || known?.loop || null,
        zone: r.zone || known?.zone || null,
        device_number: deviceNumber || known?.device_number || null,
        device_type: deviceType,
        event_type: eventType,
        parcel: parcel || PARCELS[0],
        floor: r.floor || known?.floor || null,
        location: r.location || known?.location || null,
        tenant: known?.tenant || null,
        fault_name: r.reason || null,
        description: r.event_details || r.reason || null,
        event_at: r.event_datetime || new Date().toISOString(),
        alarm_type: eventType === "Fire / Alarm" ? "fire_alarm" : eventType === "Supervisory" ? "supervisory" : eventType === "Monitor" ? "monitor_alert" : "trouble",
        status: "open",
        active_status: "Active",
        priority: "Medium",
        photo_status: photoUrl ? "Uploaded" : "No Photo",
        photo_url: photoUrl,
        remarks: `AI auto scan${r.panel_brand ? ` (${r.panel_brand})` : ""} — Verification: Pending`,
      } as Draft;

      flag("device_id", "panel_id", Boolean(next.device_id));
      flag("panel", "panel_name", Boolean(next.panel));
      flag("loop", "loop", Boolean(next.loop));
      flag("zone", "zone", Boolean(next.zone));
      flag("device_number", "device_number", Boolean(next.device_number));
      flag("device_type", "device_type", Boolean(deviceType));
      flag("event_type", "event_type", Boolean(eventType));
      flag("parcel", "building", Boolean(parcel));
      flag("floor", "floor", Boolean(next.floor));
      flag("location", "location", Boolean(next.location));
      flag("fault_name", "reason", Boolean(next.fault_name));

      const overallConf = typeof r.overall_confidence === "number" ? r.overall_confidence : null;
      setOverall(overallConf);
      setDraft(next);
      setUncertain(low);
      setStep("review");

      if (overallConf !== null && overallConf >= CONFIDENCE_THRESHOLD && low.size === 0 && next.device_id && next.device_type) {
        await save(next, true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI scan failed");
    } finally {
      setBusy(false);
      setStatusText("");
    }
  }

  async function save(d: Draft = draft, auto = false) {
    if (!d.device_id?.trim() || !d.parcel || !d.device_type) {
      toast.error("Device ID, Tower and Device Type are required");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("troubles").insert({
      device_id: d.device_id,
      panel: d.panel || null,
      location: d.location || null,
      parcel: d.parcel,
      floor: d.floor || null,
      device_type: d.device_type,
      alarm_type: d.alarm_type || "trouble",
      status: d.status || "open",
      description: d.description || null,
      tenant: d.tenant || null,
      technician: null,
      photo_url: d.photo_url || null,
      qr_code: d.device_id,
      event_at: d.event_at || new Date().toISOString(),
      loop: d.loop || null,
      zone: d.zone || null,
      device_number: d.device_number || null,
      event_type: d.event_type || null,
      fault_name: d.fault_name || null,
      priority: d.priority || "Medium",
      active_status: d.active_status || "Active",
      remarks: d.remarks || null,
      photo_status: d.photo_status || "No Photo",
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(auto ? "High confidence — event saved automatically" : "Event saved");
    onSaved();
    onOpenChange(false);
    reset();
  }

  const warn = (k: string) => uncertain.has(k);
  const fieldClass = (k: string) => cn(warn(k) && "border-destructive ring-1 ring-destructive/40");

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Panel &amp; Device Auto Reading</DialogTitle>
          <DialogDescription>
            Photograph a panel LCD, graphic workstation or device label. AI reads the event and fills the record — you only confirm.
          </DialogDescription>
        </DialogHeader>

        {step === "capture" ? (
          <div className="space-y-3">
            <Label>Take or upload a photo</Label>
            <Input type="file" accept="image/*" capture="environment" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground">Supported panels: EST3, EST4, Notifier, Simplex, Siemens, Edwards, Honeywell.</p>
            {busy && <p className="text-sm text-muted-foreground">{statusText}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn("flex items-start gap-2 rounded-md border p-3 text-sm",
              uncertain.size === 0 ? "border-primary/40" : "border-destructive/50")}>
              {uncertain.size === 0
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" aria-hidden />
                : <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" aria-hidden />}
              <div>
                <div className="font-medium">
                  Confidence {overall !== null ? `${Math.round(overall * 100)}%` : "unknown"}
                  {uncertain.size > 0 && ` — ${uncertain.size} field(s) need review`}
                </div>
                {linked.length > 0 && <div className="text-xs text-muted-foreground">Auto-linked: {linked.join(", ")}</div>}
              </div>
            </div>

            {draft.photo_url && <img src={draft.photo_url} alt="Scanned panel" className="h-36 rounded border object-contain" />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Device ID / Address *</Label><Input className={fieldClass("device_id")} value={draft.device_id ?? ""} onChange={(e) => upd("device_id", e.target.value)} /></div>
              <div className="space-y-1"><Label>Panel</Label><Input className={fieldClass("panel")} value={draft.panel ?? ""} onChange={(e) => upd("panel", e.target.value)} /></div>
              <div className="space-y-1"><Label>Loop</Label><Input className={fieldClass("loop")} value={draft.loop ?? ""} onChange={(e) => upd("loop", e.target.value)} /></div>
              <div className="space-y-1"><Label>Device Number</Label><Input className={fieldClass("device_number")} value={draft.device_number ?? ""} onChange={(e) => upd("device_number", e.target.value)} /></div>
              <div className="space-y-1"><Label>Zone</Label><Input className={fieldClass("zone")} value={draft.zone ?? ""} onChange={(e) => upd("zone", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Tower / Building *</Label>
                <Select value={draft.parcel} onValueChange={(v) => upd("parcel", v)}>
                  <SelectTrigger className={fieldClass("parcel")}><SelectValue placeholder="Tower" /></SelectTrigger>
                  <SelectContent>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Floor</Label><Input className={fieldClass("floor")} value={draft.floor ?? ""} onChange={(e) => upd("floor", e.target.value)} /></div>
              <div className="space-y-1"><Label>Location</Label><Input className={fieldClass("location")} value={draft.location ?? ""} onChange={(e) => upd("location", e.target.value)} /></div>
              <div className={cn("space-y-1 rounded-md", warn("device_type") && "ring-1 ring-destructive/40")}>
                <Label>Device Type *</Label>
                <SearchableSelect value={draft.device_type ?? ""} onChange={(v) => upd("device_type", v)}
                  options={DEVICE_TYPES as unknown as string[]} placeholder="Select device type…" searchPlaceholder="Search device type…" />
              </div>
              <div className={cn("space-y-1 rounded-md", warn("event_type") && "ring-1 ring-destructive/40")}>
                <Label>Event Type</Label>
                <SearchableSelect value={draft.event_type ?? ""} onChange={(v) => upd("event_type", v)}
                  options={EVENT_TYPES as unknown as string[]} placeholder="Select event type…" searchPlaceholder="Search event type…" />
              </div>
              <div className="space-y-1 md:col-span-2"><Label>Alarm / Fault Reason</Label><Input className={fieldClass("fault_name")} value={draft.fault_name ?? ""} onChange={(e) => upd("fault_name", e.target.value)} /></div>
              <div className="space-y-1 md:col-span-2"><Label>Event Details</Label><Textarea rows={2} value={draft.description ?? ""} onChange={(e) => upd("description", e.target.value)} /></div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === "review" && <Button variant="outline" onClick={reset} disabled={busy}>Rescan</Button>}
          {step === "review" && <Button onClick={() => save()} disabled={busy}>Confirm &amp; save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
