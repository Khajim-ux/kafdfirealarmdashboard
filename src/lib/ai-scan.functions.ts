import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ imageDataUrl: z.string().min(20) });

export type ScanResult = {
  panel_name?: string | null;
  panel_id?: string | null;
  loop?: string | null;
  device_address?: string | null;
  device_type?: string | null;
  floor?: string | null;
  location?: string | null;
  event_details?: string | null;
};

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
              "You read fire alarm control panel screens and device labels from photos. Extract the fields exactly as printed. Use null when a field is not visible. Reply with JSON only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  'Extract these fields from the photo and return strict JSON with keys: panel_name, panel_id, loop, device_address, device_type, floor, location, event_details. Keep values short (event_details may be one sentence).',
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
    try {
      return JSON.parse(content) as ScanResult;
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      return m ? (JSON.parse(m[0]) as ScanResult) : {};
    }
  });
