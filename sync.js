// sync.js – Node.js script to fetch SoundCloud tracks and output JSON
const fs = require('fs');
const fetch = require('node-fetch');  // If not available, install with npm

const SOUNDCloud_URL = 'https://soundcloud.com/thirty_3';      // Your SoundCloud profile URL
const CLIENT_ID = 'YOUR_SOUNDCLOUD_CLIENT_ID';                 // **Insert your SoundCloud API client_id**

async function fetchSoundCloudTracks() {
  // 1. Resolve the SoundCloud user to get numeric user ID
  const resolveUrl = `https://api.soundcloud.com/resolve?url=${encodeURIComponent(SOUNDCloud_URL)}&client_id=${CLIENT_ID}`;
  const userData = await fetch(resolveUrl).then(res => res.json());
  const userId = userData.id;
  if (!userId) {
    throw new Error('Could not resolve SoundCloud user ID. Check the profile URL and client ID.');
  }

  // 2. Fetch all tracks for the user ID (paginating if necessary)
  let allTracks = [];
  let page = 1;
  const pageSize = 200;  // SoundCloud API max page size (if supported)
  while (true) {
    const tracksUrl = `https://api.soundcloud.com/users/${userId}/tracks?client_id=${CLIENT_ID}&limit=${pageSize}&offset=${(page-1)*pageSize}`;
    const tracksPage = await fetch(tracksUrl).then(res => res.json());
    if (!Array.isArray(tracksPage) || tracksPage.length === 0) break;
    allTracks = allTracks.concat(tracksPage);
    if (tracksPage.length < pageSize) break;  // no more pages
    page++;
  }

  // 3. Sort tracks by creation/upload date (newest first)
  allTracks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // 4. Build project entries for each track
  const projects = allTracks.map(track => {
    // Use track artwork or a placeholder if none
    let artworkUrl = track.artwork_url;
    if (!artworkUrl && track.user && track.user.avatar_url) {
      artworkUrl = track.user.avatar_url; // fallback to avatar if no artwork
    }
    // Use a large thumbnail size if available (replace size suffix if present)
    if (artworkUrl) {
      artworkUrl = artworkUrl.replace('-t500x500.', '-t1000x1000.');  // attempt to get a larger image
    }

    return {
      "title": track.title,
      "kind": "solo",
      "thumb": artworkUrl || "",                     // thumbnail image URL (for grid view)
      "media": {                                     // media to display in project detail (SoundCloud player iframe)
        "type": "iframe",
        "src": `https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${track.id}&color=%230066cc&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`
      },
      "desc": track.description || "",               // short description from SoundCloud
      "links": [
        { "label": "Listen (SoundCloud)", "href": track.permalink_url }
      ]
    };
  });

  // 5. Write to JSON file (formatted with 2-space indentation)
  fs.writeFileSync('auto-projects.json', JSON.stringify(projects, null, 2));
  console.log(`✅ Fetched ${projects.length} tracks. Written to auto-projects.json.`);
}

fetchSoundCloudTracks().catch(err => {
  console.error("Error fetching SoundCloud data:", err);
});
