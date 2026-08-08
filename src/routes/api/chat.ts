import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_PROMPT =
  "You are the assistant inside a Fire Alarm Management Dashboard. Help operators with fire alarm panels (EST3, EST4, Notifier, Simplex, Siemens, Edwards, Honeywell), troubleshooting troubles/supervisory/alarm events, device types, loops, zones and reporting. Be concise and practical. Use markdown.";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["GEMINI_API_KEY"]?.trim();
        if (!key) {
          return new Response(
            "Gemini is not configured. Add a GEMINI_API_KEY environment variable and redeploy.",
            { status: 500 },
          );
        }

        const body = (await request.json()) as { messages?: ChatMessage[] };
        const messages = Array.isArray(body.messages) ? body.messages : null;
        if (!messages || messages.length === 0) {
          return new Response("messages are required", { status: 400 });
        }

        const model = process.env["GEMINI_MODEL"]?.trim() || "gemini-1.5-flash";
        const base =
          process.env["AI_BASE_URL"]?.trim().replace(/\/+$/, "") ||
          "https://generativelanguage.googleapis.com/v1beta/openai";

        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages.slice(-30).map((m) => ({
                role: m.role,
                content: String(m.content ?? "").slice(0, 8000),
              })),
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          console.error(`Gemini chat failed [${upstream.status}]: ${text}`);
          const message =
            upstream.status === 429
              ? "Gemini rate limit reached, please retry shortly."
              : upstream.status === 401 || upstream.status === 403
                ? "Gemini rejected the API key. Check GEMINI_API_KEY."
                : `Gemini request failed [${upstream.status}]: ${text}`;
          return new Response(message, { status: upstream.status || 500 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
