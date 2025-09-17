// scripts/sync.js
// Node CommonJS (works on GH Actions). Builds/updates data/auto-projects.json
// from SoundCloud (one card per track with artwork) and merges with existing data.

const fs = require('fs/promises');
const path = require('path');
const cheerio = require('cheerio');

const OUT_PATH = path.join(__dirname, '..', 'data', 'auto-projects.json');

// ---- SETTINGS (change only the handle if needed) ----
const SOUNDCLOUD_USER = 'thirty_3';
const SOUNDCLOUD_BASE = `https://soundcloud.com/${SOUNDCLOUD_USER}`;

// ---------- helpers ----------
function uniqByTitle(arr) {
  const seen = new Set();
  return arr.filter(it => {
    const k = (it.title || '').trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function abs(base, href) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function extractIframeSrcFromOEmbedHtml(html = '') {
  const m = html.match(/src="([^"]+)"/i);
  return m ? m[1] : null;
}

// ---------- SoundCloud scraping via RSS + oEmbed ----------
async function getHtml(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${url}`);
  return await r.text();
}

async function getSoundCloudRssUrl() {
  const html = await getHtml(SOUNDCLOUD_BASE);
  // Find <link type="application/rss+xml" ...> or feeds.soundcloud.com/users/soundcloud:users:ID/sounds.rss
  const $ = cheerio.load(html);
  let rss = $('link[type="application/rss+xml"]').attr('href') || '';
  if (!rss) {
    const m = html.match(/https:\/\/feeds\.soundcloud\.com\/users\/soundcloud:users:\d+\/sounds\.rss/);
    if (m) rss = m[0];
  }
  if (!rss) throw new Error('Could not locate SoundCloud RSS feed');
  return rss;
}

async function scrapeSoundCloud() {
  const rssUrl = await getSoundCloudRssUrl();
  const xml = await getHtml(rssUrl);
  const $ = cheerio.load(xml, { xmlMode: true });

  // gather track links newest -> oldest
  const links = [];
  $('item > link').each((_, el) => {
    const t = $(el).text().trim();
    if (t && /soundcloud\.com\/.+\/.+/.test(t)) links.push(t);
  });

  // Limit to latest N (tweak if you want more/less)
  const LATEST = 18;
  const take = links.slice(0, LATEST);

  const items = [];
  for (const link of take) {
    try {
      // oEmbed gives us title + thumbnail + iframe HTML
      const o = await fetch(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`
      ).then(r => r.json());

      const title = (o.title || '').trim() || 'Untitled';
      const thumb = o.thumbnail_url || null;
      const iframeSrc = extractIframeSrcFromOEmbedHtml(o.html || '');

      items.push({
        title,
        kind: 'solo',                 // du ville att både original & remixes landar under "Solo Projects"
        thumb: thumb || 'image00015.jpeg',
        media: { type: 'embed', src: iframeSrc || link },
        desc: 'From SoundCloud.',
        links: [{ label: 'Listen (SoundCloud)', href: link }]
      });
    } catch (e) {
      console.warn('oEmbed failed for:', link, e.message);
      items.push({
        title: link.split('/').pop().replace(/-/g,' '),
        kind: 'solo',
        thumb: 'image00015.jpeg',
        media: { type: 'embed', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}&visual=true` },
        desc: 'From SoundCloud.',
        links: [{ label: 'Listen (SoundCloud)', href: link }]
      });
    }

    // be polite
    await new Promise(r => setTimeout(r, 250));
  }

  return uniqByTitle(items);
}

// ---------- main ----------
(async function main() {
  // 1) Build latest SC items
  const scItems = await scrapeSoundCloud();

  // 2) Read existing file (to keep Bandcamp/manual entries)
  let existing = [];
  try {
    const old = await fs.readFile(OUT_PATH, 'utf8');
    existing = JSON.parse(old);
  } catch (_) {}

  // Keep all non-SoundCloud entries from existing (i.e., ones that are NOT "From SoundCloud.")
  const keep = existing.filter(x => (x.desc || '').indexOf('From SoundCloud.') === -1);

  // 3) Merge & dedupe by title (SC first so new tracks float to top)
  const merged = uniqByTitle([...scItems, ...keep]);

  // 4) Write
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(merged, null, 2), 'utf8');

  console.log(`Wrote ${merged.length} items -> ${OUT_PATH}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
