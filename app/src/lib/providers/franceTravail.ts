import type { NormalizedOffer } from "./types";
import { extractEmailFromText } from "./extractEmail";
import { looksLikeAltStage } from "./filterContract";

const TOKEN_URL =
  "https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

// Déduit le code département attendu par le paramètre "departement" de l'API France
// Travail à partir d'un code postal à 5 chiffres — aucun appel réseau, aucune ambiguïté
// (contrairement à la résolution par nom de ville). DOM (971-976) sur 3 chiffres,
// Corse (20xxx) ramenée au département "20".
function departementFromCodePostal(input: string): string | null {
  const cp = input.trim();
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith("97") || cp.startsWith("98")) return cp.slice(0, 3);
  return cp.slice(0, 2);
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
  codePostal?: string;
  cdiCddOnly?: boolean;
}): Promise<NormalizedOffer[]> {
  if (!params.clientId || !params.clientSecret || !params.motsCles) return [];

  const token = await getAccessToken(params.clientId, params.clientSecret);
  // 50 offres au lieu de 15 : seules ~6% des annonces exposent un email, donc plus on
  // en récupère, plus on a de chances d'en surfacer un exploitable.
  const qs = new URLSearchParams({ motsCles: params.motsCles, range: "0-49" });

  if (params.codePostal) {
    const departement = departementFromCodePostal(params.codePostal);
    if (departement) qs.set("departement", departement);
  }

  if (params.cdiCddOnly) qs.set("typeContrat", "CDI,CDD");

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
    // o.contact?.courriel contient parfois une phrase du type "Pour postuler, utiliser le
    // lien suivant : https://..." au lieu d'un vrai email — on repasse tout par l'extracteur
    // qui ne retient qu'un motif email valide, quelle que soit la source du texte.
    contact: extractEmailFromText(
      o.contact?.courriel,
      o.contact?.coordonnees1,
      o.contact?.coordonnees2,
      o.contact?.coordonnees3,
      o.description,
      o.entreprise?.description
    ),
    exigences: [
      ...(o.competences ?? []).map((c: any) => c.libelle),
      o.experienceLibelle,
      o.formations?.map((f: any) => f.domaineLibelle).join(", "),
    ]
      .filter(Boolean)
      .join("\n"),
    source: "France Travail",
    url: o.origineOffre?.urlOrigine ?? null,
    // Combine le booléen structuré fiable de l'API (o.alternance), la nature du contrat
    // (apprentissage) et un repli mots-clés sur le titre/type de contrat.
    altStage:
      o.alternance === true ||
      /apprentissage/i.test(o.natureContrat ?? "") ||
      looksLikeAltStage(o.intitule, o.typeContratLibelle),
  }));
}
