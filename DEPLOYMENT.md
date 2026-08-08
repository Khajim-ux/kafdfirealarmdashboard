# Deployment & AI environment variables

The AI panel/device photo scan (OCR + vision) runs **server-side** in
`src/lib/ai-scan.functions.ts`. It needs an API key from the hosting
environment — nothing is preview-only, and no key is ever exposed to the browser.

## Required (choose ONE provider)

| Variable | Provider | Notes |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Lovable AI Gateway | Auto-provisioned inside Lovable. Copy the same value into any external host to keep identical behaviour. |
| `OPENAI_API_KEY` | OpenAI | Uses `gpt-4o` by default. |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Google Gemini | Uses `gemini-1.5-flash` by default (Gemini's OpenAI-compatible endpoint). |

Resolution order: `LOVABLE_API_KEY` → `OPENAI_API_KEY` → `GEMINI_API_KEY`/`GOOGLE_API_KEY`.
If none is set, the scan fails with a clear message telling you which variable to add.

## Optional

| Variable | Purpose |
| --- | --- |
| `AI_MODEL` | Override the model id for the selected provider. |
| `AI_BASE_URL` | Override the OpenAI-compatible base URL (no trailing `/chat/completions`). |

## Also required for the app itself (backend/auth/storage)

```
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

## Setting them

- **Lovable**: already managed — `LOVABLE_API_KEY` is provisioned automatically.
- **Vercel**: Project → Settings → Environment Variables → add the key for
  Production (and Preview), then **redeploy** (env changes do not apply to
  existing deployments).
- **Netlify / other hosts**: add the same variables in the site's environment
  settings and redeploy.

> Never prefix an AI key with `VITE_` — that would ship it to the browser.
