const GENERIC_ENTREPRISE = /^entreprise non communiqu/i;

// Hunter.io Domain Search : à partir d'un nom d'entreprise, retrouve les emails connus
// sur son domaine (générique type contact@/rh@, ou nominatifs déjà indexés). Gratuit sur
// 25 requêtes/mois — d'où l'appel au compte-goutte, borné côté route de recherche.
export async function findEmailViaHunter(
  apiKey: string,
  entreprise: string
): Promise<{ email: string; isGeneric: boolean } | null> {
  if (!apiKey || !entreprise || GENERIC_ENTREPRISE.test(entreprise)) return null;

  try {
    const qs = new URLSearchParams({
      company: entreprise,
      api_key: apiKey,
      limit: "5",
    });
    const res = await fetch(`https://api.hunter.io/v2/domain-search?${qs.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const emails: any[] = json?.data?.emails ?? [];
    if (emails.length === 0) return null;

    // Préfère un email générique (contact@, rh@, careers@) à un email nominatif trouvé
    // au hasard sur le web — plus approprié pour une candidature non sollicitée.
    const generic = emails.find((e) => e.type === "generic");
    const chosen = generic ?? emails[0];
    return { email: chosen.value, isGeneric: chosen.type === "generic" };
  } catch {
    return null;
  }
}

// Plafonne strictement le nombre d'appels Hunter par recherche pour préserver le quota
// mensuel gratuit (25/mois) — partagé entre les deux espaces Elomty et Didi.
export async function enrichMissingContactsViaHunter<
  T extends { entreprise: string; contact: string | null }
>(offers: T[], apiKey: string, maxAttempts = 5): Promise<(T & { contactGuessed?: boolean })[]> {
  if (!apiKey) return offers;

  let attempts = 0;
  const result: (T & { contactGuessed?: boolean })[] = [];
  for (const o of offers) {
    if (o.contact || attempts >= maxAttempts) {
      result.push(o);
      continue;
    }
    attempts++;
    const found = await findEmailViaHunter(apiKey, o.entreprise);
    result.push(found ? { ...o, contact: found.email, contactGuessed: true } : o);
  }
  return result;
}
