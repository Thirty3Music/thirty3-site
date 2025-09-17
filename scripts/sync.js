// scripts/sync.js
// Builds data/auto-projects.json from SoundCloud (and leaves Bandcamp parts to you if needed).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "data", "auto-projects.json");

// --- SETTINGS ---
const SOUNDCLOUD_USER = "thirty_3";          // <- din SoundCloud-handle
const PLACEHOLDER = "image00015.jpeg";

// ---------- helpers ----------
function tag(text, name) {
  const re = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = text.match(re);
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}
function attr(text, name) {
  const re = new RegExp(`${name}="([^"]+)"`);
  const m = text.match(re);
  return m ? m[1] : "";
}
function dedupeByTitle(list) {
  const m = new Map();
  for (const p of list) {
    const k = (p.title || "").trim().toLowerCase();
    if (!m.has(k)) m.set(k, p);
  }
  return [...m.values()];
}

// ---------- SoundCloud via RSS ----------
async function scrapeSoundCloud() {
  const rssUrl = `https://soundcloud.com/${SOUNDCLOUD_USER}/sounds.rss`;
  const res = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`SC RSS ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = tag(block, "title");
    const link = tag(block, "link"); // canonical track url
    if (!title || !link) continue;

    // Hoppa över reposts (behåll egna låtar + remixer)
    // (SoundCloud RSS lägger ändå mest egna; extra filter bara ifall)
    if (!link.includes(`/` + SOUNDCLOUD_USER + `/`)) {
      // fortfarande ok om det är collab/feature men vi låter solo-listan ta dina uppladdningar
      continue;
    }

    // Thumb från enclosure (om finns)
    let thumb = attr(block, "url") || PLACEHOLDER;

    // Sätt ihop projektobjekt
    items.push({
      title,
      kind: "solo", // dina egna låtar (inkl remixes)
      thumb: "auto",
      media: {
        type: "embed",
        src:
          "https://w.soundcloud.com/player/?url=" +
          encodeURIComponent(link) +
          "&visual=true",
      },
      desc: "From SoundCloud.",
      links: [{ label: "Listen (SoundCloud)", href: link }],
    });
  }

  // dedupe + return
  return dedupeByTitle(items);
}

// ---------- MAIN ----------
async function main() {
  // 1) hämta SoundCloud
  const scItems = await scrapeSoundCloud();

  // 2) läs ev befintlig auto-projects.json och slå ihop (för att inte tappa Bandcamp)
  let existing = [];
  try {
    const old = await fs.readFile(OUT_PATH, "utf8");
    existing = JSON.parse(old);
  } catch (_) {}

  const merged = dedupeByTitle([...existing, ...scItems]);

  // 3) skriv fil
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(merged, null, 2), "utf8");
  console.log(`Wrote ${merged.length} items -> ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
