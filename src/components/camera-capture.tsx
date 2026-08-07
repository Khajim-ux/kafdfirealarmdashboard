import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, ImageUp, RefreshCw, SwitchCamera } from "lucide-react";

type Status = "probing" | "ready" | "unsupported";

function permissionMessage(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "SecurityError")
      return "Camera permission was denied. Allow camera access in your browser settings (tap the lock icon in the address bar), then press Retry — or use Upload from Gallery.";
    if (e.name === "NotFoundError" || e.name === "OverconstrainedError")
      return "No camera was found on this device. Use Take Photo (device camera) or Upload from Gallery.";
    if (e.name === "NotReadableError")
      return "The camera is already in use by another app. Close it and press Retry.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "The camera needs a secure (https) connection. Use Take Photo or Upload from Gallery instead.";
  return "Camera unavailable on this device — use Take Photo or Upload from Gallery.";
}

/**
 * Live camera preview with capture + gallery fallback, built on the native
 * MediaDevices API (React 19 compatible, no third-party camera library).
 */
export function CameraCapture({
  onPhoto,
  disabled,
}: {
  onPhoto: (file: File) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const nativeRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>("probing");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [multiCamera, setMultiCamera] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: "environment" | "user") => {
    setStatus("probing");
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError(permissionMessage(null));
      return;
    }
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMultiCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        setMultiCamera(false);
      }
    } catch (e) {
      stop();
      setStatus("unsupported");
      setError(permissionMessage(e));
    }
  }, [stop]);

  useEffect(() => {
    void start(facing);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  function capture() {
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth) throw new Error("empty");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { setError("Could not capture the photo — try Take Photo or Upload from Gallery."); return; }
          onPhoto(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92,
      );
    } catch {
      setError("Could not capture the photo — try Take Photo or Upload from Gallery.");
    }
  }

  const live = status === "ready";

  return (
    <div className="space-y-3">
      <div className={live ? "relative overflow-hidden rounded-lg border bg-muted aspect-[3/4] max-h-[46vh]" : "hidden"}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
          aria-label="Live camera preview"
        />
        {multiCamera && (
          <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2"
            aria-label="Switch camera"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
            <SwitchCamera className="h-4 w-4" />
          </Button>
        )}
      </div>

      {status === "probing" && <p className="text-sm text-muted-foreground">Requesting camera permission…</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button type="button" onClick={capture} disabled={disabled}>
            <CameraIcon className="h-4 w-4 mr-1" aria-hidden />Capture photo
          </Button>
        ) : (
          <>
            <Button type="button" disabled={disabled} onClick={() => nativeRef.current?.click()}>
              <CameraIcon className="h-4 w-4 mr-1" aria-hidden />Take photo
            </Button>
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => void start(facing)}>
              <RefreshCw className="h-4 w-4 mr-1" aria-hidden />Retry camera
            </Button>
          </>
        )}
        <Button type="button" variant="outline" disabled={disabled} onClick={() => galleryRef.current?.click()}>
          <ImageUp className="h-4 w-4 mr-1" aria-hidden />Upload from gallery
        </Button>
        <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}
