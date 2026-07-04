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

// Order matters — first match wins. Rules read the tender title, which on CPPP
// is sometimes only a reference code (e.g. "69/EE(E)/LKO/2026-27") with no
// describable words; those legitimately stay 'other'. Patterns below are kept
// high-precision (observed in real CPPP titles) to avoid mislabelling.
const CATEGORY_RULES: [TenderCategory, RegExp][] = [
  ['it-software', /\b(software|it system|website|portal|app(lication)? development|cloud|server|network(ing)?|data\s?cent(re|er)?|erp|api|digiti[sz]ation|computer)\b/],
  ['medical', /\b(medical|hospital|medicine|drug|pharma|surgical|diagnostic|ambulance|health)\b/],
  // EE(E)/AE(E)/EE(Elect) are Executive/Assistant Engineer (Electrical) codes; genset/SITC-of-power are electrical works.
  // Not wrapped in \b(...)\b: the EE(E) branch ends in ')', where a trailing \b can't match.
  ['electrical', /\belectrical\b|\btransformer\b|\bsubstation\b|\bcable\b|\bwiring\b|\bled\b|\blighting\b|\bsolar\b|power\s?supply|power\s?socket|\bgen[\s-]?set\b|\b[ae]e\s*\(\s*e(?:lect)?\.?\s*\)|\bd\.?g\.?\s?set\b/],
  // Roadworks/drainage/building vocabulary common in CPWD/MCD/MES titles.
  ['construction', /\b(construction|civil\s?work|repair|renovation|refurbish|building|road|bridge|erection|barricad|painting|flooring|boundary\s?wall|lane|drain(age|s)?|widening|carriageway|culvert|footpath|\brmc\b|quarter|\bshed\b|\bramp\b|finishing|girder|plinth|masonry|maintenance of)\b/],
  // Earthmoving/tipper/loader repair & hiring shows up as vehicle work.
  ['transport', /\b(vehicle|transport|logistics|hiring of (bus|car|taxi|truck)|freight|payloader|pay\s?loader|\bhy[vw]a\b|tipper|\bjcb\b|excavator|dozer|earth[\s-]?moving)\b/],
  ['security-manpower', /\b(security service|manpower|housekeeping|outsourc|guard|deployment of)\b/],
  ['consultancy', /\b(consultanc|consultant|advisor|audit|survey|feasibility|\bdpr\b|soil investigation|selection of)\b/],
  ['goods-supply', /\b(supply|procurement|purchase|provision of)\b/],
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
 * The CPPP detail URL encodes the tender's real fields as `A13h1`-delimited
 * base64 segments; the LAST segment is the canonical tender id (and it survives
 * even when the visible cell text is malformed). Government ref numbers contain
 * slashes (e.g. "AE(E)/SCPED-II/2026-27"), so splitting the cell on `/` to find
 * the id is unreliable — decode it from the URL instead.
 */
export function tenderIdFromUrl(url: string): string | null {
  const segs = url.split('A13h1').slice(1);
  if (segs.length === 0) return null;
  try {
    const id = Buffer.from(segs[segs.length - 1], 'base64').toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Parse one CPPP "latest active tenders" page into Tender records.
 * Row shape (7 cells): Sl.No | e-Published | Closing | Opening |
 *   <a href=DETAIL>TITLE</a>/REF/ID | Organisation | Corrigendum
 * id comes from the URL (robust); refNo is the cell text between the link and
 * the trailing /id (may contain slashes). Unparseable rows are skipped + counted.
 */
export function parsePage(html: string): { tenders: Tender[]; skipped: number } {
  const tenders: Tender[] = [];
  let skipped = 0;
  const rows = html.split(/<tr[^>]*>/).slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].trim());
    if (cells.length < 7) continue; // header/footer fragments
    const link = cells[4].match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([^<]*)/);
    const publishedAt = parseIstDate(stripTags(cells[1]));
    const closingAt = parseIstDate(stripTags(cells[2]));
    if (!link || !publishedAt || !closingAt) { skipped++; continue; }
    const [, sourceUrl, rawTitle, rest] = link;
    const id = tenderIdFromUrl(sourceUrl);
    const title = decodeEntities(stripTags(rawTitle)).replace(/\s+/g, ' ').trim();
    const organisation = decodeEntities(stripTags(cells[5])).replace(/\s+/g, ' ').trim();
    if (!id || !title || !organisation) { skipped++; continue; }
    // rest is "/REF/VISIBLE_ID"; ref = strip leading slash + drop the trailing /segment.
    const refNo = decodeEntities(rest.trim().replace(/^\//, '').replace(/\/[^/]*$/, '')).trim();
    tenders.push({
      id,
      slug: slugify(id),
      title,
      refNo,
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
