import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { CameraCapture } from "@/components/camera-capture";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { scanPhoto } from "@/lib/ocr";
import { findExistingDevice } from "@/lib/device-match";
import { DEVICE_TYPES, EVENT_TYPES, PARCELS, type Trouble } from "@/lib/constants";
import { toast } from "sonner";
import { ScanText, AlertTriangle, CheckCircle2 } from "lucide-react";

const LOW_CONFIDENCE = 0.7;

type Draft = Partial<Trouble> & { photo_url?: string | null };

export function AiAutoScanDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<"capture" | "review">("capture");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [linked, setLinked] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>({});

  function clearAll() {
    setStep("capture"); setFile(null); setPreview(null); setRawText("");
    setConfidence(null); setLinked([]); setDraft({}); setProgress(0); setStatusText("");
  }

  function upd<K extends keyof Trouble>(k: K, v: Trouble[K] | null) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function pickPhoto(f: File) {
    setFile(f);
    setRawText(""); setConfidence(null); setLinked([]); setProgress(0);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  async function runScan() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setStatusText("Preparing the image…");
    try {
      const r = await scanPhoto(file, (p) => { setProgress(p); setStatusText(p < 100 ? "Reading text…" : "Finishing…"); });
      setRawText(r.text);
      setConfidence(r.confidence);

      setStatusText("Matching the device database…");
      const known = await findExistingDevice({
        device_id: r.fields.device_id,
        panel: r.fields.panel,
        loop: r.fields.loop,
        device_number: r.fields.device_number,
      }).catch(() => null);

      const marks: string[] = [];
      if (known) marks.push("existing device record");
      if (r.fields.device_type) marks.push("device type");
      if (r.fields.event_type) marks.push("event type");
      if (r.fields.parcel) marks.push("tower");
      setLinked(marks);

      const eventType = r.fields.event_type;
      setDraft({
        device_id: r.fields.device_id || known?.device_id || "",
        panel: r.fields.panel || known?.panel || null,
        loop: r.fields.loop || known?.loop || null,
        zone: r.fields.zone || known?.zone || null,
        device_number: r.fields.device_number || known?.device_number || null,
        device_type: r.fields.device_type || known?.device_type || null,
        event_type: eventType,
        parcel: r.fields.parcel || known?.parcel || PARCELS[0],
        floor: r.fields.floor || known?.floor || null,
        location: r.fields.location || known?.location || null,
        tenant: known?.tenant || null,
        fault_name: r.fields.fault_name,
        description: r.text.slice(0, 1000),
        event_at: new Date().toISOString(),
        alarm_type: eventType === "Fire / Alarm" ? "fire_alarm" : eventType === "Supervisory" ? "supervisory" : eventType === "Monitor" ? "monitor_alert" : "trouble",
        status: "open",
        active_status: "Active",
        priority: "Medium",
        photo_status: "Uploaded",
        remarks: "Offline OCR scan — Verification: Pending",
      } as Draft);
      setStep("review");

      if (r.confidence < LOW_CONFIDENCE) {
        toast.warning("OCR confidence is low. Please verify the information before saving.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OCR failed — try a sharper, closer photo.");
    } finally {
      setBusy(false);
      setStatusText("");
    }
  }

  async function save() {
    if (!draft.device_id?.trim() || !draft.parcel || !draft.device_type) {
      toast.error("Device ID, Tower and Device Type are required");
      return;
    }
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (file) {
        const path = `${user?.id ?? "anon"}/scan-${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`;
        const { error: upErr } = await supabase.storage.from("trouble-photos").upload(path, file, { upsert: true });
        if (upErr) {
          toast.error(`Photo upload failed: ${upErr.message}. The record will be saved without a photo.`);
        } else {
          const { data } = await supabase.storage.from("trouble-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
          photoUrl = data?.signedUrl ?? path;
        }
      }

      const { error } = await supabase.from("troubles").insert({
        device_id: draft.device_id,
        panel: draft.panel || null,
        location: draft.location || null,
        parcel: draft.parcel,
        floor: draft.floor || null,
        device_type: draft.device_type,
        alarm_type: draft.alarm_type || "trouble",
        status: draft.status || "open",
        description: draft.description || null,
        tenant: draft.tenant || null,
        technician: null,
        photo_url: photoUrl,
        qr_code: draft.device_id,
        event_at: draft.event_at || new Date().toISOString(),
        loop: draft.loop || null,
        zone: draft.zone || null,
        device_number: draft.device_number || null,
        event_type: draft.event_type || null,
        fault_name: draft.fault_name || null,
        priority: draft.priority || "Medium",
        active_status: draft.active_status || "Active",
        remarks: draft.remarks || null,
        photo_status: photoUrl ? "Uploaded" : "No Photo",
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Record saved");
      onSaved();
      onOpenChange(false);
      clearAll();
    } finally {
      setBusy(false);
    }
  }

  const lowConf = confidence !== null && confidence < LOW_CONFIDENCE;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) clearAll(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanText className="h-4 w-4 text-primary" /> Photo Scan (offline OCR)</DialogTitle>
          <DialogDescription>
            Photograph a panel LCD, workstation or device label. Text is read on your device — no internet AI service is used.
          </DialogDescription>
        </DialogHeader>

        {step === "capture" ? (
          <div className="space-y-3">
            <Label>Take a photo or choose one from the gallery</Label>
            <CameraCapture disabled={busy} onPhoto={pickPhoto} />
            {preview && <img src={preview} alt="Selected photo preview" className="max-h-56 w-full rounded border object-contain" />}
            {busy && (
              <div className="space-y-1">
                <Progress value={progress} aria-label="OCR progress" />
                <p className="text-sm text-muted-foreground">{statusText} {progress}%</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void runScan()} disabled={!file || busy} className="flex-1 min-w-[10rem]">
                <ScanText className="h-4 w-4 mr-1" aria-hidden />Scan photo
              </Button>
              <Button variant="outline" onClick={clearAll} disabled={busy}>Clear</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${lowConf ? "border-destructive/50" : "border-primary/40"}`}>
              {lowConf
                ? <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" aria-hidden />
                : <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" aria-hidden />}
              <div>
                <div className="font-medium">OCR confidence {confidence !== null ? `${Math.round(confidence * 100)}%` : "unknown"}</div>
                {lowConf && <div className="text-destructive">OCR confidence is low. Please verify the information before saving.</div>}
                {linked.length > 0 && <div className="text-xs text-muted-foreground">Auto-linked: {linked.join(", ")}</div>}
              </div>
            </div>

            {preview && <img src={preview} alt="Scanned photo" className="max-h-40 w-full rounded border object-contain" />}

            <div className="space-y-1">
              <Label>Extracted text (editable)</Label>
              <Textarea rows={6} value={rawText} onChange={(e) => setRawText(e.target.value)} className="font-mono text-xs" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Device ID *</Label><Input value={draft.device_id ?? ""} onChange={(e) => upd("device_id", e.target.value)} /></div>
              <div className="space-y-1"><Label>Panel ID</Label><Input value={draft.panel ?? ""} onChange={(e) => upd("panel", e.target.value)} /></div>
              <div className="space-y-1"><Label>Loop</Label><Input value={draft.loop ?? ""} onChange={(e) => upd("loop", e.target.value)} /></div>
              <div className="space-y-1"><Label>Device Number</Label><Input value={draft.device_number ?? ""} onChange={(e) => upd("device_number", e.target.value)} /></div>
              <div className="space-y-1"><Label>Zone</Label><Input value={draft.zone ?? ""} onChange={(e) => upd("zone", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Tower / Building *</Label>
                <Select value={draft.parcel} onValueChange={(v) => upd("parcel", v)}>
                  <SelectTrigger><SelectValue placeholder="Tower" /></SelectTrigger>
                  <SelectContent>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Floor</Label><Input value={draft.floor ?? ""} onChange={(e) => upd("floor", e.target.value)} /></div>
              <div className="space-y-1"><Label>Location</Label><Input value={draft.location ?? ""} onChange={(e) => upd("location", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Device Type *</Label>
                <SearchableSelect value={draft.device_type ?? ""} onChange={(v) => upd("device_type", v)}
                  options={DEVICE_TYPES as unknown as string[]} placeholder="Select device type…" searchPlaceholder="Search device type…" />
              </div>
              <div className="space-y-1">
                <Label>Event Type</Label>
                <SearchableSelect value={draft.event_type ?? ""} onChange={(v) => upd("event_type", v)}
                  options={EVENT_TYPES as unknown as string[]} placeholder="Select event type…" searchPlaceholder="Search event type…" />
              </div>
              <div className="space-y-1 md:col-span-2"><Label>Alarm / Fault message</Label><Input value={draft.fault_name ?? ""} onChange={(e) => upd("fault_name", e.target.value)} /></div>
              <div className="space-y-1 md:col-span-2"><Label>Event Details</Label><Textarea rows={2} value={draft.description ?? ""} onChange={(e) => upd("description", e.target.value)} /></div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === "review" && <Button variant="outline" onClick={() => { setStep("capture"); setProgress(0); }} disabled={busy}>Scan again</Button>}
          {step === "review" && <Button variant="outline" onClick={clearAll} disabled={busy}>Clear</Button>}
          {step === "review" && <Button onClick={() => void save()} disabled={busy}>Save record</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
