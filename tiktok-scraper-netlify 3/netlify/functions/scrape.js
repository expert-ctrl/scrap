// scrape.js — TikTok scraper via Apify clockworks~tiktok-scraper
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const { extractContacts } = require("./contacts");

function parseProfile(item, keyword) {
  const author = item.authorMeta || item.author || {};
  const username = author.name || author.uniqueId || "";
  const nickname = author.nickName || author.nickname || "";
  const bio = author.signature || author.bio || "";
  const followers = author.fans || author.followerCount || 0;
  if (!bio && !username) return null;
  return {
    platform: "tiktok",
    keyword,
    username,
    nickname,
    bio,
    ...extractContacts(bio),
    followers,
    profileUrl: username ? `https://www.tiktok.com/@${username}` : "",
  };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Méthode non autorisée" }) };
  if (!APIFY_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: "APIFY_TOKEN non configuré dans les variables d'environnement Netlify" }) };

  let keywords;
  try {
    keywords = JSON.parse(event.body).keywords || [];
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Body JSON invalide" }) };
  }

  const allResults = [];
  const seen = new Set();

  for (const keyword of keywords) {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchQueries: [keyword],
            resultsPerPage: 20,
            maxProfilesPerQuery: 15,
            shouldDownloadVideos: false,
            shouldDownloadCovers: false,
          }),
        }
      );
      if (!res.ok) continue;
      const items = await res.json();
      for (const item of items) {
        const p = parseProfile(item, keyword);
        if (p && !seen.has(p.username)) { seen.add(p.username); allResults.push(p); }
      }
    } catch (err) {
      console.error(`TikTok error "${keyword}":`, err.message);
    }
  }

  allResults.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return {
    statusCode: 200, headers,
    body: JSON.stringify({ total: allResults.length, withContact: allResults.filter(r => r.whatsapp || r.phone).length, results: allResults }),
  };
};
