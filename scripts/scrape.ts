/**
 * CPPP scraper: fetches the newest pages of the central "latest active tenders"
 * list and ACCUMULATES them into src/data/tenders.json (deduped by tender id).
 *
 * Politeness contract: the portal lists ~33k active tenders across ~3.3k pages;
 * we fetch only MAX_PAGES of the newest per run (default 40 → ~400 tenders),
 * one request every PACE_MS, with an identifying User-Agent. Coverage builds up
 * across 6-hourly runs instead of hammering the portal in one.
 *
 * Run: npm run scrape   (MAX_PAGES=80 npm run scrape to backfill faster)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage, isOpen, type Tender } from './parse.ts';

const OUT_PATH = fileURLToPath(new URL('../src/data/tenders.json', import.meta.url));
const BASE = 'https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata';
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 40);
const PACE_MS = Number(process.env.PACE_MS ?? 1500);
/** Closed tenders older than this are dropped from the dataset. */
const ARCHIVE_DAYS = 60;

const UA = 'india-tenders-indexer (open-data project; github.com/Nandanhegde1/india-tenders)';

interface Manifest {
  generatedAt: string;
  source: string;
  count: number;
  tenders: Tender[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page: number): Promise<string> {
  const url = page === 1 ? BASE : `${BASE}?page=${page}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(5000 * attempt);
    }
  }
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const existing: Map<string, Tender> = new Map();
  let previousCount = 0;
  if (existsSync(OUT_PATH)) {
    const prev = JSON.parse(readFileSync(OUT_PATH, 'utf8')) as Manifest;
    previousCount = prev.tenders.length;
    for (const t of prev.tenders) existing.set(t.id, t);
  }

  console.log(`Fetching up to ${MAX_PAGES} pages from CPPP…`);
  let fetched = 0;
  let skippedRows = 0;
  let emptyPages = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let html: string;
    try {
      html = await fetchPage(page);
    } catch (e) {
      console.warn(`  page ${page} failed after retries: ${(e as Error).message} — stopping pagination.`);
      break;
    }
    const { tenders, skipped } = parsePage(html);
    skippedRows += skipped;
    if (tenders.length === 0) {
      // Markup change or empty tail — two empty pages in a row ends the run.
      if (++emptyPages >= 2) break;
    } else {
      emptyPages = 0;
    }
    for (const t of tenders) existing.set(t.id, t); // newest scrape wins on dupes
    fetched += tenders.length;
    if (page % 10 === 0) console.log(`  …page ${page} (${fetched} rows so far)`);
    await sleep(PACE_MS);
  }
  console.log(`Fetched ${fetched} rows (${skippedRows} unparseable rows skipped).`);

  // Sanity gate 1: a run that parsed nothing means the markup changed — never
  // publish that. Fail red so the cron opens an issue.
  if (fetched === 0) {
    console.error('💥 Parsed 0 tenders — CPPP markup likely changed. Refusing to write.');
    process.exit(1);
  }

  // Archive policy: keep everything open + recently closed (context for /closed).
  const cutoff = Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const all = [...existing.values()].filter(
    (t) => isOpen(t) || new Date(t.closingAt).getTime() > cutoff,
  );
  all.sort((a, b) => new Date(a.closingAt).getTime() - new Date(b.closingAt).getTime());

  // Sanity gate 2: never let a partial run shrink the accumulated dataset badly.
  if (previousCount > 100 && all.length < previousCount * 0.7) {
    console.error(`💥 Sanity gate: ${all.length} tenders vs ${previousCount} previously (<70%). Refusing to overwrite.`);
    process.exit(1);
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    source: BASE,
    count: all.length,
    tenders: all,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 1), 'utf8');
  const open = all.filter((t) => isOpen(t)).length;
  console.log(`✅ Wrote ${all.length} tenders (${open} open) → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('💥 Scrape failed:', err);
  process.exit(1);
});
