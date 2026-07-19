import type { NormalizedOffer } from "./types";
import { extractEmailFromText } from "./extractEmail";
import { looksLikeAltStage } from "./filterContract";

export async function searchAdzuna(params: {
  appId: string;
  appKey: string;
  what: string;
  where?: string;
}): Promise<NormalizedOffer[]> {
  if (!params.appId || !params.appKey || !params.what) return [];

  const qs = new URLSearchParams({
    app_id: params.appId,
    app_key: params.appKey,
    what: params.what,
    "content-type": "application/json",
    results_per_page: "15",
  });
  if (params.where) qs.set("where", params.where);

  const res = await fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/1?${qs.toString()}`);
  if (!res.ok) {
    throw new Error(`Adzuna: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const results: any[] = json.results ?? [];

  return results.map((o) => ({
    externalId: `adzuna-${o.id}`,
    titre: o.title ?? "Offre sans titre",
    entreprise: o.company?.display_name ?? "Entreprise non communiquée",
    lieu: o.location?.display_name ?? "",
    contact: extractEmailFromText(o.description),
    exigences: (o.description ?? "").slice(0, 400),
    source: "Adzuna",
    url: o.redirect_url ?? null,
    altStage: looksLikeAltStage(o.title, o.contract_time, o.contract_type),
  }));
}
