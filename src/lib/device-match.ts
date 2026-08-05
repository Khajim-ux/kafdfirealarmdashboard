import { supabase } from "@/integrations/supabase/client";
import { DEVICE_TYPES, EVENT_TYPES, PARCELS } from "@/lib/constants";

/** Normalise a free-text value for comparison. */
function norm(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(v: string) {
  return norm(v).split(" ").filter((t) => t.length > 1);
}

/** Score 0..1 of how well `raw` matches `option`. */
function score(raw: string, option: string) {
  const a = norm(raw);
  const b = norm(option);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  const ta = tokens(raw);
  const tb = tokens(option);
  if (!ta.length || !tb.length) return 0;
  const hits = tb.filter((t) => ta.some((x) => x === t || x.startsWith(t) || t.startsWith(x))).length;
  return (hits / tb.length) * 0.8;
}

/** Best matching option from a list, or null when nothing is close enough. */
export function bestMatch(raw: string | null | undefined, options: readonly string[], min = 0.5) {
  if (!raw) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const o of options) {
    const s = score(raw, o);
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return bestScore >= min ? best : null;
}

export function matchDeviceType(raw: string | null | undefined) {
  return bestMatch(raw, DEVICE_TYPES as readonly string[]);
}

export function matchEventType(raw: string | null | undefined) {
  const direct = bestMatch(raw, EVENT_TYPES as readonly string[]);
  if (direct) return direct;
  const t = norm(raw ?? "");
  if (!t) return null;
  if (/fire|alarm/.test(t)) return "Fire / Alarm";
  if (/superv/.test(t)) return "Supervisory";
  if (/disab/.test(t)) return "Disablement";
  if (/restor|normal/.test(t)) return "Restore";
  if (/fault/.test(t)) return "Fault";
  if (/troub/.test(t)) return "Trouble";
  if (/monitor/.test(t)) return "Monitor";
  if (/warn/.test(t)) return "Warning";
  return null;
}

/** Pull a tower/parcel code such as "5.02" out of any scanned text. */
export function matchParcel(...raws: (string | null | undefined)[]) {
  for (const raw of raws) {
    if (!raw) continue;
    const m = raw.match(/\b(\d)\s*[.\-_/]\s*(\d{1,2})\b/);
    if (m) {
      const code = `${m[1]}.${m[2]!.padStart(2, "0")}`;
      if ((PARCELS as readonly string[]).includes(code)) return code;
    }
  }
  return null;
}

export type DeviceHistory = {
  device_id: string | null;
  panel: string | null;
  loop: string | null;
  zone: string | null;
  device_number: string | null;
  device_type: string | null;
  parcel: string | null;
  floor: string | null;
  location: string | null;
  tenant: string | null;
};

/**
 * Find the most recent existing record for the scanned panel / loop / device
 * address so previously-entered details can be reused instead of retyped.
 */
export async function findExistingDevice(input: {
  device_id?: string | null;
  panel?: string | null;
  loop?: string | null;
  device_number?: string | null;
}): Promise<DeviceHistory | null> {
  const cols = "device_id,panel,loop,zone,device_number,device_type,parcel,floor,location,tenant";

  const attempts: Array<() => ReturnType<typeof buildQuery>> = [];
  const buildQuery = () =>
    supabase.from("troubles").select(cols).order("event_at", { ascending: false }).limit(1);

  if (input.panel && input.loop && input.device_number) {
    attempts.push(() =>
      buildQuery().ilike("panel", input.panel!).ilike("loop", input.loop!).ilike("device_number", input.device_number!),
    );
  }
  if (input.device_id) {
    attempts.push(() => buildQuery().ilike("device_id", input.device_id!));
  }
  if (input.panel && input.device_number) {
    attempts.push(() => buildQuery().ilike("panel", input.panel!).ilike("device_number", input.device_number!));
  }
  if (input.panel) {
    attempts.push(() => buildQuery().ilike("panel", input.panel!));
  }

  for (const run of attempts) {
    const { data } = await run();
    const row = data?.[0];
    if (row) return row as DeviceHistory;
  }
  return null;
}
