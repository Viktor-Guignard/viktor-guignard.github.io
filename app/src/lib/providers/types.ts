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
  // true = email trouvé via recherche web (contact générique de l'entreprise), pas
  // extrait directement de l'annonce — affiché différemment pour rester honnête.
  contactGuessed?: boolean;
};
