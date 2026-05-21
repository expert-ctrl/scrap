// scrape-facebook.js — Facebook scraper via Apify apify~facebook-pages-scraper
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const { extractContacts } = require("./contacts");

function parsePage(item, keyword) {
  const name = item.title || item.name || item.pageName || "";
  const bio = [item.about, item.description, item.pageDescription, item.intro]
    .filter(Boolean).join(" ");
  const phone = item.phone || item.phoneNumber || "";
  const username = item.pageUrl || item.url || item.handle || name;
  const followers = item.fans || item.followersCount || item.likes || 0;
  const profileUrl = item.pageUrl || item.url || "";

  const contacts = extractContacts(bio + " " + phone);
  if (!contacts.whatsapp && phone) contacts.phone = phone;

  return {
    platform: "facebook",
    keyword,
    username: name,
    nickname: username,
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
        `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrls: [],
            searchTerms: [keyword],
            maxPagesPerSearchTerm: 10,
            maxPostsPerPage: 0,
            scrapeAbout: true,
            language: "en-GB",
          }),
        }
      );
      if (!res.ok) continue;
      const items = await res.json();
      for (const item of items) {
        const p = parsePage(item, keyword);
        const key = p.profileUrl || p.username;
        if (key && !seen.has(key)) { seen.add(key); allResults.push(p); }
      }
    } catch (err) {
      console.error(`Facebook error "${keyword}":`, err.message);
    }
  }

  allResults.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return {
    statusCode: 200, headers,
    body: JSON.stringify({ total: allResults.length, withContact: allResults.filter(r => r.whatsapp || r.phone).length, results: allResults }),
  };
};
