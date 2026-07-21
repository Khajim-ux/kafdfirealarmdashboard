import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PARCELS, ALARM_TYPES, STATUSES, DEVICE_TYPES, type Trouble } from "@/lib/constants";
import { generateQrDataUrl } from "@/lib/exports";
import { toast } from "sonner";
import { QrCode, Camera, ScanLine } from "lucide-react";
import { QrScannerDialog } from "./qr-scanner-dialog";
import { SearchableSelect } from "./searchable-select";
import { useAuth } from "@/hooks/use-auth";

type FormShape = Partial<Trouble>;

export function TroubleFormDialog({
  open, onOpenChange, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Trouble | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormShape>({});
  const [busy, setBusy] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? {
        device_id: "", parcel: PARCELS[0], alarm_type: "trouble", status: "open",
      });
      setQrPreview(null);
    }
  }, [open, initial]);

  useEffect(() => {
    const code = form.qr_code || form.device_id;
    if (code) generateQrDataUrl(code).then(setQrPreview).catch(() => {});
    else setQrPreview(null);
  }, [form.qr_code, form.device_id]);

  function upd<K extends keyof Trouble>(k: K, v: Trouble[K] | null) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handlePhoto(file: File) {
    setUploading(true);
    const path = `${user?.id ?? "anon"}/${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`;
    const { error } = await supabase.storage.from("trouble-photos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = await supabase.storage.from("trouble-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
    upd("photo_url", data?.signedUrl ?? path);
    setUploading(false);
    toast.success("Photo uploaded");
  }

  async function save() {
    if (!form.device_id?.trim() || !form.parcel || !form.device_type) {
      toast.error("Device ID, Parcel and Device/Event Type are required"); return;
    }
    setBusy(true);
    const payload = {
      device_id: form.device_id,
      panel: form.panel || null,
      location: form.location || null,
      parcel: form.parcel,
      floor: form.floor || null,
      device_type: form.device_type || null,
      alarm_type: form.alarm_type || "trouble",
      status: form.status || "open",
      description: form.description || null,
      technician: form.technician || null,
      tenant: form.tenant || null,
      photo_url: form.photo_url || null,
      qr_code: form.qr_code || form.device_id,
      event_at: form.event_at || new Date().toISOString(),
      closed_at: form.status === "closed" ? (form.closed_at || new Date().toISOString()) : null,
      updated_by: user?.id ?? null,
    };
    let error;
    if (initial?.id) {
      ({ error } = await supabase.from("troubles").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("troubles").insert({ ...payload, created_by: user?.id ?? null }));
    }
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(initial ? "Trouble updated" : "Trouble created"); onSaved(); onOpenChange(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initial ? "Edit Trouble" : "New Trouble"}</DialogTitle>
            <DialogDescription>All fields save permanently to the database.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Device ID *</Label>
              <div className="flex gap-2">
                <Input value={form.device_id ?? ""} onChange={(e) => upd("device_id", e.target.value)} />
                <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="Scan QR"><ScanLine className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1"><Label>Panel</Label><Input value={form.panel ?? ""} onChange={(e) => upd("panel", e.target.value)} /></div>
            <div className="space-y-1"><Label>Location</Label><Input value={form.location ?? ""} onChange={(e) => upd("location", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Parcel *</Label>
              <Select value={form.parcel} onValueChange={(v) => upd("parcel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PARCELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Floor</Label><Input value={form.floor ?? ""} onChange={(e) => upd("floor", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Device/Event Type *</Label>
              <SearchableSelect
                value={form.device_type ?? ""}
                onChange={(v) => upd("device_type", v)}
                options={DEVICE_TYPES as unknown as string[]}
                placeholder="Select device/event…"
                searchPlaceholder="Search device/event…"
              />
            </div>
            <div className="space-y-1">
              <Label>Alarm Type</Label>
              <Select value={form.alarm_type} onValueChange={(v) => upd("alarm_type", v as Trouble["alarm_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALARM_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => upd("status", v as Trouble["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Operator Name</Label><Input value={form.technician ?? ""} onChange={(e) => upd("technician", e.target.value)} /></div>
            <div className="space-y-1"><Label>Tenant</Label><Input value={form.tenant ?? ""} onChange={(e) => upd("tenant", e.target.value)} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => upd("description", e.target.value)} /></div>
            <div className="space-y-1 md:col-span-2">
              <Label className="flex items-center gap-2"><Camera className="h-4 w-4" /> Photo</Label>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
              {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
              {form.photo_url && <img src={form.photo_url} alt="" className="mt-2 h-32 rounded border" />}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="flex items-center gap-2"><QrCode className="h-4 w-4" /> QR Code (auto from Device ID)</Label>
              {qrPreview && <img src={qrPreview} alt="qr" className="h-32 w-32 border rounded bg-white p-2" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{initial ? "Save changes" : "Create trouble"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <QrScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onResult={(v) => upd("device_id", v)} />
    </>
  );
}
