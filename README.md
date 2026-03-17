# 🛡️ ShieldTrack

ShieldTrack je SaaS aplikace pro e-shopy — sleduje zásilky u přepravců a ověřuje doručení pomocí multi-faktorového skóre (0-100).

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase (Auth + Postgres)
- Web scraping tracking stránek (Cheerio)

## Funkce MVP

- Multi-tenant model shopů (`st_shops`)
- Registrace a správa zásilek (`st_shipments`)
- Timeline tracking událostí (`st_tracking_events`)
- Verifikační výsledky (`st_verification_results`)
- API logování (`st_api_logs`)
- Auto-detekce přepravce podle tracking čísla
- Adaptery pro:
  - Českou poštu
  - Zásilkovnu
  - PPL
- Verifikační engine (tracking existence, aktivita, shoda města/PSČ, timeline, doručení)
- API v1 chráněné `X-Api-Key`
- Dashboard (landing, login, přehled, zásilky, detail, settings, API docs)
- Cron endpoint `/api/cron/track` + `vercel.json` každých 15 minut

## Struktura

```txt
sql/001_shieldtrack.sql
src/app/
  api/
  dashboard/
  login/
src/lib/
  carriers/
  verification.ts
```

## Lokální spuštění

1. Instalace:

```bash
npm install
```

2. Nastav `.env.local` (už je připravený pro dev):

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
```

3. Spusť DB migraci v Supabase SQL Editoru:

```sql
-- obsah sql/001_shieldtrack.sql
```

4. Dev server:

```bash
npm run dev
```

5. Build check:

```bash
npm run build
```

## API přehled

Všechny endpointy vyžadují `X-Api-Key`:

- `POST /api/v1/shipments`
- `GET /api/v1/shipments`
- `GET /api/v1/shipments/:id`
- `POST /api/v1/webhooks`
- `GET /api/v1/stats`

Cron:

- `GET /api/cron/track` (s `Authorization: Bearer <CRON_SECRET>`)

## Poznámky

- UI je kompletně česky.
- Tailwind je ve verzi 4.
- ESLint není použitý (záměrně).
- Projekt není pushnutý na GitHub.
