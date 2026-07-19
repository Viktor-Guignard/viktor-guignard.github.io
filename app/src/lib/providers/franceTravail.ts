import type { NormalizedOffer } from "./types";

const TOKEN_URL =
  "https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

// Résout un nom de ville en texte libre ("Paris", "Lyon"...) vers son code département,
// seul format accepté de façon fiable par le paramètre "departement" de l'API France
// Travail (le paramètre "commune" est rejeté même avec un code INSEE valide).
// Service public gratuit, sans clé. En cas d'échec, on renvoie null et la recherche
// se fait sans filtre de lieu (le champ reste affiché dans les résultats).
async function resolveDepartementCode(cityName: string): Promise<string | null> {
  try {
    const qs = new URLSearchParams({
      nom: cityName,
      fields: "codeDepartement",
      boost: "population",
      limit: "1",
    });
    const res = await fetch(`https://geo.api.gouv.fr/communes?${qs.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.[0]?.codeDepartement ?? null;
  } catch {
    return null;
  }
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "api_offresdemploiv2 o2dsoffre",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`France Travail auth: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

export async function searchFranceTravail(params: {
  clientId: string;
  clientSecret: string;
  motsCles: string;
  localisation?: string;
}): Promise<NormalizedOffer[]> {
  if (!params.clientId || !params.clientSecret || !params.motsCles) return [];

  const token = await getAccessToken(params.clientId, params.clientSecret);
  const qs = new URLSearchParams({ motsCles: params.motsCles, range: "0-14" });

  // Ex: "Paris / télétravail" -> "Paris" -> département "75"
  const cityGuess = params.localisation?.split(/[/,]/)[0]?.trim();
  if (cityGuess) {
    const departement = await resolveDepartementCode(cityGuess);
    if (departement) qs.set("departement", departement);
  }

  const res = await fetch(`${SEARCH_URL}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`France Travail search: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const resultats: any[] = json.resultats ?? [];

  return resultats.map((o) => ({
    externalId: `ft-${o.id}`,
    titre: o.intitule ?? "Offre sans titre",
    entreprise: o.entreprise?.nom ?? "Entreprise non communiquée",
    lieu: o.lieuTravail?.libelle ?? "",
    contact: o.contact?.courriel ?? null,
    exigences: [
      ...(o.competences ?? []).map((c: any) => c.libelle),
      o.experienceLibelle,
      o.formations?.map((f: any) => f.domaineLibelle).join(", "),
    ]
      .filter(Boolean)
      .join("\n"),
    source: "France Travail",
    url: o.origineOffre?.urlOrigine ?? null,
  }));
}
