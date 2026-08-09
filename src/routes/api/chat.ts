import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const SYSTEM_PROMPT =
  "You are the assistant inside a Fire Alarm Management Dashboard. Help operators with fire alarm panels (EST3, EST4, Notifier, Simplex, Siemens, Edwards, Honeywell), troubleshooting troubles/supervisory/alarm events, device types, loops, zones and reporting. Be concise and practical. Use markdown.";

const ALLOWED_ROLES = ["admin", "operator"];

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

        // Role gate: only Admin and Operator may use the assistant.
        const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Sign in to use the assistant.", { status: 401 });

        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          },
        );
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) {
          return new Response("Your session has expired. Sign in again.", { status: 401 });
        }
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id);
        const roles = (roleRows ?? []).map((r) => String(r.role));
        if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
          return new Response(
            "Your role has view-only access. Ask an admin for Operator or Admin access to use the AI assistant.",
            { status: 403 },
          );
        }

        const body = (await request.json()) as { messages?: ChatMessage[] };
        const messages = Array.isArray(body.messages) ? body.messages : null;
        if (!messages || messages.length === 0) {
          return new Response("messages are required", { status: 400 });
        }

        const model = process.env["GEMINI_MODEL"]?.trim() || "gemini-3.5-flash";
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
