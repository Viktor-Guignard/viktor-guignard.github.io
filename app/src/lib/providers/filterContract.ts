import type { NormalizedOffer } from "./types";

// Les stages/alternances sont souvent classés en CDD par les jobboards (France Travail
// notamment) — un filtre par type de contrat ne suffit pas, il faut aussi repérer les
// mots-clés dans le titre.
const STAGE_ALTERNANCE_REGEX = /\b(stage|stagiaire|alternance|alternant|apprenti|apprentissage)\b/i;

export function excludeStagesAlternance(offers: NormalizedOffer[]): NormalizedOffer[] {
  return offers.filter((o) => !STAGE_ALTERNANCE_REGEX.test(o.titre));
}
