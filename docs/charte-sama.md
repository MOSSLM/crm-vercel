# La charte Sama dans le CRM

Le CRM parlait orange et noir. Il parle désormais la langue de la marque :
**nuit `#0A1B33`, azur `#2F7AE0`, brume**. Ce document dit où vivent ces
couleurs, comment les consommer, et ce qui n'a délibérément pas bougé.

## La palette

| Rôle | Jeton | Clair | Sombre |
| --- | --- | --- | --- |
| Fond de l'app | `--bg` / `--background` | `#F7FAFD` | `#071426` |
| Fond secondaire | `--bg-2` | `#EFF5FC` | `#0A1B33` |
| Fond tertiaire | `--bg-3` | `#E7F0FB` | `#0E2543` |
| Surface | `--surface` / `--card` | `#FFFFFF` | `#0A1B33` |
| Surface alternée | `--surface-2` | `#F3F8FD` | `#0E2543` |
| Encre | `--text` / `--foreground` | `#122844` | `#E8F0FA` |
| Texte secondaire | `--text-2` | `#4A648C` | `#A8BEDD` |
| Texte tertiaire | `--text-3` | `#8AA0C0` | `#7E97BC` |
| Texte discret | `--text-4` | `#B3C4DE` | `#55719B` |
| Accent (azur) | `--accent` (dans un skin) / `--primary` | `#2F7AE0` | `#4A90E8` |
| Accent appuyé | `--accent-2` | `#1F5BC0` | `#7FB2F0` |
| Succès | `--ok` / `--success` | `#1F8A5B` | `#46B98A` |
| Avertissement | `--warn` / `--warning` | `#C8881F` | `#E3A94A` |
| Danger | `--danger` / `--destructive` | `#B5322F` | `#E0625F` |
| Information | `--info` | `#0E93A6` | `#3FB6C6` |
| « Magique » (IA) | `--magic` | `#7A5AE0` | `#A18BF0` |
| Lignes | `--border` / `-2` / `-strong` | `rgba(18,40,68, .10 / .14 / .22)` | blanc .10 / .16 / .26 |

`--info` est passé du bleu `#2A6FDB` au sarcelle `#0E93A6` : l'ancien bleu
d'information serait aujourd'hui indiscernable de l'azur de marque.

## Où sont déclarées ces valeurs

Une seule table de vérité par surface. `src/app/(crm)/globals.css` porte
`:root` et `.dark` ; chaque module à « skin » re-déclare la même palette sous
son propre scope, parce que ces feuilles sont portées depuis des maquettes
autonomes :

`.au-skin` (automatisations) · `.tel-skin` (téléphonie, **avec** son bloc
`.dark .tel-skin`) · `.rv-scope` (rendez-vous) · `.mp-scope` (pipeline
marketing) · `.sb-skin` (site builder) · `[data-form-builder]` · `.da2`
(pilotage) · `.pboard` (planches) · `.cd-scope` (éditeur Claude Design) ·
`.studio-surface` (qui ne redéfinit que `--accent`).

**Conséquence pratique :** modifier `globals.css` seul ne repeint pas le CRM.
Toute évolution de la charte doit passer les onze blocs.

## Lisibilité

Trois couples méritent d'être connus, mesurés en ratio WCAG :

- `--text` `#122844` sur `--bg` `#F7FAFD` : **14,2:1** — AAA.
- `--muted-foreground` `#5F7396` sur blanc : **4,8:1** — AA. Ce jeton est un cran
  plus sombre que `--text-3` **à dessein** : `text-muted-foreground` porte le
  texte secondaire de tout le CRM, alors que `--text-3` `#8AA0C0` (2,7:1) est la
  brume de l'identité, faite pour des étiquettes mono discrètes. Ne portez pas
  de texte courant avec `--text-3`, et jamais rien de lisible avec `--text-4`
  `#B3C4DE` (1,8:1), qui est décoratif.
- Blanc sur `--primary` `#2F7AE0` : **4,2:1**. C'est la paire de l'identité
  Sama ; elle passe le seuil des éléments d'interface (3:1) mais reste sous les
  4,5:1 exigés pour du texte de moins de 18,66 px gras. Un bouton primaire sur
  `--accent-2` `#1F5BC0` monterait à 6,3:1 si l'on veut la conformité stricte.

## Piège connu : `--accent` a deux sens

Dans `:root`, `--accent` est un jeton **shadcn** : c'est une *surface* de survol
(`#EFF5FC`), pas la couleur de marque — laquelle est `--primary`. Dans les
skins et sous `.studio-surface`, `--accent` est la **couleur de marque**
(`#2F7AE0`). Un composant écrit hors de tout skin qui utilise
`var(--accent)` récupérera donc une surface pâle. Utilisez `--primary` hors
skin, `--accent` dedans.

## Ce qui n'a pas basculé, et pourquoi

- **Les palettes de graphiques.** `--chart-1…12` et les teintes de KPI de
  `src/utils/kpiApi.tsx` sont une gamme catégorielle générique : leur travail
  est de **distinguer**, pas de représenter la marque.
- **Les palettes catégorielles de l'application** (étapes de pipeline, rôles,
  canaux, avatars) ont bien basculé, mais sous contrainte : chaque liste a été
  vérifiée en ΔE2000 et aucune paire n'y descend sous **15** — l'orange de
  marque devient l'azur *seulement* quand aucune autre entrée n'était déjà
  bleue, sinon la liste reçoit une teinte franchement écartée. C'est pourquoi
  `STAGE_PALETTE` n'a qu'un seul bleu, et pourquoi le canal Email est sarcelle :
  LinkedIn y porte déjà sa couleur de marque, qui est à deux degrés de l'azur.
- **Les couleurs nommées et persistées.** `CALENDAR_PALETTE` (« Orange »,
  « Bleu ») et `CARD_COLORS` des planches (`red`, `blue`) sont stockées en
  base avec leur nom : changer la valeur ferait mentir le libellé.
- **Les `amber-*` d'avertissement.** Une trentaine de fichiers utilisent
  l'ambre Tailwind pour dire « attention ». C'est la sémantique `--warn`, pas
  une fuite d'orange. Dette réelle (ils devraient passer par le jeton) mais
  distincte de ce rebranding.
- **Les thèmes de sites clients.** `DEFAULT_STYLE_GUIDE`, les fallbacks de
  `src/lib/site-resolver.ts` et les ombres par défaut du Style Guide décrivent
  le site d'un client, pas le CRM. Un artisan n'a aucune raison d'hériter de
  l'azur Sama.

## Maquettes et fichiers générés

`src/components/scheduling/rdv-skin.css` est **généré** depuis
`claude design/Rendez-vous/{crm-base,rdv}.css` par
`scripts/scope-rdv-css.py`. Ces deux sources ont été repeintes en même temps :
sans cela, la première régénération réintroduirait l'orange.

Le reste de `claude design/` (HTML et JSX de prototypage) porte encore
l'ancienne charte. Rien n'y est compilé — ni `tsconfig.json` ni
`tailwind.config.ts` ne scannent ce dossier — mais **tout portage d'un écran
depuis ces maquettes doit traduire la palette au passage**.

## Nouvelles lignes en base

`sql/20260810_charte_sama.sql` recale les `default` de couleur des tables
(étiquettes d'appel, pages de rendez-vous, étiquettes CRM, types de tâches) et
met à jour les seules lignes restées à l'ancienne valeur par défaut. Une
couleur choisie à la main n'est jamais touchée, et le calendrier est exempté :
sa palette est nommée, un défaut hors liste y afficherait une pastille sans
nom.
