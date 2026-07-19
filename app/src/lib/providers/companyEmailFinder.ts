const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Domaines techniques/génériques à ignorer (CDN, moteurs de recherche, trackers...)
// qui polluent parfois les extraits de recherche sans être liés à l'entreprise.
const NOISE_DOMAINS =
  /@(duckduckgo|google|facebook|sentry|cloudflare|wixpress|example|schema|w3|godaddy|gstatic)\./i;

const GENERIC_ENTREPRISE = /^entreprise non communiqu/i;

// Cherche un email de contact PUBLIC de l'entreprise (pas celui, souvent inexistant,
// du recruteur précis) via une recherche web sans clé API. Best-effort : peut ne rien
// trouver, ou trouver un standard/accueil générique plutôt qu'un email RH dédié — d'où
// l'étiquetage "contactGuessed" côté appelant pour rester honnête dans l'UI.
export async function findCompanyEmail(entreprise: string): Promise<string | null> {
  if (!entreprise || GENERIC_ENTREPRISE.test(entreprise)) return null;

  try {
    const q = encodeURIComponent(`"${entreprise}" email contact recrutement`);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ");
    const matches = text.match(EMAIL_REGEX) ?? [];
    const candidate = matches.find((m) => !NOISE_DOMAINS.test(m));
    return candidate ?? null;
  } catch {
    return null;
  }
}

// Limite la concurrence pour rester raisonnable vis-à-vis du service de recherche
// et du temps de réponse total de la route — on ne tente l'enrichissement que pour
// un sous-ensemble d'offres sans email, pas la totalité.
export async function enrichMissingContacts<
  T extends { entreprise: string; contact: string | null }
>(offers: T[], maxAttempts = 12): Promise<(T & { contactGuessed?: boolean })[]> {
  let attempts = 0;
  const result: (T & { contactGuessed?: boolean })[] = [];
  for (const o of offers) {
    if (o.contact || attempts >= maxAttempts) {
      result.push(o);
      continue;
    }
    attempts++;
    const found = await findCompanyEmail(o.entreprise);
    result.push(found ? { ...o, contact: found, contactGuessed: true } : o);
  }
  return result;
}
