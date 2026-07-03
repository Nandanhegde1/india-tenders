import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Tender, TenderCategory } from '../../scripts/parse.ts';

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src', 'data', 'tenders.json'), 'utf8'),
) as { generatedAt: string; count: number; tenders: Tender[] };

export const generatedAt = manifest.generatedAt;
export const allTenders: Tender[] = manifest.tenders;

const now = Date.now();
export const openTenders = allTenders
  .filter((t) => new Date(t.closingAt).getTime() > now)
  .sort((a, b) => new Date(a.closingAt).getTime() - new Date(b.closingAt).getTime());

export const closedTenders = allTenders
  .filter((t) => new Date(t.closingAt).getTime() <= now)
  .sort((a, b) => new Date(b.closingAt).getTime() - new Date(a.closingAt).getTime());

export interface OrgSummary {
  slug: string;
  name: string;
  open: number;
  total: number;
}

export const organisations: OrgSummary[] = (() => {
  const map = new Map<string, OrgSummary>();
  for (const t of allTenders) {
    const o = map.get(t.orgSlug) ?? { slug: t.orgSlug, name: t.organisation, open: 0, total: 0 };
    o.total++;
    if (new Date(t.closingAt).getTime() > now) o.open++;
    map.set(t.orgSlug, o);
  }
  return [...map.values()].sort((a, b) => b.open - a.open || b.total - a.total);
})();

export const CATEGORY_LABELS: Record<TenderCategory, string> = {
  'construction': 'Construction & Works',
  'it-software': 'IT & Software',
  'medical': 'Medical & Health',
  'electrical': 'Electrical & Power',
  'goods-supply': 'Goods & Supply',
  'transport': 'Transport & Logistics',
  'security-manpower': 'Security & Manpower',
  'consultancy': 'Consultancy & Audit',
  'other': 'Other',
};

export function tenderBySlug(slug: string): Tender | undefined {
  return allTenders.find((t) => t.slug === slug);
}
