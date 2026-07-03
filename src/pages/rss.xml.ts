import type { APIRoute } from 'astro';
import { openTenders } from '../lib/data.ts';

const escXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = ({ site }) => {
  const newest = [...openTenders]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 50);
  const items = newest
    .map((t) => `
    <item>
      <title>${escXml(t.title)}</title>
      <link>${site}tenders/${t.slug}/</link>
      <guid isPermaLink="true">${site}tenders/${t.slug}/</guid>
      <pubDate>${new Date(t.publishedAt).toUTCString()}</pubDate>
      <description>${escXml(`${t.organisation} — closes ${new Date(t.closingAt).toUTCString()}`)}</description>
    </item>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IndiaTenders — newest open tenders</title>
    <link>${site}</link>
    <atom:link href="${site}rss.xml" rel="self" type="application/rss+xml"/>
    <description>Newly published Indian government tenders from the CPPP, refreshed every 6 hours.</description>${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
