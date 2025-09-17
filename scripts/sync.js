// scripts/sync.js
// Node 18+ (fetch inbyggt). Kör: node scripts/sync.js
// Skapar/uppdaterar data/auto-projects.json med enkla kort för Bandcamp+SoundCloud.

const fs = require('fs/promises');
const path = require('path');
const cheerio = require('cheerio');

const OUT_PATH = path.join(__dirname, '..', 'data', 'auto-projects.json');

// Justera om du byter användarnamn
const BANDCAMP_BASE = 'https://thirty3.bandcamp.com';
const BANDCAMP_MUSIC = `${BANDCAMP_BASE}/music`;
const SOUNDCLOUD_USER = 'https://soundcloud.com/thirty_3';

function uniq(arr) { return [...new Set(arr)]; }
function abs(base, href) { try { return new URL(href, base).toString(); } catch { return null; } }

async function getHTML(url) {
  const r = await fetch(url, { headers: { 'user-agent':'Mozilla/5.0' }});
  if (!r.ok) throw new Error(`Fetch failed ${r.status} ${url}`);
  return await r.text();
}

async function scrapeBandcamp() {
  const html = await getHTML(BANDCAMP_MUSIC);
  const $ = cheerio.load(html);
  const links = [];
  $('a').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (href.includes('/album/') || href.includes('/track/')) {
      const u = abs(BANDCAMP_BASE, href);
      if (u) links.push(u);
    }
  });

  const urls = uniq(links).slice(0, 40); // rimlig gräns
  const items = [];

  for (const url of urls) {
    try {
      const page = await getHTML(url);
      const $p = cheerio.load(page);
      const title = $p('meta[property="og:title"]').attr('content')
                || $p('title').text().trim()
                || 'Untitled';
      const image = $p('meta[property="og:image"]').attr('content') || '';

      items.push({
        title,
        kind: 'solo',                // Bandcamp: defaulta till "solo"
        thumb: image || 'image00015.jpeg',
        media: image ? { type:'image', src:image } : { type:'image', src:'image00015.jpeg' },
        desc: 'From Bandcamp.',
        links: [{ label: 'Bandcamp', href: url }]
      });
    } catch (e) {
      console.warn('Bandcamp item fail:', e.message);
    }
    await new Promise(r => setTimeout(r, 400)); // snäll throttle
  }

  return items;
}

function extractSoundCloudTrackLinks(html) {
  // Plocka ut länkar som ser ut som spår: /thirty_3/slug
  const re = /https:\/\/soundcloud\.com\/thirty_3\/[a-z0-9\-_.]+/gi;
  return uniq(html.match(re) || []);
}

function extractIframeSrcFromOEmbedHtml(html) {
  const m = html.match(/<iframe[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

async function scrapeSoundCloud() {
  const html = await getHTML(SOUNDCLOUD_USER);
  const trackUrls = extractSoundCloudTrackLinks(html).slice(0, 25);

  const items = [];
  for (const t of trackUrls) {
    try {
      const oembedURL = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(t)}`;
      const r = await fetch(oembedURL, { headers: { 'user-agent':'Mozilla/5.0' }});
      if (!r.ok) throw new Error(`oEmbed ${r.status}`);
      const data = await r.json();

      const iframeSrc = extractIframeSrcFromOEmbedHtml(data.html || '');
      const thumb = data.thumbnail_url || 'image00015.jpeg';

      items.push({
        title: data.title || t,
        kind: 'solo', // dina egna låtar på din profil = "solo"
        thumb: thumb,
        media: iframeSrc ? { type:'embed', src: iframeSrc } : { type:'image', src: thumb },
        desc: 'From SoundCloud.',
        links: [{ label: 'SoundCloud', href: t }]
      });
    } catch (e) {
      console.warn('SoundCloud item fail:', e.message);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return items;
}

async function main() {
  const [bc, sc] = await Promise.allSettled([scrapeBandcamp(), scrapeSoundCloud()]);
  const bandcampItems = bc.status === 'fulfilled' ? bc.value : [];
  const soundcloudItems = sc.status === 'fulfilled' ? sc.value : [];

  const merged = [...bandcampItems, ...soundcloudItems];

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(merged, null, 2), 'utf8');

  console.log(`Wrote ${merged.length} items -> ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
