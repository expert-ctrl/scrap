// scrape-instagram.js — Instagram scraper via Apify apify~instagram-scraper
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const { extractContacts } = require("./contacts");

function parseProfile(item, keyword) {
  const username = item.username || item.ownerUsername || "";
  const nickname = item.fullName || item.name || "";
  const bio = item.biography || item.bio || "";
  const followers = item.followersCount || item.followedByCount || 0;
  const profileUrl = username ? `https://www.instagram.com/${username}` : (item.url || "");
  const externalUrl = item.externalUrl || item.websiteUrl || "";

  const contacts = extractContacts(bio + " " + externalUrl);

  return {
    platform: "instagram",
    keyword,
    username,
    nickname,
    bio: bio || "—",
    ...contacts,
    followers,
    profileUrl,
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
  if (!APIFY_TOKEN) return { statusCode: 500, headers, body: JSON.stringify({ error: "APIFY_TOKEN non configuré" }) };

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
        `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUrls: [],
            search: keyword,
            searchType: "user",
            searchLimit: 15,
            resultsLimit: 15,
            addParentData: false,
          }),
        }
      );
      if (!res.ok) continue;
      const items = await res.json();
      for (const item of items) {
        const p = parseProfile(item, keyword);
        if (p.username && !seen.has(p.username)) { seen.add(p.username); allResults.push(p); }
      }
    } catch (err) {
      console.error(`Instagram error "${keyword}":`, err.message);
    }
  }

  allResults.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return {
    statusCode: 200, headers,
    body: JSON.stringify({ total: allResults.length, withContact: allResults.filter(r => r.whatsapp || r.phone).length, results: allResults }),
  };
};
