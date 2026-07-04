// Ground-truth check: re-fetch the live CPPP listing NOW, parse it with our own
// parser, and diff every overlapping tender (matched by id) field-by-field
// against what we stored. Reports match rate + any mismatches. Run: tsx scripts/verify-live.ts
import { readFileSync } from 'node:fs';
import { parsePage, type Tender } from './parse.ts';

const BASE = 'https://eprocure.gov.in/cppp/latestactivetendersnew/cpppdata';
const UA = 'india-tenders-indexer (open-data project; github.com/Nandanhegde1/india-tenders)';
const PAGES = Number(process.env.PAGES ?? 40);

const stored: Tender[] = JSON.parse(readFileSync(new URL('../src/data/tenders.json', import.meta.url), 'utf8')).tenders;
const byId = new Map(stored.map((t) => [t.id, t]));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const live = new Map<string, Tender>();
for (let p = 1; p <= PAGES; p++) {
  try {
    const res = await fetch(p === 1 ? BASE : `${BASE}?page=${p}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.warn(`page ${p}: HTTP ${res.status}`); continue; }
    for (const t of parsePage(await res.text()).tenders) live.set(t.id, t);
  } catch (e) { console.warn(`page ${p} failed: ${(e as Error).message}`); }
  await sleep(1200);
}

let overlap = 0, exact = 0;
const mismatches: string[] = [];
for (const [id, s] of byId) {
  const l = live.get(id);
  if (!l) continue;
  overlap++;
  const diffs: string[] = [];
  if (s.title !== l.title) diffs.push(`title: stored="${s.title}" live="${l.title}"`);
  if (s.organisation !== l.organisation) diffs.push(`org: stored="${s.organisation}" live="${l.organisation}"`);
  if (s.closingAt !== l.closingAt) diffs.push(`closing: stored=${s.closingAt} live=${l.closingAt}`);
  if (s.publishedAt !== l.publishedAt) diffs.push(`published: stored=${s.publishedAt} live=${l.publishedAt}`);
  if (diffs.length === 0) exact++;
  else mismatches.push(`  [${id}]\n    ` + diffs.join('\n    '));
}

console.log(`live tenders fetched: ${live.size} across ${PAGES} pages`);
console.log(`stored records: ${stored.length}`);
console.log(`overlap (stored records still on the live list): ${overlap}`);
console.log(`EXACT field match: ${exact}/${overlap}` + (overlap ? ` = ${(exact / overlap * 100).toFixed(1)}%` : ''));
if (mismatches.length) {
  console.log(`\nMISMATCHES (${mismatches.length}):`);
  console.log(mismatches.slice(0, 20).join('\n'));
} else {
  console.log('\nNo field mismatches on any overlapping tender.');
}
