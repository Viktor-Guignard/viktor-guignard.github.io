// Les stages/alternances sont souvent classés en CDD par les jobboards (France Travail
// notamment) — un filtre par type de contrat ne suffit pas, il faut aussi repérer les
// mots-clés dans le titre.
const STAGE_ALTERNANCE_REGEX = /\b(stage|stagiaire|alternance|alternant|apprenti|apprentissage)\b/i;

// Générique pour préserver le type exact du tableau passé en entrée (NormalizedOffer[]
// avant stockage, ou l'enregistrement Prisma complet une fois relu depuis la base).
export function excludeStagesAlternance<T extends { titre: string }>(offers: T[]): T[] {
  return offers.filter((o) => !STAGE_ALTERNANCE_REGEX.test(o.titre));
}
