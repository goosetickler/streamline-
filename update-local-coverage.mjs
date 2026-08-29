import fs from 'node:fs/promises';

const FEED = new URL('../local-coverage-2026.json', import.meta.url);
const SPORTS_MAPS = process.env.COVERAGE_SOURCE_URL || 'https://thesportsmaps.com/nfl/';

const clean = s => String(s ?? '').trim();
const upperGame = s => clean(s).toUpperCase().replace(/\s+/g, '');

function walk(value, out = []) {
  if (Array.isArray(value)) value.forEach(v => walk(v, out));
  else if (value && typeof value === 'object') {
    const keys = Object.keys(value).map(k => k.toLowerCase());
    const hasGame = keys.some(k => /game|matchup/.test(k));
    const hasPlace = keys.some(k => /market|city|county|zip/.test(k));
    const hasNetwork = keys.some(k => /network|channel/.test(k));
    if (hasGame && hasPlace && hasNetwork) out.push(value);
    Object.values(value).forEach(v => walk(v, out));
  }
  return out;
}

function extractJsonBlobs(html) {
  const blobs = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { blobs.push(JSON.parse(m[1])); } catch {}
  }
  for (const m of html.matchAll(/(?:window\.[A-Za-z0-9_$]+|const\s+[A-Za-z0-9_$]+)\s*=\s*(\{[\s\S]{50,}?\});/g)) {
    try { blobs.push(JSON.parse(m[1])); } catch {}
  }
  return blobs;
}

function normalizeRecord(r) {
  const get = (...names) => {
    for (const n of names) if (r[n] != null) return r[n];
    const lower = Object.fromEntries(Object.entries(r).map(([k,v]) => [k.toLowerCase(), v]));
    for (const n of names) if (lower[n.toLowerCase()] != null) return lower[n.toLowerCase()];
    return '';
  };
  const market = clean(get('market','dma','city'));
  const network = clean(get('network','channel')).toUpperCase();
  const game = upperGame(get('game','matchup'));
  const station = clean(get('station','callsign','affiliate'));
  const week = clean(get('week','weekNumber'));
  const slot = clean(get('slot','window')).toUpperCase();
  if (!market || !/^CBS|FOX$/.test(network) || !game || !week) return null;
  const normalizedSlot = slot.includes('LATE') ? `${network}:LATE` : slot.includes('EARLY') ? `${network}:EARLY` : '';
  if (!normalizedSlot) return null;
  return { market, network, game, station, week, slot: normalizedSlot };
}

async function main() {
  const current = JSON.parse(await fs.readFile(FEED, 'utf8'));
  const res = await fetch(SPORTS_MAPS, { headers: { 'user-agent': 'StreamlineCoverageUpdater/1.0' } });
  if (!res.ok) throw new Error(`coverage source ${res.status}`);
  const html = await res.text();
  const candidates = extractJsonBlobs(html).flatMap(blob => walk(blob)).map(normalizeRecord).filter(Boolean);

  // Fail-safe: never erase confirmed assignments when the upstream page exposes no
  // machine-readable coverage payload. This keeps the app correct rather than guessing.
  if (!candidates.length) {
    current.checkedAt = new Date().toISOString();
    current.automation = 'checked; no machine-readable assignments found; existing confirmed data preserved';
    await fs.writeFile(FEED, JSON.stringify(current, null, 2) + '\n');
    return;
  }

  const weeks = structuredClone(current.weeks || {});
  for (const c of candidates) {
    weeks[c.week] ||= { markets: {} };
    weeks[c.week].markets ||= {};
    weeks[c.week].markets[c.market] ||= {};
    weeks[c.week].markets[c.market][c.slot] = {
      game: c.game,
      station: c.station,
      source: SPORTS_MAPS
    };
  }
  const next = {
    ...current,
    updatedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    source: SPORTS_MAPS,
    automation: `imported ${candidates.length} structured assignments`,
    weeks
  };
  await fs.writeFile(FEED, JSON.stringify(next, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
