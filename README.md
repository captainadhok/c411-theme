# c411-theme

Userscript Tampermonkey/Violentmonkey pour personnaliser l'apparence de [C411](https://c411.org) :

- **🎨 Accent de couleur** : remplace le vert du site par la couleur de ton choix (presets Bleu, Indigo, Violet, Rose, Orange, Cyan, ou nuancier libre), appliqué à toute l'interface — accent, fonds, header, mode sombre, barre de chargement.
- **🎃 Thème événementiel** : active/désactive le thème Halloween (décor, logo) en un clic, avec persistance et ré-application automatique à chaque navigation.

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) (ou Violentmonkey).
2. Cliquer sur le lien d'installation : **[c411-theme.user.js](https://github.com/captainadhok/c411-theme/raw/main/c411-theme.user.js)**

Ou copier le contenu du fichier dans un nouveau script Tampermonkey.

## Usage

- **🎨** (bouton flottant en bas à droite) : palette de couleurs — presets ou nuancier libre, application en direct, retour au vert d'origine en un clic.
- **🎃** : bascule du thème Halloween (bouton en opacité réduite quand le thème est désactivé).
- Les préférences sont mémorisées et réappliquées automatiquement à chaque chargement de page.

## Notes techniques

- Conçu pour C411 (Nuxt + Nuxt UI + Tailwind v4) : recoloration par override des variables `--color-emerald-*` et décalage de teinte des variables sémantiques (oklch) détectées comme « vertes ».
- Le thème Halloween est contrôlé par la classe `.theme-halloween` posée par le site ; le script la retire et masque le décor `.hw-decor`, et re-réapplique la désactivation après chaque navigation (MutationObserver).
