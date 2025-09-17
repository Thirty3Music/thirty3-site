// scripts/sync.js
// Node 20+. Körs i Actions. Bygger/uppdaterar data/auto-projects.json med SoundCloud-låtar.

const fs = require('fs/promises');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'data', 'auto-projects.json');
const SOUNDLOUD_USER = 'thirty_3';

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' };
const PLACEHOLDER = 'image00015.jpeg';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getHTML(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${url}`);
  return await r.text();
}

function absolutify(href, base) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Plocka ut track-länkar från en SoundCloud-sida utan cheerio */
function extractTrackLinks(html, base) {
  const out = new Set();
  // Hämta href="/thirty_3/slug" eller fulla https://soundcloud.com/thirty_3/slug
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!href) continue;
    if (!/soundcloud\.com|^\/[^/]/.test(href) && !href.startsWith('/')) continue;

    const abs = absolutify(href, base);
    if (!abs) continue;

    // Endast dina spår, inte likes, reposts, popular mm.
    if (!abs.includes(`soundcloud.com/${SOUNDLOUD_USER}/`)) continue;
    if (abs.includes('/likes') || abs.includes('/reposts') || abs.includes('/popular-tracks') || abs.includes('/sets/')) continue;

    out.add(abs);
  }
  return [...out];
}

async function listSoundCloudTrackUrls() {
  const base = `https://soundcloud.com/${SOUNDLOUD_USER}`;
  const pages = [`${base}/tracks`, base];
  const all = new Set();

  for (const p of pages) {
    try {
      const html = await getHTML(p);
      extractTrackLinks(html, p).forEach(u => all.add(u));
    } catch (e) {
      console.warn('Page scrape failed:', p, e.message);
    }
    await sleep(300);
  }
  return [...all];
}

async function getOEmbed(url) {
  try {
    const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, { headers: UA });
    if (!r.ok) throw new Error(`oEmbed ${r.status}`);
    return await r.json();
  } catch {
    return null;
  }
}

function niceTitle(o, url) {
  if (o?.title) return o.title.replace(/\s+-\s+SoundCloud$/i, '').trim();
  try {
    const slug = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    const human = slug.replace(/[-_]+/g, ' ').trim();
    return human.charAt(0).toUpperCase() + human.slice(1);
  } catch {
    return url;
  }
}

function dedupeByTitle(items) {
  const map = new Map();
  for (const it of items) {
    const k = `${(it.title || '').toLowerCase()}|${it.kind || ''}`;
    if (!map.has(k)) map.set(k, it);
  }
  return [...map.values()];
}

async function scrapeSoundCloud() {
  const urls = await listSoundCloudTrackUrls();
  const items = [];

  for (const link of urls) {
    const o = await getOEmbed(link);
    const title = niceTitle(o, link);
    const thumb = o?.thumbnail_url || PLACEHOLDER;

    items.push({
      title,
      kind: 'solo', // dina egna låtar (inkl remixer)
      thumb,
      media: {
        type: 'embed',
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}&visual=true`
      },
      desc: 'From SoundCloud.',
      links: [{ label: 'Listen (SoundCloud)', href: link }]
    });

    await sleep(250); // snällt mot oEmbed
  }

  return items;
}

async function main() {
  // 1) Nya SC-objekt
  const scItems = await scrapeSoundCloud();

  // 2) Läs ev. befintlig data
  let existing = [];
  try {
    const old = await fs.readFile(OUT_PATH, 'utf8');
    existing = JSON.parse(old);
  } catch {}

  // 3) Slå ihop & dedupe
  const merged = dedupeByTitle([...existing, ...scItems]);

  // 4) Skriv fil
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Wrote ${merged.length} items -> ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
