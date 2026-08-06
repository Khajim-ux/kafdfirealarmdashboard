import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ imageDataUrl: z.string().min(20) });

export type ScanResult = {
  event_type?: string | null;
  panel_name?: string | null;
  panel_id?: string | null;
  panel_number?: string | null;
  loop?: string | null;
  device_number?: string | null;
  device_address?: string | null;
  device_type?: string | null;
  device_label?: string | null;
  zone?: string | null;
  floor?: string | null;
  building?: string | null;
  location?: string | null;
  reason?: string | null;
  event_datetime?: string | null;
  event_details?: string | null;
  panel_brand?: string | null;
  /** 0..1 per field key above */
  confidence?: Record<string, number> | null;
  overall_confidence?: number | null;
};

const FIELDS = [
  "event_type",
  "panel_name",
  "panel_id",
  "panel_number",
  "loop",
  "device_number",
  "device_address",
  "device_type",
  "device_label",
  "zone",
  "floor",
  "building",
  "location",
  "reason",
  "event_datetime",
  "event_details",
  "panel_brand",
];

export const scanPanelPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content:
              "You are an OCR + vision reader for fire alarm systems. You read control panel LCD screens, graphic workstations, printer strips and device labels from brands such as EST3, EST4, Notifier, Simplex, Siemens, Edwards and Honeywell. Extract fields exactly as printed, never guess. Use null when a field is not visible. Reply with JSON only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Read the photo and return strict JSON with keys: ${FIELDS.join(", ")}, plus "confidence" (an object mapping each of those keys to a number 0-1 for how certain you are of that value) and "overall_confidence" (0-1). event_type must be one of: Fire / Alarm, Trouble, Supervisory, Fault, Monitor, Warning, Disablement, Restore, Test, Maintenance, FM-200, CO2, Other. event_datetime should be ISO 8601 if a date/time is printed. panel_brand is the panel manufacturer if identifiable. Keep values short.`,
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached, please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`AI scan failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parse = (s: string): ScanResult => JSON.parse(s) as ScanResult;
    try {
      return parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      return m ? parse(m[0]) : {};
    }
  });
