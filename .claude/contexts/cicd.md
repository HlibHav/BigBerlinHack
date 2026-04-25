# CI/CD

> Lazy-loaded коли user prompt згадує: CI, GitHub Actions, vercel deploy, pipeline build, preview, prod deploy

- **GitHub Actions** (або Vercel Git integration — що встановлене):
  - On push: typecheck, lint, test, build.
  - On PR: preview deploy to Vercel.
  - On merge main: production deploy.
- **Inngest events** автоматично deploy'аться разом з Vercel build (endpoint синхронізується).
- **Supabase migrations** — manual `supabase db push` перед merge на main. Додай у PR checklist.
