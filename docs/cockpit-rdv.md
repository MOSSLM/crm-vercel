# Cockpit RDV & comptes rendus

Le formulaire qu'on remplit *pendant* un échange, rattaché à une entreprise, et
joignable en un clic depuis n'importe quelle page du Studio.

## Le problème

Un prospect appelle. Jusqu'ici il fallait deviner qui c'était, chercher sa fiche,
ouvrir trois onglets pour retrouver sa démo et son audit, et prendre des notes
quelque part. « Quelque part » voulait dire :

- `notes`, rattachées à une **opportunité** — donc inaccessibles tant qu'aucune
  opportunité n'existe, c'est-à-dire pour la plupart des prospects ;
- `call_notes`, rattachées à un **appel du standard** — donc absentes quand le
  prospect appelle sur le portable.

Résultat : le même prospect qui rappelle deux semaines plus tard repartait de
zéro.

## Le parcours

**Bouton « Cockpit »** en haut à droite de la barre du Studio, sur toutes les
pages, ou <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>J</kbd>.

1. **Choisir l'entreprise** — recherche par nom, ville ou numéro de téléphone
   (les chiffres seuls sont comparés, `06 12 34` retrouve `+33 6 12 34 56 78`).
   Les six dernières entreprises consultées sont proposées d'emblée.
2. **Onglet Contexte** — numéros cliquables, adresse, note Google, puis les
   liens à ouvrir pendant l'appel (fiche Google, site actuel, site démo avec sa
   capture, rapport d'audit, pages de lead magnet), les rendez-vous à venir et
   passés, l'historique des comptes rendus, les notes du CRM et les appels du
   standard.
3. **Onglet Compte rendu** — la grille à remplir. Sauvegarde automatique environ
   une seconde après la dernière frappe ; quitter le panneau enregistre ce qui
   reste en attente.

**Page `/mes-rdv`** (nav « Relation ») : trois onglets — À venir, Comptes rendus,
Passés. Les RDV passés sans compte rendu et les brouillons non terminés portent
un badge ambre : c'est la liste de ce qu'il reste à consigner.

## La grille vient du form builder

Le questionnaire n'est **pas** figé dans le code. Un formulaire du form builder
portant le tag `compte-rendu` (ou `rdv`) devient utilisable comme grille. Ça se
change depuis `/forms` sans déploiement, ce qui compte : les questions qu'on pose
en rendez-vous bougent au fil des appels.

Quelle grille s'ouvre, par ordre de priorité :

1. celle du compte rendu qu'on rouvre — même si elle n'est plus taguée, sinon un
   compte rendu ancien deviendrait illisible ;
2. une grille éligible dédiée à cette entreprise (`forms.enterprise_id`) ;
3. la grille éligible modifiée le plus récemment.

Le rendu de saisie est **séparé** de `FormRuntime`. Celui-ci est fait pour un
prospect qui découvre un formulaire : une question par écran, grandes cartes,
animations. En prise de notes il faut l'inverse — tout à l'écran, dense,
tabulable. Les deux consomment le même `FormQuestion`, seul l'habillage change,
et la logique conditionnelle passe par le même `resolveFlow` : une règle qui
saute une question dans le formulaire public la saute ici aussi.

## Relecture d'un compte rendu ancien

Le formulaire a pu changer depuis la saisie. `resumerReponses` croise les clés
stockées avec les questions actuelles : les réponses reconnues s'affichent avec
leur libellé (et les identifiants de choix sont remplacés par les intitulés —
`c_heat` devient `Chauffage`), les orphelines sont rendues brutes en fin de
liste. Perdre une réponse parce que quelqu'un a nettoyé le formulaire serait
pire que l'afficher sans son libellé.

## Modèle de données

`rdv_comptes_rendus` (cf. `sql/20260812_rdv_comptes_rendus.sql`) :

| Colonne | Rôle |
|---|---|
| `entreprise_id` | **Le seul lien obligatoire.** La seule entité qui existe toujours. |
| `auteur_id` | Qui a écrit. |
| `form_id` | La grille utilisée (`on delete set null` : supprimer un formulaire n'emporte pas l'historique commercial). |
| `booking_id`, `opportunite_id`, `contact_id`, `call_id` | Liens facultatifs, remplis selon le contexte d'ouverture. |
| `reponses` | `{ [idQuestion]: valeur }`. |
| `canal` | `appel` / `rdv` / `visio` / `terrain` / `autre`. |
| `statut` | `brouillon` (en cours, sauvegardé au fil de l'eau) / `termine`. |
| `issue` | `interesse` / `a_relancer` / `reflexion` / `pas_interesse` / `injoignable` / `vendu`. |
| `resume`, `prochaine_etape`, `date_prochaine_etape` | La suite à donner. |

Un rendez-vous planifié ne porte qu'un compte rendu (index unique partiel sur
`booking_id`) : un appel interrompu et repris cinq minutes plus tard, c'est le
même échange, pas deux. `POST` sur un `booking_id` déjà couvert renvoie
l'existant au lieu d'échouer.

RLS : admin tout ; l'agent lit les siens et ceux des entreprises qui lui sont
attribuées, et n'édite que ce qu'il a écrit.

## API

| Route | Rôle |
|---|---|
| `GET /api/rdv/contexte?entreprise_id=` | Tout le panneau en **un** aller-retour. Les requêtes partent en parallèle et échouent séparément : un audit manquant ne prive pas l'écran du reste. |
| `GET /api/rdv/comptes-rendus` | `?entreprise_id=` `?statut=` `?mine=1` `?limit=` |
| `POST /api/rdv/comptes-rendus` | Création permissive — seule l'entreprise est requise. |
| `PATCH /api/rdv/comptes-rendus/[id]` | Sauvegarde au fil de l'eau. Un champ absent du corps n'est jamais écrasé. Passer `statut` à `termine` horodate `termine_le`. |
| `DELETE /api/rdv/comptes-rendus/[id]` | |

Les rendez-vous eux-mêmes viennent de `/api/scheduling/bookings?filter=upcoming|past`,
déjà en place (cf. `docs/rendez-vous.md`), et les grilles de `/api/forms`.

## Ouvrir le cockpit depuis ailleurs

```ts
import { ouvrirCockpitRdv } from "@/components/rdv/CockpitRdv";

ouvrirCockpitRdv({ entrepriseId: 1234 });                    // sur une entreprise
ouvrirCockpitRdv({ entrepriseId: 1234, bookingId: "…" });    // depuis un RDV
ouvrirCockpitRdv({ entrepriseId: 1234, compteRenduId: "…" }); // rouvrir un CR
```

## Mise en service

1. **SQL** : `sql/20260812_rdv_comptes_rendus.sql` (idempotent).
2. **Une grille** : créer un formulaire dans `/forms`, lui donner le tag
   `compte-rendu`. Sans grille, le cockpit reste utile — contexte, historique,
   liens, résumé, prochaine étape — et invite à en créer une.
