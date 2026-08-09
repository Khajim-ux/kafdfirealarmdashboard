/**
 * Free, fully offline OCR for fire alarm panel / device photos.
 * Runs entirely in the browser with Tesseract.js — no API keys, no paid AI.
 */
import { DEVICE_TYPES, EVENT_TYPES } from "@/lib/constants";
import { matchDeviceType, matchEventType, matchParcel } from "@/lib/device-match";

export type OcrFields = {
  panel: string | null;
  device_id: string | null;
  device_number: string | null;
  loop: string | null;
  zone: string | null;
  floor: string | null;
  location: string | null;
  device_type: string | null;
  event_type: string | null;
  fault_name: string | null;
  parcel: string | null;
};

export type OcrOutcome = {
  text: string;
  confidence: number; // 0..1
  fields: OcrFields;
};

const MAX_EDGE = 1600;

/** Resize, grayscale, contrast-stretch and sharpen the photo for better OCR. */
export async function preprocessImage(file: File): Promise<{ blob: Blob; preview: string }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("The image could not be opened. Try another photo."));
      i.src = bitmapUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Image processing is not supported by this browser.");
    ctx.drawImage(img, 0, 0, w, h);

    const src = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    let min = 255;
    let max = 0;
    for (let i = 0, p = 0; i < src.data.length; i += 4, p++) {
      const g = 0.299 * src.data[i]! + 0.587 * src.data[i + 1]! + 0.114 * src.data[i + 2]!;
      gray[p] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const span = Math.max(1, max - min);

    // Contrast stretch + unsharp mask (3x3 sharpen kernel).
    const out = ctx.createImageData(w, h);
    const at = (x: number, y: number) =>
      ((gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]! - min) / span) * 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = at(x, y);
        const sharp = 5 * c - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1);
        const v = Math.max(0, Math.min(255, sharp));
        const o = (y * w + x) * 4;
        out.data[o] = v;
        out.data[o + 1] = v;
        out.data[o + 2] = v;
        out.data[o + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Image processing failed. Try another photo.");
    return { blob, preview: canvas.toDataURL("image/jpeg", 0.85) };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/** Run Tesseract OCR in the browser and report 0..100 progress. */
export async function runOcr(
  image: Blob,
  onProgress: (percent: number) => void,
): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text") onProgress(Math.round((m.progress ?? 0) * 100));
      else if (typeof m.progress === "number") onProgress(Math.min(15, Math.round(m.progress * 15)));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    onProgress(100);
    return { text: (data.text ?? "").trim(), confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

function grab(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim().replace(/[.,;:]+$/, "");
      if (v) return v;
    }
  }
  return null;
}

/** Best-effort field detection from raw OCR text. Anything unknown stays null. */
export function extractFields(raw: string): OcrFields {
  const text = raw.replace(/[|]/g, " ").replace(/[ \t]+/g, " ");
  const line = (kw: string, val = "([A-Za-z0-9._/\\- ]{1,40})") =>
    new RegExp(`${kw}\\s*[:#=\\-]?\\s*${val}`, "i");

  const panel = grab(text, [line("panel\\s*(?:name|id|no\\.?|number)?"), line("cabinet"), line("fac?p")]);
  const loop = grab(text, [line("loop", "([A-Za-z0-9\\-]{1,8})"), line("l", "(\\d{1,3})")]);
  const zone = grab(text, [line("zone", "([A-Za-z0-9\\-]{1,10})"), line("zn", "([A-Za-z0-9\\-]{1,10})")]);
  const deviceNumber = grab(text, [
    line("(?:device|addr(?:ess)?|dev)\\s*(?:no\\.?|number|addr(?:ess)?)?", "([A-Za-z0-9\\-]{1,12})"),
    line("point", "([A-Za-z0-9\\-]{1,12})"),
  ]);
  const deviceId = grab(text, [line("device\\s*id", "([A-Za-z0-9._\\-/]{2,30})"), line("tag", "([A-Za-z0-9._\\-/]{2,30})")]);
  const floor = grab(text, [
    line("floor", "([A-Za-z0-9\\-\\. ]{1,20})"),
    line("(?:level|lvl)", "([A-Za-z0-9\\-\\. ]{1,20})"),
  ]);
  const location = grab(text, [line("location"), line("area"), line("room"), line("description")]);

  const deviceTypeRaw =
    grab(text, [line("(?:device\\s*type|type)")]) ??
    DEVICE_TYPES.find((d) => text.toLowerCase().includes(d.toLowerCase())) ??
    null;
  const eventRaw =
    grab(text, [line("(?:event\\s*type|event|status)")]) ??
    EVENT_TYPES.find((e) => text.toLowerCase().includes(e.toLowerCase().replace(" / ", "/"))) ??
    (/\bfire\b|\balarm\b/i.test(text)
      ? "Fire / Alarm"
      : /superv/i.test(text)
        ? "Supervisory"
        : /troub/i.test(text)
          ? "Trouble"
          : /fault/i.test(text)
            ? "Fault"
            : null);

  const fault =
    grab(text, [line("(?:fault|reason|message|trouble)", "([A-Za-z0-9 ,._/\\-]{2,60})")]) ??
    (text.split(/\n/).find((l) => /fault|trouble|alarm|fail|open|short|dirty/i.test(l))?.trim() || null);

  return {
    panel,
    device_id: deviceId ?? (panel && deviceNumber ? `${panel}-${deviceNumber}` : deviceNumber),
    device_number: deviceNumber,
    loop,
    zone,
    floor,
    location,
    device_type: matchDeviceType(deviceTypeRaw) ?? null,
    event_type: matchEventType(eventRaw) ?? null,
    fault_name: fault,
    parcel: matchParcel(location, panel, floor, text),
  };
}

export async function scanPhoto(
  file: File,
  onProgress: (percent: number) => void,
): Promise<OcrOutcome & { preview: string; processed: Blob }> {
  const { blob, preview } = await preprocessImage(file);
  const { text, confidence } = await runOcr(blob, onProgress);
  if (!text || text.replace(/\W/g, "").length < 3) {
    throw new Error(
      "No readable text was found. The photo may be blurry or too dark — hold steady, get closer to the screen and try again.",
    );
  }
  return { text, confidence, fields: extractFields(text), preview, processed: blob };
}
