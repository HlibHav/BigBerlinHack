# Knowledge Architecture + Decision Journal

> Lazy-loaded коли user prompt згадує: knowledge, hypothesis, decision, ADR, fact, learn, promote, demote, supersede, conflict, history

## Block A — Knowledge Architecture

Перед тим як братись за будь-яку нетривіальну задачу:

1. **Прочитай `knowledge/INDEX.md`.** Router по доменах.
2. **Зайди в релевантний `knowledge/{domain}/`.** Кожен домен має три файли:
   - `knowledge.md` — усталені факти.
   - `hypotheses.md` — непідтверджені припущення. З обережністю. Підтверджена 3 рази → промоут в rules/knowledge.
   - `rules.md` — підтверджені правила поведінки. Слідуй.
3. **Якщо навчився новому** — запиши. Новий факт → `knowledge.md`. Нове припущення → `hypotheses.md`. Нове правило яке Glib підтвердив → `rules.md`.

**Промоція/демоція:**

- Гіпотеза → правило/факт: ≥3 незалежних підтверджень АБО явне "так, завжди роби так" від Glib.
- Правило → гіпотеза: з'явився кейс що суперечить — понизь + додай контр-приклад. Не видаляй мовчки.
- Факт → застарілий: поточний код/конфіг суперечить — онови + `(was: ...)` примітка.

**Як писати у `knowledge/`:**

- Атомарні записи — одне твердження на блок, з timestamp (`2026-04-24`) і джерелом.
- Не дублюй те що виводиться з коду. Пиши непрямі зв'язки, compromise rationale, нюанси external API.

**Новий домен:** створи `knowledge/{new-domain}/` (три файли), додай рядок у `knowledge/INDEX.md`.

---

## Block B — Decision Journal

Всі нетривіальні архітектурні/продуктові рішення у `decisions/`.

**Перед пропонуванням рішення:**

1. `grep -lr "{topic}" decisions/` — чи не було.
2. Якщо було — слідуй або супересідь явно (новий файл з `supersedes: {old-file}`).

**Коли записувати:**

- Будь-який вибір що впливає на 2+ місця або має конкуруючі варіанти.
- Після `AskUserQuestion` що закрила розвилку.
- Коли відмовляєшся від "очевидного" — запиши чому.

**Формат файлу:** `decisions/YYYY-MM-DD-{topic-kebab}.md` (template — у будь-якому існуючому ADR).

---

## Gate E — Docs edit

- [ ] Grep ключові фрази — немає суперечностей між цим файлом і зміненим.
- [ ] Cross-references оновлені (зворотні лінки).
- [ ] Якщо ADR superseded — status оновлений + `superseded_by` додано + `decisions/README.md` синхронізований.
