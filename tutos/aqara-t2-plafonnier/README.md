# Aqara Dual Relay Module T2 au plafonnier (sans interrupteur mural)

Vidéo : [`aqara-t2-plafonnier-tuto.mp4`](aqara-t2-plafonnier-tuto.mp4). Elle dure environ 6 minutes, avec une voix off et des sous-titres en français.

> ⚠️ Ce guide porte sur des travaux en 230 V. Coupez le courant, vérifiez l'absence de tension au VAT, et faites appel à un électricien au moindre doute.
> La notice Aqara précise que l'installation doit être faite par une personne qualifiée.

## Ce que j'ai retenu

| Question | Réponse |
|---|---|
| La G2H Pro peut-elle servir de hub pour le T2 ? | **Oui.** La FAQ officielle du T2 cite comme hubs compatibles la G2H Pro, la G3, l'E1, le M1S, le M1S Gen 2 et le M2. La page produit Aqara EU exclut la *Camera Hub G2H*, c'est-à-dire l'ancien modèle, pas la Pro. Mettez la caméra à jour avant l'appairage et gardez le T2 à environ 10 m du hub au maximum. |
| Le T2 apparaîtra-t-il dans HomeKit ? | **Oui.** Il passe par la passerelle HomeKit de la G2H Pro. Ni Matter ni un autre hub ne sont nécessaires. |
| Wet ou Dry ? | **Wet Contact.** Laissez le cavalier rouge entre **LIN** et **LOUT**. La sortie L1 fournit alors la phase à la lampe. Choisissez aussi « Wet Contact » dans Aqara Home. |
| Pourquoi l'installer au plafond ? | Le T2 a besoin d'une phase **et** d'un neutre. Derrière l'interrupteur, vos deux fils rouges sont la phase et le retour lampe : il n'y a pas de neutre. Au plafond, le neutre arrive toujours. |
| Les deux fils rouges ? | Reliez-les dans une borne Wago, à l'intérieur de la boîte de l'interrupteur. Refermez avec un obturateur : la boîte doit rester accessible. Le fil de retour devient alors une phase permanente qui alimente le T2. |

## 1. Vidéos vraiment consacrées au T2 au plafond

Je n'ai trouvé **aucun tutoriel en français** sur le T2 monté au plafonnier. Toutes les vidéos francophones le montrent derrière un interrupteur, ou ne font que le présenter. Voici les vidéos utiles :

1. **Shane Whatley, « Make Your Ceiling Fan (or Anything Else) SMART with THIS! »** (anglais, 9:46). C'est la plus pertinente. Le chapitre **5:41 « Install the T2 in Ceiling Fan »** montre le T2 logé au plafond, dans le luminaire. Lien : https://youtu.be/dBAUbd0N0cI?t=341
2. **Aqara UK, « How to install Aqara Dual Relay Module T2 »** (vidéo officielle, 8:31). Elle montre le câblage de base, les bornes et le cavalier du mode Wet. Le montage est générique : il ne montre pas spécifiquement un plafonnier. Lien : https://youtu.be/S4ylasTLtWI

Ces vidéos montrent des installations américaines et britanniques. Les couleurs de fils et les boîtiers ne sont pas ceux d'une installation française. Le schéma ci-dessous est celui qui fait foi.

J'ai vérifié ces vidéos par leurs chapitres et par des images extraites, sans les regarder en entier.

## 2. Compatibilité de la G2H Pro

- Selon la FAQ officielle Aqara du T2, il faut d'abord mettre à jour le hub, puis le connecter au téléphone, puis lui associer le T2. La liste de compatibilité indiquée est : *G2H Pro Camera Hub, G3 Camera Hub, E1 Hub, M1S Hub, M1S Gen 2 Hub, M2 Hub*.
- Selon la notice, le T2 a besoin d'un hub Aqara Zigbee 3.0, et le T2 est intégré à HomeKit.
- La G2H Pro est déjà ajoutée à Apple Maison. Elle y fait remonter automatiquement les accessoires Zigbee compatibles qui lui sont associés.
- Portée annoncée par Aqara : 7 à 10 m à travers un mur. Avec plusieurs murs, placez le T2 le plus près possible du hub.

## 3. Schéma électrique au plafond (montage final)

```
                 ARRIVÉE AU PLAFOND
   phase permanente ─────────────────────► T2 : L
   neutre (bleu) ────► [Wago] ──► T2 : N
                          └─────► plafonnier : N
   terre (vert/jaune) ───────────────────► plafonnier : ⏚   (le T2 n'a pas de borne de terre)

   T2 : cavalier rouge LIN ↔ LOUT           (mode Wet Contact)
   T2 : L1 ──────────────────────────────► plafonnier : L (phase commutée)
   T2 : L2 ─ libre
   T2 : S1 / S2 / COM ─ non raccordés       (plus d'interrupteur filaire)
```

Pour savoir d'où vient la **phase permanente**, ouvrez la boîte du plafond :

- **Cas A, le plus courant :** vous trouvez un seul rouge (le retour), le neutre et la terre. La phase ne monte pas jusqu'au plafond. Il faut alors ponter les deux rouges dans la boîte de l'interrupteur (point 4). Le rouge qui arrive au plafond devient la phase permanente et se branche sur **L**.
- **Cas B :** vous trouvez l'arrivée du tableau (phase, neutre, terre) et un câble à deux fils qui descend vers l'interrupteur. La phase de l'arrivée se branche sur **L**. Pour le câble de l'interrupteur, faites le pont **ou** mettez-le hors service (point 4).

## 4. Que faire des deux fils rouges de l'ancien interrupteur

**Solution recommandée, valable dans les cas A et B : le pont.**
1. Démontez l'interrupteur, courant coupé et absence de tension vérifiée.
2. Reliez les deux fils rouges dans une **borne Wago 221**. C'est l'équivalent d'un interrupteur allumé en permanence.
3. Refermez avec un **obturateur ou une plaque pleine**. La connexion doit rester **accessible** : ne l'enfermez jamais dans le plâtre et ne la laissez pas sans couvercle.
4. Indiquez dans la boîte : « Pont T2 plafond, sous tension ».

**Variante, uniquement dans le cas B : mettre le câble hors service.**
Déconnectez les deux rouges au plafond. Isolez **chaque fil séparément** (une borne par fil) **aux deux extrémités**, puis étiquetez « hors service ». Avec cette variante, plus aucun conducteur n'est sous tension dans la boîte murale. Ne reliez jamais ces fils au neutre.

## 5. Difficultés fréquentes dans une installation française

- **Boîte DCL peu profonde.** Le T2 mesure 45,5 × 48 × 24 mm, sans compter les fils et la borne Wago. Prévoyez une boîte DCL profonde, ou une boîte de dérivation accessible à côté du point lumineux. Le module ne doit jamais être accessible à la main.
- **Signal Zigbee.** Une dalle béton, un boîtier ou un pavillon métallique atténuent le signal. Sortez l'antenne et éloignez-la du métal et des câbles. Gardez le hub proche, ou ajoutez un routeur Zigbee secteur.
- **Protection du circuit.** Aqara demande un **disjoncteur de 10 A** en amont. Beaucoup de circuits d'éclairage français sont protégés en 16 A. Un disjoncteur de 10 A convient au fil de 1,5 mm².
- **Chaleur.** Le T2 fonctionne entre −10 et 40 °C. Ne le placez pas contre une ampoule, ni sous l'isolant des combles, et laissez une ventilation normale.
- **Charge.** Le T2 accepte 10 A au maximum en tout, mais seulement **1 A / environ 200 à 250 W pour des LED** selon les versions de la notice. Un plafonnier classique reste très en dessous.
- **Logement ancien.** Les couleurs de fils n'y sont pas fiables : un rouge peut être un neutre, etc. Identifiez chaque conducteur au VAT, jamais à la couleur. Le cas échéant, prévoyez de remettre les terres en état.
- **Va-et-vient ou plusieurs points lumineux.** Le schéma est différent et n'est pas couvert ici. Avec seulement deux fils derrière l'interrupteur, vous avez un simple allumage.
- **NF C 15-100.** La norme prévoit un point d'éclairage commandé dans chaque pièce. Supprimer toute commande physique peut poser question lors d'une vente, d'un diagnostic ou face à l'assurance. Un **interrupteur sans fil Aqara à pile**, collé sur l'obturateur à l'entrée de la pièce, garde une commande sur place sans tirer de fil. Faites valider ce point par un électricien si vous en avez besoin.

## 6. Wet Contact ou Dry Contact ?

Pour un plafonnier 230 V, utilisez le **Wet Contact** (contact humide).
- **Wet :** le cavalier rouge relie LIN et LOUT. Les sorties L1 et L2 fournissent la phase, et la lampe se branche entre **L1** et **N**.
- **Dry :** sans cavalier, les contacts sont libres de potentiel. Ce mode sert pour un portail, une porte de garage ou une chaudière, qui fournissent leur propre circuit de commande. Il ne convient pas à un plafonnier.
- Dans Aqara Home, choisissez aussi le mode **Wet Contact** dans les réglages du T2.

## 7. Sécurité et vérifications avant de brancher

1. **Coupez** le disjoncteur du circuit d'éclairage, ou le disjoncteur général. Empêchez toute remise sous tension, par exemple avec une étiquette sur le tableau.
2. Vérifiez l'**absence de tension au VAT** entre tous les conducteurs. Un tournevis testeur ne suffit pas.
3. **Photographiez** le câblage existant avant de débrancher quoi que ce soit.
4. Vérifiez la **protection de 10 A** en amont.
5. Dénudez **6 à 8 mm**, serrez fermement chaque vis, puis tirez légèrement sur chaque fil pour vérifier qu'il tient.
6. Contrôlez qu'aucun brin de cuivre ne dépasse, que la terre est reliée au luminaire et que le cavalier LIN–LOUT est en place.
7. **Appairez avant de refermer**, car le bouton du T2 ne sera plus accessible ensuite. Testez la marche et l'arrêt, coupez de nouveau le courant, puis refermez.
8. Pour l'identification sous tension (cas A ou B), adressez-vous à un électricien si vous n'êtes pas habilité.

## Appairage et Apple Maison

1. Mettez la G2H Pro à jour dans Aqara Home.
2. Remettez le courant. Dans Aqara Home, touchez **+**, puis **Ajouter un accessoire**, puis **Dual Relay Module T2**. Choisissez la **G2H Pro** comme hub et suivez l'application. Faites un appui long sur le bouton du T2 si l'application le demande. Le voyant bleu clignote vite pendant la connexion, puis reste fixe une fois le T2 connecté.
3. Dans les réglages, choisissez **Wet Contact** et nommez la sortie L1, par exemple « Plafonnier ».
4. Dans Apple Maison, le T2 apparaît via la passerelle de la G2H Pro. Il remonte souvent comme un double interrupteur : affichez **L1 comme lumière** et masquez L2.
5. Gardez une **commande de secours** : un interrupteur sans fil Aqara pilote le T2 via la G2H Pro. Si la caméra ou le Wi-Fi tombent en panne, Apple Maison ne peut plus commander la lumière.

## Sources

- Notice officielle T2 (DCM-K01), 2023 : https://cdn.aqara.com/cdn/opencloud-product/mainland/product-manual/material/prd/1100007700920942592/en-user-manual-20230608094029.pdf
- Notice officielle T2, 2024, avec les modes Wet, Dry et Wireless Switch : https://cdn.aqara.com/cdn/opencloud-product/mainland/product-manual/material/prd/1100007700920942592/en-user-manual-20240201145321.pdf
- FAQ officielle T2, avec la liste des hubs compatibles et le rôle des bornes : https://images.thdstatic.com/catalog/pdfImages/4b/4b3ed37b-b60d-4fea-861b-512822751aac.pdf
- Page produit Aqara EU (caractéristiques et hubs) : https://eu.aqara.com/products/aqara-dual-relay-module-t2
- Forum Aqara, qui confirme que le T2 a besoin d'un neutre : https://forum.aqara.com/t/dual-relay-module-t2-question/216808
- Test indépendant des modes Wet et Dry (cavalier) : https://tech.scargill.net/aqara-dual-relay-module-t2/

## Régénérer la vidéo

Le dossier `video/` contient tout le nécessaire. `script.json` contient la narration et les sous-titres, `scenes.html` les scènes animées, `capture.js` le rendu Playwright et `build.py` la voix Piper et le montage ffmpeg.

```bash
pip install piper-tts   # voix fr_FR-siwis-medium (rhasspy/piper-voices)
python3 video/build.py --voice fr_FR-siwis-medium.onnx --work /tmp/t2 --out aqara-t2-plafonnier-tuto.mp4
```
