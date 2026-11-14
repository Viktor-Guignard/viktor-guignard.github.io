# mac-remote

Piloter un Mac depuis Safari sur un iPhone ou un iPad : l'écran du Mac en haut,
un clavier et un trackpad en bas. Aucune app à installer sur le téléphone, pas de Xcode.

## Installation (sur le Mac)

```sh
cd mac-remote
python3 -m venv .venv && source .venv/bin/activate
pip install --only-binary=:all: -r requirements.txt
python3 server.py
```

`--only-binary=:all:` force les paquets précompilés : sans lui, pip peut vouloir compiler
`cryptography` (Mac Intel), ce qui exige les outils de développement d'Apple.

Il faut un vrai Python 3.10+ : le `python3` de macOS n'est qu'un raccourci vers les
Command Line Tools. Sans Xcode ni Command Line Tools, [micromamba](https://mamba.readthedocs.io)
installe Python et git dans le dossier personnel, sans mot de passe administrateur :

```sh
mkdir -p ~/.micromamba && cd ~/.micromamba
curl -fsSL https://micro.mamba.pm/api/micromamba/osx-64/latest | tar -xj bin/micromamba   # osx-arm64 sur Apple Silicon
MAMBA_ROOT_PREFIX=~/.micromamba bin/micromamba create -y -n tools -c conda-forge python=3.12 git
~/.micromamba/envs/tools/bin/python3 -m venv .venv   # depuis mac-remote/, à la place de « python3 -m venv »
```

Au premier lancement, macOS demande deux permissions pour l'app qui lance le script
(Terminal, iTerm, Claude Code…) dans Réglages Système › Confidentialité et sécurité :

- **Enregistrement de l'écran** : sans elle, l'image est noire ou ne montre que le fond d'écran ;
- **Accessibilité** : sans elle, les clics et les frappes sont ignorés.

Le script signale au démarrage celles qui manquent. Relance-le après les avoir accordées.

## Utilisation (sur l'iPhone)

1. Ouvre dans Safari l'adresse affichée par le script (`http://…:8787/?t=…`).
2. Partager › « Sur l'écran d'accueil » pour l'avoir en plein écran.

Hors de chez toi : installe [Tailscale](https://tailscale.com) sur le Mac et l'iPhone,
puis utilise l'adresse en `100.x.y.z` affichée par le script.

| Geste sur le trackpad | Effet |
|---|---|
| Glisser à un doigt | Déplacer le curseur |
| Tape à un doigt | Clic (deux tapes rapides : double-clic) |
| Tape à deux doigts | Clic droit |
| Glisser à deux doigts | Défilement |
| Tape, puis glisser aussitôt | Glisser-déposer |

Les mêmes gestes marchent directement sur l'image du Mac, là où se pose le doigt :

| Geste sur l'image | Effet |
|---|---|
| Glisser à un doigt | Le curseur suit le doigt |
| Tape à un doigt | Clic à cet endroit (deux tapes rapides : double-clic) |
| Tape sur le curseur | Clic exactement là où il est, sans le déplacer |
| Tape à deux doigts | Clic droit |
| Glisser à deux doigts | Défilement de ce qui est sous les doigts |
| Tape, puis glisser aussitôt | Glisser-déposer |

iPhone tenu à l'horizontale : l'écran du Mac s'affiche seul, en grand ; le clavier et le
trackpad reviennent à la verticale.

| Clavier | Effet |
|---|---|
| ⌘, ctrl, opt, ⇧ | S'appliquent à la touche suivante (⌘ puis c = copier) |

## Options

```
--port 8787        port d'écoute
--fps 30           images par seconde
--max-width 1920   largeur maximale de l'image envoyée
--bitrate 8        débit vidéo maximal en Mbit/s
--new-token        change le jeton (invalide les anciens liens et les sessions ouvertes)
--set-password     choisit le mot de passe de la page de connexion, puis quitte
--clear-password   supprime le mot de passe (retour au lien à jeton), puis quitte
--dry-run          mire + entrées journalisées, pour tester sans Mac
```

## Mot de passe et adresse fixe

Sans mot de passe, l'accès passe par le lien à jeton (`…/?t=…`), stocké dans
`~/.mac-remote-token`. Ce lien donne le contrôle total du Mac.

Avec un mot de passe, l'adresse n'a plus de jeton et ne change plus :
`http://<nom-du-mac>.local:8787/` à la maison, ou l'adresse Tailscale partout. La page
demande le mot de passe, puis l'appareil reste connecté 30 jours.

- Le choisir : bouton « Mot de passe » de la télécommande, ou `python3 server.py --set-password`.
- Dès qu'il existe, le lien à jeton ne marche plus. Le changer déconnecte les autres appareils.
- Seule son empreinte (scrypt) est enregistrée, dans `~/.mac-remote-password`.
- Cinq erreurs de suite bloquent les essais 30 s, puis le double à chaque nouvelle erreur.
- Oublié : `python3 server.py --clear-password`, puis relance le serveur.

## Sécurité

La vidéo est toujours chiffrée (WebRTC). Le reste — page, mot de passe, clavier, souris —
circule en clair sur le réseau local. Pour que tout soit chiffré, passe par
[Tailscale](https://tailscale.com) : installe-le sur le Mac et l'iPhone, et ouvre l'adresse
Tailscale du Mac (`http://100.x.y.z:8787/` ou son nom MagicDNS). `server.py --host <IP Tailscale>`
ferme en plus l'accès par le réseau local.

## Limites

- Pas de son.
- L'image garde le format de l'écran du Mac (bandes noires) ; BetterDisplay permet de
  créer un écran virtuel au format du téléphone.
- Seul l'écran principal est capturé, un seul téléphone à la fois.
- Capture par ScreenCaptureKit (macOS 12.3+), repli sur mss (moins de 10 images/s en Retina).
- Encodage logiciel : 30 images/s en 1920×1200 sur un MacBook Pro Intel, au prix de deux
  cœurs ; baisse `--max-width` si l'image saccade.
- Les raccourcis suivent la disposition clavier active au lancement du script : relance-le
  si tu en changes.
- Tant que le téléphone regarde l'écran, macOS affiche l'icône de partage d'écran dans la
  barre des menus. « Arrêter le partage » coupe l'image (écran noir sur le téléphone) mais
  pas le clavier ni la souris ; recharger la page relance la capture. Pour tout couper,
  arrête le script.
