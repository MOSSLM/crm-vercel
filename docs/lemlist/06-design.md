# lemlist — le design

> Relevé le 19 août 2026 sur `lemlist.com`, en lisant les styles calculés de la page
> plutôt qu'en estimant les couleurs à l'œil. Les valeurs ci-dessous sont celles que le
> navigateur applique réellement.

---

## 1. La palette

| Rôle | Valeur | Où | Notre équivalent |
| --- | --- | --- | --- |
| **Encre** — texte, titres | `#213856` | 2 788 éléments : c'est *la* couleur du site | `--text` `#122844` |
| **Bleu d'action** | `#316BFF` | boutons, anneaux, états actifs | `--primary` `#2F7AE0` |
| **Bleu pâle** | `#E9F3FF` | fonds sélectionnés, encarts | `--accent-tint` |
| **Gris secondaire** | `#566F8F` | texte de second plan | `--text-2` `#4A648C` |
| **Gris tertiaire** | `#98A1AC` | légendes, texte désactivé | `--text-3` `#8AA0C0` |
| **Fond de page** | `#FBFBFB` | quasi blanc, très légèrement chaud | `--bg` `#F8F8F9` |
| **Surface** | `#FFFFFF` | cartes, panneaux | `--surface` |
| Noir | `#000000` | rare, décoratif | — |

**Ce que la mesure dit** : leur charte est **remarquablement proche de la nôtre**.
Marine + azur contre encre + azur, avec des fonds gris quasi neutres des deux côtés.
L'écart tient en deux points : leur bleu est plus saturé (`#316BFF` contre `#2F7AE0`),
et leur encre un peu plus claire (`#213856` contre `#122844`).

C'est une bonne nouvelle pour le portage : la grammaire lemlist se pose sur notre
structure de jetons sans la tordre.

---

## 2. La typographie

| Usage | Police | Relevé |
| --- | --- | --- |
| **Titres d'accroche** | **lemfont**, graisse 700 | police maison, chargée en 700 uniquement |
| **Interface** | **Inter**, graisses 400 et 500 | boutons, navigation, corps |
| **Corps et variantes** | **DM Sans Variable** (100→1000, romain et italique) | |
| **Complément** | **Source Sans 3** (400, 500, 600, 700) | |

**Mesure sur le `<h1>` de la page d'accueil** :

```
font-family : lemfont, sans-serif
font-size   : 48px
font-weight : 700
line-height : 56px        (soit 1,17)
letter-spacing : normal
color       : #213856
```

**Mesure sur le bouton d'appel à l'action principal** :

```
font-family   : Inter, sans-serif
font-size     : 16px
font-weight   : 500
padding       : 8px 32px
border-radius : 12px
color         : #FFFFFF
box-shadow    : 0 0 0 1px #316BFF, 0 4px 6px -1px rgba(0,0,0,.1),
                0 2px 4px -2px rgba(0,0,0,.1)
```

> Ce `box-shadow` mérite d'être noté : leurs boutons portent **un anneau de 1 px de la
> couleur de marque** en plus de l'ombre. C'est ce qui leur donne leur netteté.

**Substitution pour nous** : `lemfont` n'est pas distribuable. Deux options — **Inter
700** pour rester dans leur famille visuelle, ou notre **Instrument Serif** existante
pour garder la signature Sama sur les titres. Le reste (Inter, DM Sans) est déjà
disponible : nous chargeons **DM Sans** en repli et **Geist** en principal.

---

## 3. Les formes

| Élément | Valeur |
| --- | --- |
| Rayon des boutons | **12 px** |
| Anneau des boutons | 1 px, couleur de marque |
| Ombre | `0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)` — douce, jamais lourde |
| Densité | aérée : 8 px vertical, 32 px horizontal sur un bouton principal |

Aucune variable CSS de thème n'est exposée sur leur site (les seules `--*` trouvées
appartiennent à des bibliothèques tierces : notifications, infobulles, bandeau de
consentement). Les couleurs sont écrites en dur ou compilées.

---

## 4. La grammaire d'écran

Ce qui se copie, au-delà des couleurs.

**Le constructeur de séquence est vertical.** Les étapes s'empilent de haut en bas, un
bouton **« Ajouter une étape »** apparaît *entre* les blocs, et le panneau de réglages
de l'étape sélectionnée s'ouvre **à droite**. Les branches d'une condition se
dédoublent visuellement, avec les libellés OUI et NON sur les arêtes.

**L'inbox est à trois volets** : filtres à gauche, conversation au centre, dossier du
lead à droite. Le canal ne structure pas la vue — il n'est qu'une icône dans le fil.

**Les tâches sont un tableau**, pas une liste de cartes : colonnes configurables,
filtres en **pastilles éditables** posées sous la barre d'onglets, vues sauvegardées
comme onglets avec leur compteur en direct, barre d'actions de masse qui apparaît en
bas dès qu'une case est cochée.

**Les rapports sont des widgets** déplaçables et redimensionnables, groupés en onglets
qu'on enregistre.

**Trois principes transversaux :**

1. **Un écran, une question.** Rapports : « où en est-on ». Leads : « qui ». Tâches :
   « que fais-je maintenant ». Campagne : « qu'est-ce qui part ».
2. **Tout état visible est filtrable**, et tout filtre est enregistrable en vue.
3. **Rien ne part sans avoir été vu** : l'écran de lancement montre l'aperçu par lead.

---

## 5. Le portage chez nous

**Décision** : un skin dédié, `lem-skin.css`, sur le modèle des onze skins existants du
dépôt (`.au-skin`, `.dm-skin`, `.mp-scope`, `.tel-skin`…), scopé sur l'espace
Prospection.

C'est un douzième skin, et c'est assumé : le CRM en porte déjà onze, chacun issu du
portage d'une maquette autonome. Le re-skin global de l'application aux couleurs
lemlist — que Matteo veut aussi — est un **chantier séparé** ; c'est lui qui les fera
converger.

**Les jetons du skin** :

```css
.lem-skin {
  --lem-encre:        #213856;
  --lem-bleu:         #316BFF;
  --lem-bleu-pale:    #E9F3FF;
  --lem-gris-2:       #566F8F;
  --lem-gris-3:       #98A1AC;
  --lem-fond:         #FBFBFB;
  --lem-surface:      #FFFFFF;
  --lem-rayon:        12px;
  --lem-anneau:       0 0 0 1px var(--lem-bleu);
  --lem-ombre:        0 4px 6px -1px rgb(0 0 0 / .1),
                      0 2px 4px -2px rgb(0 0 0 / .1);
  --lem-police:       Inter, "DM Sans", ui-sans-serif, system-ui, sans-serif;
}
```

**Deux précautions héritées du dépôt** :

1. **Le mode sombre.** Le CRM a un thème sombre complet, et `globals.css` porte environ
   mille lignes qui réécrivent les utilitaires de couleur pour lui. Un skin qui écrit
   des couleurs en dur casse le sombre : le skin doit donc redéclarer ses jetons sous
   `.dark .lem-skin`, comme le font `tel-skin.css` et `dem-skin.css`.
2. **Le piège `--accent`.** Hors skin, `--accent` est une *surface* de survol
   (`#F1F2F4`) ; dans un skin, c'est la *couleur de marque*. On n'y touche pas : les
   jetons du skin sont préfixés `--lem-` pour qu'aucune collision ne soit possible.

**Ce qui ne se copie pas** : le contraste. Notre charte mesure ses rapports de
lisibilité (`--text` sur `--bg` = 14,2:1) et interdit le texte courant en `--text-3`
(2,7:1). Le gris tertiaire de lemlist, `#98A1AC` sur `#FBFBFB`, tombe à ≈ 2,5:1 — il
reste réservé au décoratif, jamais à du texte qu'il faut lire.
