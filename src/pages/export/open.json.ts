import type { APIRoute } from 'astro';
import { openTenders, generatedAt } from '../../lib/data.ts';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({ generatedAt, count: openTenders.length, tenders: openTenders }, null, 1),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
