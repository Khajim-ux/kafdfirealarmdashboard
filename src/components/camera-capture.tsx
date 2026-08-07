import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, ImageUp, RefreshCw, SwitchCamera } from "lucide-react";

const Camera = lazy(async () => {
  const m = await import("react-camera-pro");
  return { default: m.Camera as unknown as React.ComponentType<Record<string, unknown>> };
});

type CameraHandle = {
  takePhoto: (type?: "base64url" | "imgData") => string | ImageData;
  switchCamera: () => "user" | "environment";
};

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
 * Live camera preview with capture + gallery fallback.
 * Falls back to the device camera app / file upload automatically when the live
 * camera is unavailable (permission denied, no device, or insecure context —
 * common on Android Chrome).
 */
export function CameraCapture({
  onPhoto,
  disabled,
}: {
  onPhoto: (file: File) => void;
  disabled?: boolean;
}) {
  const camRef = useRef<CameraHandle | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const nativeRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>("probing");
  const [error, setError] = useState<string | null>(null);
  const [numCameras, setNumCameras] = useState(0);

  const probe = useCallback(async () => {
    setStatus("probing");
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError(permissionMessage(null));
      return;
    }
    try {
      // Requests permission up-front so the preview starts without a second prompt.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      stream.getTracks().forEach((t) => t.stop());
      setStatus("ready");
    } catch (e) {
      setStatus("unsupported");
      setError(permissionMessage(e));
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  function capture() {
    try {
      const dataUrl = camRef.current?.takePhoto("base64url");
      if (typeof dataUrl !== "string") throw new Error("empty");
      const [meta, b64] = dataUrl.split(",");
      const mime = meta?.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
      const bin = atob(b64 ?? "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      onPhoto(new File([bytes], `capture-${Date.now()}.jpg`, { type: mime }));
    } catch {
      setError("Could not capture the photo — try Take Photo or Upload from Gallery.");
    }
  }

  const live = status === "ready";

  return (
    <div className="space-y-3">
      {live && (
        <div className="relative overflow-hidden rounded-lg border bg-muted aspect-[3/4] max-h-[46vh]">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Starting camera…</div>}>
            <Camera
              ref={camRef as never}
              facingMode="environment"
              aspectRatio="cover"
              numberOfCamerasCallback={setNumCameras}
              errorMessages={{
                noCameraAccessible: "No camera device accessible.",
                permissionDenied: "Camera permission denied.",
                switchCamera: "Cannot switch camera.",
                canvas: "Canvas is not supported.",
              }}
            />
          </Suspense>
          {numCameras > 1 && (
            <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-2"
              aria-label="Switch camera" onClick={() => camRef.current?.switchCamera()}>
              <SwitchCamera className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

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
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => void probe()}>
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
