import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function QrScannerDialog({
  open, onOpenChange, onResult,
}: { open: boolean; onOpenChange: (v: boolean) => void; onResult: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStarting(true);
    const id = "qr-region";
    if (ref.current) ref.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          onResult(text);
          scanner.stop().catch(() => {});
          onOpenChange(false);
        },
        () => {},
      )
      .then(() => setStarting(false))
      .catch((e) => { toast.error("Camera error: " + e); setStarting(false); });
    return () => {
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current?.clear();
    };
  }, [open, onOpenChange, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Scan QR Code</DialogTitle></DialogHeader>
        <div ref={ref} className="w-full aspect-square rounded overflow-hidden bg-black" />
        {starting && <p className="text-sm text-muted-foreground text-center">Starting camera…</p>}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
}
