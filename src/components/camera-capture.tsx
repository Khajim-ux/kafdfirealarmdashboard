import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, ImageUp, SwitchCamera } from "lucide-react";

const Camera = lazy(async () => {
  const m = await import("react-camera-pro");
  return { default: m.Camera as unknown as React.ComponentType<Record<string, unknown>> };
});

type CameraHandle = {
  takePhoto: (type?: "base64url" | "imgData") => string | ImageData;
  switchCamera: () => "user" | "environment";
};

/**
 * Live camera preview with capture + gallery fallback.
 * Falls back to file upload automatically when the camera is unavailable
 * (permission denied, no device, or insecure context — common on Android Chrome).
 */
export function CameraCapture({
  onPhoto,
  disabled,
}: {
  onPhoto: (file: File) => void;
  disabled?: boolean;
}) {
  const camRef = useRef<CameraHandle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numCameras, setNumCameras] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) { setSupported(false); setError("This browser cannot open the camera."); }
        return;
      }
      try {
        // Requests permission up-front so the preview starts without a second prompt.
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelled) setSupported(true);
      } catch (e) {
        if (!cancelled) {
          setSupported(false);
          setError(
            e instanceof DOMException && e.name === "NotAllowedError"
              ? "Camera permission was denied — use gallery upload instead."
              : "Camera unavailable — use gallery upload instead.",
          );
        }
      }
    }
    void probe();
    return () => { cancelled = true; };
  }, []);

  function capture() {
    try {
      const dataUrl = camRef.current?.takePhoto("base64url");
      if (typeof dataUrl !== "string") return;
      const [meta, b64] = dataUrl.split(",");
      const mime = meta?.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
      const bin = atob(b64 ?? "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      onPhoto(new File([bytes], `capture-${Date.now()}.jpg`, { type: mime }));
    } catch {
      setError("Could not capture the photo — try gallery upload.");
    }
  }

  return (
    <div className="space-y-3">
      {supported && (
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

      {supported === null && <p className="text-sm text-muted-foreground">Requesting camera permission…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {supported && (
          <Button type="button" onClick={capture} disabled={disabled}>
            <CameraIcon className="h-4 w-4 mr-1" aria-hidden />Capture photo
          </Button>
        )}
        <Button type="button" variant="outline" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <ImageUp className="h-4 w-4 mr-1" aria-hidden />Upload from gallery
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}
