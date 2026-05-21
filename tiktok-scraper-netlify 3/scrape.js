const APIFY_TOKEN = process.env.APIFY_TOKEN;

function extractContacts(text) {
  if (!text) return { whatsapp: "", phone: "", waLink: "" };
  const clean = text.replace(/\n/g, " ");
  const waLinkMatch = clean.match(/wa\.me\/(\d{7,15})/i);
  const waLink = waLinkMatch ? "+" + waLinkMatch[1] : "";
  const waPatterns = [
    /(?:whatsapp|whatsap|watsapp|wa|chat)[\s:]*([+]?\d[\d\s\-\.]{6,15})/i,
    /([+]220[\s\-\.]?\d{3}[\s\-\.]?\d{4})/,
    /([+]221[\s\-\.]?\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2})/,
  ];
  let whatsapp = "";
  for (const p of waPatterns) { const m = clean.match(p); if (m) { whatsapp = m[1].trim(); break; } }
  if (!whatsapp && waLink) whatsapp = waLink;
  const phonePatterns = [
    /(?:tel|call|phone|appel|contact|numero|number|mob|mobile)[\s:.]*([+]?\d[\d\s\-\.]{6,15})/i,
    /([+]220[\s\-\.]?\d{3}[\s\-\.]?\d{4})/,
    /([+]221[\s\-\.]?\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2})/,
    /([+]\d{1,3}[\s\-\.]?\d{6,12})/,
  ];
  let phone = "";
  for (const p of phonePatterns) { const m = clean.match(p); if (m) { phone = m[1].trim(); break; } }
  return { whatsapp, phone: phone || whatsapp, waLink };
}

function parseProfile(item, keyword) {
  const author = item.authorMeta || item.author || {};
  const username = author.name || author.uniqueId || "";
  const nickname = author.nickName || author.nickname || "";
  const bio = author.signature || author.bio || "";
  const followers = author.fans || author.followerCount || 0;
  if (!bio && !username) return null;
  return { platform: "tiktok", keyword, username, nickname, bio, ...extractContacts(bio), followers, profileUrl: username ? `https://www.tiktok.com/@${username}` : "" };
}

async function runActorAsync(keyword) {
  // 1. Lancer le job
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQueries: [keyword],
        resultsPerPage: 10,
        maxProfilesPerQuery: 8,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      }),
    }
  );
  if (!runRes.ok) return [];
  const run = await runRes.json();
  const runId = run.data?.id;
  if (!runId) return [];

  // 2. Attendre max 25 secondes que le job finisse
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const status = await statusRes.json();
    if (["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(status.data?.status)) break;
  }

  // 3. Récupérer les résultats
  const dataRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=50`
  );
  if (!dataRes.ok) return [];
  return await dataRes.json();
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Methode non autorisee" }) };
  if (!APIFY_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: "APIFY_TOKEN non configure" }) };

  let keywords;
  try { keywords = JSON.parse(event.body).keywords || []; } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Body JSON invalide" }) }; }

  // Max 2 keywords par appel pour rester sous 26 secondes
  const limited = keywords.slice(0, 2);
  const allResults = [], seen = new Set();

  for (const keyword of limited) {
    try {
      const items = await runActorAsync(keyword);
      for (const item of items) {
        const p = parseProfile(item, keyword);
        if (p && !seen.has(p.username)) { seen.add(p.username); allResults.push(p); }
      }
    } catch (err) { console.error(`TikTok error "${keyword}":`, err.message); }
  }

  allResults.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return { statusCode: 200, headers, body: JSON.stringify({ total: allResults.length, withContact: allResults.filter(r => r.whatsapp || r.phone).length, results: allResults }) };
};
