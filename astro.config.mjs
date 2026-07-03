// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Live deploy is the Cloudflare Worker; override with SITE_URL for a custom domain.
const SITE_URL = process.env.SITE_URL || 'https://india-tenders.nandanhegde1096.workers.dev';

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  output: 'static',
  build: { format: 'directory' },
});
