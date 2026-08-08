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

/**
 * Resolves the AI provider from environment variables so the scan works on
 * Lovable Cloud AND any external host (Vercel, Netlify, self-hosted).
 *
 * Set ONE of these in the host's environment variables:
 *   LOVABLE_API_KEY  – Lovable AI Gateway (auto-set inside Lovable, copy it to Vercel to reuse it)
 *   OPENAI_API_KEY   – OpenAI directly (optional AI_MODEL, default gpt-4o)
 *   GEMINI_API_KEY   – Google Gemini (optional AI_MODEL, default gemini-2.5-flash)
 * Optional for any provider: AI_BASE_URL (OpenAI-compatible base, no trailing /chat/completions)
 */
type Provider = {
  url: string;
  headers: Record<string, string>;
  model: string;
  extra: Record<string, unknown>;
};

function resolveProvider(): Provider | null {
  const env = process.env;
  const model = env["AI_MODEL"]?.trim();
  const baseOverride = env["AI_BASE_URL"]?.trim().replace(/\/+$/, "");

  const lovable = env["LOVABLE_API_KEY"]?.trim();
  if (lovable) {
    return {
      url: `${baseOverride || "https://ai.gateway.lovable.dev/v1"}/chat/completions`,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovable },
      model: model || "openai/gpt-5.6-sol",
      extra: { reasoning_effort: "none" },
    };
  }

  const openai = env["OPENAI_API_KEY"]?.trim();
  if (openai) {
    return {
      url: `${baseOverride || "https://api.openai.com/v1"}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      model: model || "gpt-4o",
      extra: {},
    };
  }

  const gemini = (env["GEMINI_API_KEY"] || env["GOOGLE_API_KEY"])?.trim();
  if (gemini) {
    return {
      url: `${baseOverride || "https://generativelanguage.googleapis.com/v1beta/openai"}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gemini}` },
      model: model || "gemini-2.5-flash",
      extra: {},
    };
  }

  return null;
}

export const scanPanelPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ScanResult> => {
    const provider = resolveProvider();
    if (!provider) {
      throw new Error(
        "AI is not configured on this deployment. Add an environment variable named LOVABLE_API_KEY (Lovable AI Gateway), OPENAI_API_KEY, or GEMINI_API_KEY to the hosting project, then redeploy.",
      );
    }

    const res = await fetch(provider.url, {
      method: "POST",
      headers: provider.headers,
      body: JSON.stringify({
        model: provider.model,
        ...provider.extra,

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
