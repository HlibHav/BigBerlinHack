# Architecture — hypotheses (unconfirmed)

> Припущення які ще не пройшли реальну перевірку. Не спирайся сліпо.

## Vercel cold start

- **2026-04-24:** *Vercel serverless cold start <500ms для Inngest step endpoint що ok для hackathon demo flow.* Припускаємо що warm Inngest endpoint (опитується health-check'ами) залишиться hot протягом demo window. Threshold для promote: 10 successful demo runs поспіль без >1s latency на step. Threshold для demote: одна demo failure через cold start → додати Vercel Pro або warming ping.

## Supabase free tier

- **2026-04-24:** *Supabase free tier (500MB DB, 2GB bandwidth) вистачить на hackathon + 2 тижні post-demo.* Guess-estimate базується на ~10k rows total (snapshots + signals + citations) × avg 2KB per row + assets у Storage <500MB. Threshold для revisit: коли DB usage >70% або пікова latency з free tier Postgres pool exhaustion.

## pgvector IVFFlat vs HNSW

- **2026-04-24:** *IVFFlat достатній для snapshot dedup при <5k rows per brand.* HNSW дорожчий у setup, сенс тільки при >10k. Поки IVFFlat. Threshold: коли KNN запит >100ms стабільно → migrate to HNSW.

## Inngest free tier

- **2026-04-24:** *Inngest free tier (50k step executions/month) покриває hackathon + 3+ брендів до paid tier.* Оцінка: 1 morning-brief run = ~6 steps, 1 competitor-radar run = ~10 steps, 4 runs/day per brand = ~16k/month/brand. Threshold: реальна usage за 7 днів > оцінки вдвічі → звірити обрахунок і план upgrade.

## RLS performance

- **2026-04-24:** *RLS policy з `get_user_org_id()` не додає >5ms до typical select.* Postgres plan'ер має inline'ити function. Threshold: якщо query plan показує "PolicyQual" як значну частину cost — переглянути policy на CURRENT_SETTING або raw SQL.

## Telli webhook reliability `[DEFERRED — W6 voice cut by hackathon scope, hypothesis re-applies post-reactivation]`

- **2026-04-24:** *Telli delivers webhook callback within 30s після call completion з <5% loss.* Базується на typical voice-agent провайдерів. Threshold для promote: 50 successful delivery без delay. Threshold для demote: 2+ missed callback за тиждень → додати polling fallback `GET /api/telli-status/{call_id}`.

## Cost envelope per brand

- **2026-04-24:** *$3-10/month per brand це realistic upper bound* (Vercel share + Supabase share + Inngest share + Peec per-brand quota + LLM usage). Поки guess — звірити з `cost_ledger` після 7 днів реального run.
