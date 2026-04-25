# Frontend Fix Rules

> Lazy-loaded коли user prompt згадує: frontend, UI, component, shadcn, page, tsx, css, tailwind, dashboard, widget, mobile

- **shadcn/ui over custom.** Якщо компонент вже є в shadcn — installуй через CLI, не пиши з нуля.
- **Tailwind utility first.** Custom CSS тільки для animations і складних gradient'ів.
- **Server Components default.** `"use client"` — тільки коли потрібен hook або event handler.
- **Suspense boundaries** навколо data fetching — UI не блокується поки Supabase query loading.
- **Widget (`/widget/{id}`) standalone** — без global layout, без nav, iframe-friendly.
- **Dashboard (`/demo/{id}`) — mobile-first** — журі клікає з телефону.
