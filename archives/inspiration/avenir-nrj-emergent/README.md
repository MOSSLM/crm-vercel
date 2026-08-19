# Avenir'Nrj — aperçu Emergent (archive d'inspiration)

Copie prise le **18/08/2026**. Ce n'est pas un site de production : c'est un
aperçu **Emergent** (constructeur d'app par IA), hébergé sur un domaine jetable.
Il peut disparaître sans préavis — d'où cette archive.

## D'où ça vient

| | |
| --- | --- |
| Lien partagé (enveloppe) | `https://solar-energy-20.preview.emergentagent.com/?utm_source=share` |
| **Contenu réel** | `https://solar-energy-20.preview.static.emergentagent.com/` |
| Entreprise | Avenir'Nrj — Rue Antoine Becquerel, 31140 Launaguet · `06 59 36 33 69` |
| Fiche CRM | entreprise **1083** (« Eco NRJ Climatisation-Pompes à chaleur ») |

**Le piège qui m'a fait perdre du temps** : l'URL partagée ne rend qu'un
`<iframe>` vers `app.emergent.sh/loading-preview`. Le HTML utile est sur le
sous-domaine **`.static.`**, pas sur celui du lien. Ne pas archiver le premier.

## Ce qu'il y a dans le dossier

| Fichier | Poids | Quoi |
| --- | --- | --- |
| `index.html` | 4,6 Ko | coquille React, **chemins réécrits en relatif** |
| `assets/main.css` | 60 Ko | toute la feuille de style |
| `assets/main.js` | 414 Ko | bundle unique — contient tout le markup et les textes |
| `assets/images/img1..4.jpg` | 9,2 Mo | les 4 photos (Unsplash + Pexels) |

Le bundle ne porte **aucun chemin absolu** : ouvert depuis n'importe quel
serveur statique, il remonte la page entière. Les images restent référencées
vers Unsplash/Pexels dans le JS — les copies locales sont là pour le jour où
ces liens tombent, il faut les rebrancher à la main.

## Ce qui fait le look

**Polices** (toutes deux externes, chargées par `@import` dans `main.css`) :

- **Cabinet Grotesk** (Fontshare) — les titres, c'est elle qui porte le style
- **Manrope** (Google Fonts) — le texte courant

**Palette**, par fréquence dans le markup :

| Hex | Rôle |
| --- | --- |
| `#FBF9F6` | fond crème |
| `#C45B3E` | accent terracotta (titres, CTA) |
| `#272A26` | encre presque noire |
| `#D5CABD` | filets et séparateurs |
| `#5C635A` | texte secondaire |
| `#7A8F76` | vert sauge (accent secondaire) |
| `#A84930` | terracotta survolé |

## Les partis pris à regarder

- **Hero en mosaïque 6×6** : une grande photo + tuiles pleines couleur portant
  une icône et un mot. Ça remplit sans avoir six photos de qualité.
- **Bandeau défilant de gages** (`marquee`) : « Certifié RGE · QualiPAC ·
  QualiPV · Garantie décennale · Éligible MaPrimeRénov' »… en boucle, avec des
  dégradés de masquage aux deux bouts.
- **Cartes services numérotées** (`01 / Climatisation`) en grille bordée, avec
  vignette carrée à droite et liste à coches.
- **Chiffres du hero** : `+ 12 ans`, `500+`, `5/5` séparés par des filets
  verticaux.

## Attention si on s'en inspire

Le site affiche **« Certifié RGE », « QualiPAC », « QualiPV »** sans que rien ne
l'atteste ici. Chez nous, une allégation RGE passe par le contrôle ADEME
(cf. `src/lib/site-builder/claude-design/hydrate-certifications.ts`) : on copie
la **mise en forme**, jamais les mentions telles quelles.
