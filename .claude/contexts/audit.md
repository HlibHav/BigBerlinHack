# Audit & Research Discipline

> Lazy-loaded коли user prompt згадує: research, decision, ADR, propose, рішення, knowledge, hypothesis, grep decisions, conflict

## Перед тим як "запропонувати рішення"

1. `grep -l "{topic}" decisions/` — чи не було вже.
2. Читай найближчі за темою ADR.
3. Читай `knowledge/{domain}/rules.md` — чи не суперечиш правилу.
4. Якщо суперечиш — або ADR superseding, або пояснюй чому цей випадок edge-case.

## Перед тим як "так Peec має X"

1. Перевір `knowledge/peec-integration/knowledge.md` — це знання підтверджене?
2. Якщо там hypothesis — запусти fetch через MCP і подивись реальну відповідь.
3. Після підтвердження — промоти hypothesis у knowledge.

## Перед тим як написати `supabase.from(...)`

1. Таблиця існує? `supabase/migrations/` перевір.
2. Types regenerated? `pnpm types:gen` потрібен?
3. RLS policy покриває цей query? Default deny — якщо сумніваєшся, читай policy.
