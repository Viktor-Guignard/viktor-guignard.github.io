// Les stages/alternances sont souvent classés en CDD par les jobboards (France Travail
// notamment) — un filtre par type de contrat ne suffit pas, il faut aussi repérer les
// mots-clés dans le titre et les intitulés de contrat.
const STAGE_ALTERNANCE_REGEX =
  /\b(stage|stagiaire|alternance|alternant|alternante|apprenti|apprentie|apprentissage|contrat pro|professionnalisation|work[- ]?study|internship|trainee)\b/i;

// Détecte si un texte (titre, type de contrat...) évoque une alternance/apprentissage/stage.
export function looksLikeAltStage(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => t && STAGE_ALTERNANCE_REGEX.test(t));
}

// Générique pour préserver le type exact du tableau passé en entrée (NormalizedOffer[]
// avant stockage, ou l'enregistrement Prisma complet une fois relu depuis la base).
export function excludeStagesAlternance<T extends { titre?: string; altStage?: boolean }>(
  offers: T[]
): T[] {
  // Exclut si le flag stocké est vrai OU si le titre évoque une alternance/stage — ce
  // second garde-fou couvre les anciennes lignes en base pas encore marquées.
  return offers.filter((o) => o.altStage !== true && !looksLikeAltStage(o.titre));
}
