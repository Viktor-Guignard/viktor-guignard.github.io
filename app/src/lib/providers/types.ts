export type NormalizedOffer = {
  externalId: string;
  titre: string;
  entreprise: string;
  lieu: string;
  contact: string | null;
  exigences: string;
  source: string;
  url: string | null;
  // true = alternance, apprentissage ou stage — exclu quand "CDI/CDD uniquement" est actif
  altStage: boolean;
};
