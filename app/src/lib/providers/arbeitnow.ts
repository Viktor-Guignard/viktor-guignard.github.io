import type { NormalizedOffer } from "./types";
import { extractEmailFromText } from "./extractEmail";

// Arbeitnow : API publique gratuite, aucune clé requise.
// Pas de paramètre de recherche côté API — on récupère le flux et on filtre nous-mêmes.
export async function searchArbeitnow(params: { query: string }): Promise<NormalizedOffer[]> {
  if (!params.query) return [];

  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) {
    throw new Error(`Arbeitnow: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const all: any[] = json.data ?? [];

  const needle = params.query.toLowerCase();
  const matches = all.filter((o) => {
    const haystack = `${o.title ?? ""} ${(o.tags ?? []).join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });

  return matches.slice(0, 15).map((o) => ({
    externalId: `arbeitnow-${o.slug}`,
    titre: o.title ?? "Offre sans titre",
    entreprise: o.company_name ?? "Entreprise non communiquée",
    lieu: o.location || (o.remote ? "Remote" : ""),
    contact: extractEmailFromText(o.description),
    exigences: (o.tags ?? []).join(", "),
    source: "Arbeitnow",
    url: o.url ?? null,
  }));
}
