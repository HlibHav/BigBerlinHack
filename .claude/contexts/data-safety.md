# Data Safety + Dev Environment

> Lazy-loaded коли user prompt згадує: secret, key, .env, credential, leak, rotate, backup, environment, node, pnpm, supabase CLI

## Data Safety

- **Ніколи не логуй повний Supabase row** якщо там є user content. Masking — first 40 chars + `...`.
- **Ніколи не pipe'уй Telli call recording у логи.** `[DEFERRED — W6 voice cut]` Зберігай у Storage bucket з RLS коли W6 reactivated.
- **Cascade delete testing.** Додаючи foreign key — тести що DELETE на parent row чистить children.
- **Backup awareness.** Supabase робить daily backup, але не для free tier. Для hackathon — critical data (demo seed + `data/peec-snapshot.json`) у git.
- **Secret rotation.** Якщо key leaked у commit — `git-filter-repo` + rotate у Supabase/OpenAI/Anthropic/Tavily/Slack dashboards одразу. (Peec не має API key — MCP OAuth через browser; Telli/ElevenLabs `[DEFERRED]`.)

---

## Dev Environment Rules

- **Node 20 LTS** (Vercel default).
- **pnpm 9+** (швидший install для serverless deploy).
- **Supabase CLI 1.150+** для migrations.
- **Inngest CLI** для local dev: `pnpm dlx inngest-cli@latest dev`.
- **ENV files:** `.env.local` для dev, `.env.example` committed. Ніяких real secrets у git.
- **Vercel preview** на кожен PR — отримуємо URL для manual QA без local deploy.
