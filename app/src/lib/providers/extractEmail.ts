// La plupart des jobboards (France Travail, Adzuna...) n'exposent jamais l'email
// du recruteur dans un champ structuré — volontairement, pour éviter le spam.
// Certaines annonces en glissent quand même un dans le texte libre : on le récupère
// s'il y est, sans jamais en inventer un.
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function extractEmailFromText(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = text.match(EMAIL_REGEX);
    if (match) return match[0];
  }
  return null;
}
