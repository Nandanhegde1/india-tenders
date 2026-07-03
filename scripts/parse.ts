/**
 * Pure parsing + derivation logic for CPPP tender rows — kept free of I/O so
 * every rule is unit-tested against a saved fixture of the real page
 * (test/fixtures/cppp-page.html). See parse.test.ts.
 */

export interface Tender {
  /** CPPP tender id, e.g. "2026_BPCL_25798" — the stable dedupe key */
  id: string;
  slug: string;
  title: string;
  refNo: string;
  organisation: string;
  orgSlug: string;
  category: TenderCategory;
  /** ISO-8601 with +05:30 offset */
  publishedAt: string;
  closingAt: string;
  openingAt: string | null;
  sourceUrl: string;
  hasCorrigendum: boolean;
}

export type TenderCategory =
  | 'construction' | 'it-software' | 'medical' | 'electrical'
  | 'goods-supply' | 'transport' | 'security-manpower' | 'consultancy' | 'other';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "16-Jul-2026 03:00 PM" (IST) → "2026-07-16T15:00:00+05:30"; null if unparseable. */
export function parseIstDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const [, d, mon, y, hh, mm, ap] = m;
  const month = MONTHS[mon.toLowerCase()];
  if (!month) return null;
  let hour = Number(hh) % 12;
  if (ap.toUpperCase() === 'PM') hour += 12;
  return `${y}-${month}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mm}:00+05:30`;
}

export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const CATEGORY_RULES: [TenderCategory, RegExp][] = [
  ['it-software', /\b(software|it system|website|portal|app(lication)? development|cloud|server|network(ing)?|data cent|erp|api|digiti[sz]ation|computer)\b/],
  ['medical', /\b(medical|hospital|medicine|drug|pharma|surgical|diagnostic|ambulance|health)\b/],
  ['electrical', /\b(electrical|transformer|substation|cable|wiring|led|lighting|solar|power supply)\b/],
  ['construction', /\b(construction|civil work|repair|renovation|building|road|bridge|erection|barricad|maintenance of|painting|flooring|boundary wall)\b/],
  ['transport', /\b(vehicle|transport|logistics|hiring of (bus|car|taxi|truck)|freight)\b/],
  ['security-manpower', /\b(security service|manpower|housekeeping|outsourc|guard)\b/],
  ['consultancy', /\b(consultanc|consultant|advisor|audit|survey|feasibility|dpr)\b/],
  ['goods-supply', /\b(supply|procurement|purchase)\b/],
];

/** Category from the tender title — first matching rule wins; tested. */
export function inferCategory(title: string): TenderCategory {
  const t = title.toLowerCase();
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return 'other';
}

export function isOpen(t: Pick<Tender, 'closingAt'>, now: Date = new Date()): boolean {
  return new Date(t.closingAt).getTime() > now.getTime();
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');

/**
 * Parse one CPPP "latest active tenders" page into Tender records.
 * Row shape (7 cells): Sl.No | e-Published | Closing | Opening |
 *   <a href=DETAIL>TITLE</a>/REF/ID | Organisation | Corrigendum
 * Unparseable rows are skipped and counted, never guessed at.
 */
export function parsePage(html: string): { tenders: Tender[]; skipped: number } {
  const tenders: Tender[] = [];
  let skipped = 0;
  const rows = html.split(/<tr[^>]*>/).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].trim());
    if (cells.length < 7) continue; // header/footer fragments
    const link = cells[4].match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*\/([^/<]+)\/([^<\s]+)/);
    const publishedAt = parseIstDate(stripTags(cells[1]));
    const closingAt = parseIstDate(stripTags(cells[2]));
    if (!link || !publishedAt || !closingAt) { skipped++; continue; }
    const [, sourceUrl, rawTitle, refNo, id] = link;
    const title = decodeEntities(stripTags(rawTitle)).replace(/\s+/g, ' ').trim();
    const organisation = decodeEntities(stripTags(cells[5])).replace(/\s+/g, ' ').trim();
    if (!title || !organisation || !id) { skipped++; continue; }
    tenders.push({
      id: id.trim(),
      slug: slugify(id),
      title,
      refNo: refNo.trim(),
      organisation,
      orgSlug: slugify(organisation),
      category: inferCategory(title),
      publishedAt,
      closingAt,
      openingAt: parseIstDate(stripTags(cells[3])),
      sourceUrl,
      hasCorrigendum: stripTags(cells[6]).trim() !== '--',
    });
  }
  return { tenders, skipped };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
