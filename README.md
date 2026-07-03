# IndiaTenders

[![CI](https://github.com/Nandanhegde1/india-tenders/actions/workflows/ci.yml/badge.svg)](https://github.com/Nandanhegde1/india-tenders/actions/workflows/ci.yml)

A free, searchable index of **open Indian government tenders** — deduplicated, categorised, sorted by closing date, refreshed every 6 hours.

- **Live site:** https://india-tenders.nandanhegde1096.workers.dev/
- **Data source:** [Central Public Procurement Portal (CPPP)](https://eprocure.gov.in/cppp/) — the Government of India's public listing of active e-procurement tenders
- **License:** MIT (code). Tender data belongs to its publishers; always verify and bid on the official portal.
- **Free downloads:** [/export/open.csv](https://india-tenders.nandanhegde1096.workers.dev/export/open.csv) · [/export/open.json](https://india-tenders.nandanhegde1096.workers.dev/export/open.json) · [RSS](https://india-tenders.nandanhegde1096.workers.dev/rss.xml)

## Why

Finding tenders you can still bid on means either refreshing slow portals or paying a tender-intelligence subscription (TenderTiger, BidAssist, …) thousands of rupees a year — for data that is public. This site indexes it for free: the **open/closed** state is derived from each tender's bid-closing timestamp, and the default view is *open tenders, closing soonest first*.

## How it works

1. `scripts/scrape.ts` fetches a bounded number of the newest CPPP list pages every 6 hours (identifying user-agent, ~1.5s pacing — the portal lists ~33k active tenders; we accumulate coverage across runs instead of hammering it).
2. `scripts/parse.ts` (pure, unit-tested against a saved copy of the real page) extracts title, organisation, ref/tender IDs, and IST timestamps, and infers a category from title keywords.
3. Runs merge into `src/data/tenders.json`, deduplicated by tender ID. Data-quality gates: a zero-parse run (markup change) fails red instead of publishing; a run that would shrink the dataset below 70% refuses to overwrite; unparseable rows are skipped and counted, never guessed.
4. The cron runs **test + build before committing**, so bad data blocks publish; deploy to Cloudflare Workers follows automatically (when the `CLOUDFLARE_API_TOKEN` secret is set).
5. Astro builds a static page per tender and organisation, plus CSV/JSON exports, RSS, and a sitemap.

## Coverage honesty

Covered: CPPP central active-tender listings (accumulating). **Not covered (yet):** GeM bids, state portals not mirrored to CPPP, tender values/EMD (the CPPP list page doesn't publish them). The [methodology page](https://india-tenders.nandanhegde1096.workers.dev/methodology/) is the authoritative statement.

## Local dev

```bash
git clone https://github.com/Nandanhegde1/india-tenders && cd india-tenders
npm install
npm test               # parser rules vs the saved real fixture
npm run scrape         # bounded live scrape → src/data/tenders.json
npm run dev            # http://localhost:4321
npm run build          # static site → dist/
```

## Deploy (Cloudflare Workers)

```bash
npm run deploy         # build + wrangler deploy (wrangler auth required)
```

## Disclaimer

IndiaTenders is an independent project, not affiliated with the Government of India, NIC, or CPPP. Data is provided as-is for discovery; read the official tender document before bidding.
