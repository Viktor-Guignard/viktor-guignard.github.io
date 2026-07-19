import type { NormalizedOffer } from "./types";
import { looksLikeAltStage } from "./filterContract";

// Google CSE ne renvoie pas des offres structurées — utile en complément
// pour dénicher des annonces publiées hors des deux APIs ci-dessus.
export async function searchGoogleCse(params: {
  cseId: string;
  apiKey: string;
  query: string;
}): Promise<NormalizedOffer[]> {
  if (!params.cseId || !params.apiKey || !params.query) return [];

  const qs = new URLSearchParams({
    key: params.apiKey,
    cx: params.cseId,
    q: `${params.query} CDI`,
    num: "10",
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`Google CSE: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const items: any[] = json.items ?? [];

  return items.map((it, i) => ({
    externalId: `gcse-${Buffer.from(it.link ?? String(i)).toString("base64").slice(0, 24)}`,
    titre: it.title ?? "Résultat sans titre",
    entreprise: it.displayLink ?? "",
    lieu: "",
    contact: null,
    exigences: it.snippet ?? "",
    source: "Google",
    url: it.link ?? null,
    altStage: looksLikeAltStage(it.title, it.snippet),
  }));
}
