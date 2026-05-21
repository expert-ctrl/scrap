
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
  const username = item.username || item.ownerUsername || "";
  const nickname = item.fullName || item.name || "";
  const bio = item.biography || item.bio || "";
  const followers = item.followersCount || item.followedByCount || 0;
  const profileUrl = username ? `https://www.instagram.com/${username}` : (item.url || "");
  const externalUrl = item.externalUrl || item.websiteUrl || "";
  return { platform: "instagram", keyword, username, nickname, bio: bio || "—", ...extractContacts(bio + " " + externalUrl), followers, profileUrl };
}

exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Methode non autorisee" }) };
  if (!APIFY_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: "APIFY_TOKEN non configure" }) };
  let keywords;
  try { keywords = JSON.parse(event.body).keywords || []; } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Body JSON invalide" }) }; }
  const allResults = [], seen = new Set();
  for (const keyword of keywords) {
    try {
      const res = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: keyword, searchType: "user", searchLimit: 15, resultsLimit: 15 }),
      });
      if (!res.ok) continue;
      const items = await res.json();
      for (const item of items) { const p = parseProfile(item, keyword); if (p.username && !seen.has(p.username)) { seen.add(p.username); allResults.push(p); } }
    } catch (err) { console.error(`Instagram error "${keyword}":`, err.message); }
  }
  allResults.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return { statusCode: 200, headers, body: JSON.stringify({ total: allResults.length, withContact: allResults.filter(r => r.whatsapp || r.phone).length, results: allResults }) };
};
