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

| Geste | Effet |
|---|---|
| Glisser à un doigt sur le trackpad | Déplacer le curseur |
| Tape à un doigt | Clic (deux tapes rapides : double-clic) |
| Tape à deux doigts | Clic droit |
| Glisser à deux doigts | Défilement |
| Tape, puis glisser aussitôt | Glisser-déposer |
| Toucher l'image du Mac | Clic à cet endroit |
| ⌘, ctrl, opt, ⇧ | S'appliquent à la touche suivante (⌘ puis c = copier) |

## Options

```
--port 8787        port d'écoute
--fps 30           images par seconde
--max-width 1920   largeur maximale de l'image envoyée
--bitrate 8        débit vidéo maximal en Mbit/s
--new-token        change le jeton (invalide les anciens liens)
--dry-run          mire + entrées journalisées, pour tester sans Mac
```

## Sécurité

Le lien contient un jeton qui donne le contrôle total du Mac. Il est stocké dans
`~/.mac-remote-token`. La connexion n'est pas chiffrée sur le réseau local : sur un
Wi-Fi que tu ne maîtrises pas, passe par Tailscale et lance `server.py --host <IP Tailscale>`.

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
