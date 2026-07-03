import type { APIRoute } from 'astro';
import { openTenders } from '../../lib/data.ts';

const esc = (v: string | null | boolean) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const GET: APIRoute = () => {
  const header = 'tender_id,title,organisation,category,published_at,closing_at,opening_at,ref_no,has_corrigendum,source_url';
  const rows = openTenders.map((t) =>
    [t.id, t.title, t.organisation, t.category, t.publishedAt, t.closingAt, t.openingAt, t.refNo, t.hasCorrigendum, t.sourceUrl].map(esc).join(','),
  );
  return new Response([header, ...rows].join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
