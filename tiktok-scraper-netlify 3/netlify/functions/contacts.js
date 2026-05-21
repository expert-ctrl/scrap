// contacts.js — utilitaire partagé d'extraction de contacts

function extractContacts(text) {
  if (!text) return { whatsapp: "", phone: "", waLink: "" };

  const clean = text.replace(/\n/g, " ");

  // Lien wa.me
  const waLinkMatch = clean.match(/wa\.me\/(\d{7,15})/i);
  const waLink = waLinkMatch ? "+" + waLinkMatch[1] : "";

  // WhatsApp explicite
  const waPatterns = [
    /(?:whatsapp|whatsap|watsapp|wa|chat)[\s:]*([+]?\d[\d\s\-\.]{6,15})/i,
    /([+]220[\s\-\.]?\d{3}[\s\-\.]?\d{4})/,
    /([+]221[\s\-\.]?\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2})/,
  ];
  let whatsapp = "";
  for (const p of waPatterns) {
    const m = clean.match(p);
    if (m) { whatsapp = m[1].trim(); break; }
  }
  if (!whatsapp && waLink) whatsapp = waLink;

  // Téléphone général
  const phonePatterns = [
    /(?:tel|call|phone|appel|contact|numero|number|mob|mobile|ring)[\s:.]*([+]?\d[\d\s\-\.]{6,15})/i,
    /([+]220[\s\-\.]?\d{3}[\s\-\.]?\d{4})/,
    /([+]221[\s\-\.]?\d{2}[\s\-\.]?\d{3}[\s\-\.]?\d{2}[\s\-\.]?\d{2})/,
    /([+]\d{1,3}[\s\-\.]?\d{6,12})/,
    /(\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b)/,
    /(\b\d{7,10}\b)/,
  ];
  let phone = "";
  for (const p of phonePatterns) {
    const m = clean.match(p);
    if (m) { phone = m[1].trim(); break; }
  }

  return { whatsapp, phone: phone || whatsapp, waLink };
}

module.exports = { extractContacts };
