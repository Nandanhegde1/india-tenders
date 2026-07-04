// Parser rules locked against a saved copy of the REAL CPPP page
// (test/fixtures/cppp-page.html, fetched 2026-07-03). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePage, parseIstDate, inferCategory, isOpen, slugify } from './parse.ts';

const fixture = readFileSync(new URL('../test/fixtures/cppp-page.html', import.meta.url), 'utf8');

test('parses all 10 rows of the real fixture page, skipping none', () => {
  const { tenders, skipped } = parsePage(fixture);
  assert.equal(tenders.length, 10);
  assert.equal(skipped, 0);
});

test('first fixture row extracts every field correctly', () => {
  const t = parsePage(fixture).tenders[0];
  assert.equal(t.id, '2026_BPCL_25798');
  assert.equal(t.refNo, '1000459216');
  assert.equal(t.organisation, 'Bharat Petroleum Corporation Limited');
  assert.match(t.title, /^ERECTION OF 35 FEET GI SHEET BARRICADING/);
  assert.equal(t.publishedAt, '2026-07-03T23:11:00+05:30');
  assert.equal(t.closingAt, '2026-07-16T15:00:00+05:30');
  assert.ok(t.sourceUrl.startsWith('https://eprocure.gov.in/cppp/tendersfullview/'));
  assert.equal(t.hasCorrigendum, false);
  assert.equal(t.category, 'construction');
});

test('IST date parsing: AM/PM, noon and midnight edges', () => {
  assert.equal(parseIstDate('16-Jul-2026 03:00 PM'), '2026-07-16T15:00:00+05:30');
  assert.equal(parseIstDate('1-Jan-2026 12:00 AM'), '2026-01-01T00:00:00+05:30');
  assert.equal(parseIstDate('9-Dec-2026 12:30 PM'), '2026-12-09T12:30:00+05:30');
  assert.equal(parseIstDate('garbage'), null);
});

test('open/closed derives from closing date', () => {
  const now = new Date('2026-07-10T00:00:00+05:30');
  assert.ok(isOpen({ closingAt: '2026-07-16T15:00:00+05:30' }, now));
  assert.ok(!isOpen({ closingAt: '2026-07-09T15:00:00+05:30' }, now));
});

test('category inference: first matching rule wins, unknown -> other', () => {
  assert.equal(inferCategory('Supply of surgical gloves to district hospital'), 'medical');
  assert.equal(inferCategory('Construction of boundary wall at campus'), 'construction');
  assert.equal(inferCategory('Development of ERP software portal'), 'it-software');
  assert.equal(inferCategory('Annual procurement of stationery'), 'goods-supply');
  assert.equal(inferCategory('Something entirely unclassifiable'), 'other');
});

test('category inference: real CPPP title patterns (locks the audit fixes)', () => {
  // roadworks / drainage / building vocab -> construction
  assert.equal(inferCategory('Imp. Dev. Of lanes and Drains by Pdg. RMC from H.No.16'), 'construction');
  assert.equal(inferCategory('Widening of existing 2 lane to 4 lane divided carriageway'), 'construction');
  assert.equal(inferCategory('Internal and External finishing of Type VI staff quarter'), 'construction');
  // Executive/Assistant Engineer (Electrical) codes + genset -> electrical
  assert.equal(inferCategory('69/EE(E)/LKO/2026-27'), 'electrical');
  assert.equal(inferCategory('62(1)/AE(E)-I(Puducherry)/2026/227'), 'electrical');
  assert.equal(inferCategory('Sasthamangalam Genset work'), 'electrical');
  // earthmoving/loader repair -> transport
  assert.equal(inferCategory('Repairing of Pay Loader No JH10AG 0820 under E.J.Area'), 'transport');
  assert.equal(inferCategory('Repairing Hywa No-JH10AD-9706 under EJ Area'), 'transport');
  // data centre -> it-software
  assert.equal(inferCategory('EOI for Selection of Backend Partner for Data Centre Management'), 'it-software');
  // a bare reference code has no describable words -> honestly 'other'
  assert.equal(inferCategory('NIT No. 12-2'), 'other');
});

test('slugify produces stable url-safe ids', () => {
  assert.equal(slugify('2026_BPCL_25798'), '2026-bpcl-25798');
  assert.equal(slugify('Bharat Petroleum Corporation Limited'), 'bharat-petroleum-corporation-limited');
});
