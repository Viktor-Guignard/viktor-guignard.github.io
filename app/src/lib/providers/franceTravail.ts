import type { NormalizedOffer } from "./types";

const TOKEN_URL =
  "https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.pole-emploi.io/partenaire/offresdemploi/v2/offres/search";

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
  if (params.localisation) qs.set("commune", params.localisation);

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
