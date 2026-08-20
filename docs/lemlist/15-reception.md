# Couche 5b — recevoir vraiment

> Écrit le 20 août 2026, après avoir mesuré ce qui existait déjà. **Le cœur est
> livré ; le facteur reste à choisir**, et ce choix a changé depuis le 19/08.

## Ce que la couche fait

Un message arrive. Il faut décider trois choses, et une seule est évidente :

1. **Est-ce un humain ?** Un « je suis en congés jusqu'au 25 » n'est pas une
   réponse. `declarerReponse` débloque une attente **et réancre la suite** :
   traiter une absence comme une réponse ferait partir l'étape suivante —
   écrite pour quelqu'un qui vient de parler — vers un répondeur. C'est la faute
   des 59 inscriptions gelées, prise par l'autre bout.
2. **À quelle inscription répond-il ?** Pas « à quel prospect » — à quelle
   **inscription**. Deux campagnes peuvent viser la même adresse.
3. **A-t-on déjà vu ce message ?** Un webhook rejoue ; une relève IMAP relit.
   Sans garde, la séquence avance d'une étape de trop.

## Ce qui est livré

| Fichier | Rôle |
| --- | --- |
| `src/lib/email/reception.ts` | **Pur.** Nature du message, appariement, texte utile. Aucun réseau, aucune base. |
| `src/lib/email/reception-db.ts` | L'écriture dans le fil, et l'appel à `declarerReponse` quand c'est légitime. |
| `src/app/api/email/entrant/route.ts` | La porte : HMAC + fraîcheur, un message ou un lot. |
| `sql/20260820_reception.sql` | `message_id` (unique), `in_reply_to`, `recu_le`, `lu_le`, `assignee_id`. **Appliquée le 20/08.** |

42 tests. Le module pur est testé sans mock ; la couche base l'est avec un
client de complaisance ; la route l'est sur sa signature et sa fraîcheur.

### La règle, en une ligne

**Il faut un humain ET un appariement exact.** `peutDebloquer(nature, moyen)`
est le seul endroit qui décide :

| | sous-adressage | in-reply-to | adresse seule |
| --- | --- | --- | --- |
| **réponse** | débloque | débloque | range, ne débloque pas |
| **automatique** | range | range | range |
| **rebond** | range | range | range |

« Range » n'est pas un échec : le message est dans le fil, daté, à sa place, et
l'écran peut proposer « c'est bien une réponse » en un clic. Ce qui est refusé,
c'est de **deviner** — deux inscriptions peuvent viser la même adresse, et se
tromper d'inscription fait partir le mauvais message.

### L'idempotence est une insertion, pas une lecture

On n'interroge pas la base pour savoir si le message est déjà là : deux
livraisons simultanées passeraient toutes les deux le contrôle avant que l'une
n'écrive. C'est l'index unique sur `email_logs.message_id` qui tranche, et le
conflit `23505` qui dit « déjà vu ». Même parade que le webhook Resend.

Un message **sans** `Message-ID` entre quand même — perdre une réponse serait
pire qu'en avoir deux — mais le bilan le dit (`protege: false`).

## Le contrat du facteur

`POST /api/email/entrant`

```
x-sama-horodatage: <secondes unix>
x-sama-signature:  sha256=<hmac_sha256(RECEPTION_CLE, "<horodatage>.<corps>")>
```

```json
{ "de": "Cédric <cedric@sarl-martin.fr>",
  "pour": ["contact+<uuid-inscription>@samadigitalstudio.fr"],
  "objet": "Re: votre site",
  "texte": "…", "html": "…",
  "messageId": "<CAF-9182@sarl-martin.fr>",
  "enReponseA": "<abc@resend.dev>",
  "recuLe": "2026-08-20T09:12:00Z",
  "entetes": { "Auto-Submitted": "no", "Precedence": "" } }
```

Un lot : `{ "messages": [ … ] }`, 50 au maximum. La réponse rend **un bilan par
message** — ce qui a été fait *et* ce qui ne l'a pas été, en clair.

⚠️ `RECEPTION_CLE` se lit dans `process.env` **au moment de l'appel**, jamais
dans `env.ts` : ce schéma valide tout à l'import, et une variable mal formée y
éteindrait l'API entière. La leçon a été payée le 20/08 avec `RESEND_FROM_EMAIL`.

## Le facteur : ce qui a changé le 19/08, et ce que ça implique

Le plan d'origine recommandait un sous-domaine dédié avec ses propres MX. **Les
mesures d'aujourd'hui renversent la recommandation.**

Ce qui est vrai en production, vérifié le 20/08 :

- `automation_connections.resend` porte `reply_to = contact@samadigitalstudio.fr`
  et `reply_to_sous_adressage = oui` ;
- les MX des **deux** domaines pointent sur `mail.samadigitalstudio.com` (LWS) ;
- LWS accepte le `+` — éprouvé par Matteo le 19/08, un message envoyé à
  `contact+test@` est bien arrivé dans `contact@` ;
- `imapflow` est **déjà** une dépendance, et `src/lib/rechauffeur/connecteur-imap.ts`
  ouvre déjà des sessions IMAP ;
- le coffre chiffré existe (`src/lib/rechauffeur/coffre.ts`).

Donc :

| | Ce que ça coûte aujourd'hui |
| --- | --- |
| **B — relève IMAP sur `contact@samadigitalstudio.fr`** | **Zéro DNS.** Les réponses y arrivent déjà, sous-adressées. Le client IMAP et le coffre existent. Reste : un curseur d'UID, un réglage de boîte, un cron. Demande **un mot de passe d'application**, tapé dans le formulaire du CRM. |
| **A — sous-domaine `reponses.samadigitalstudio.fr` + routage vers webhook** | Demande de **rechanger le `Reply-To`** (posé et éprouvé le 19/08), de republier des MX, et de **réprouver le `+`** chez le nouveau routeur. Ce qui était « ne touche à rien » le 19 ne l'est plus le 20. |
| **C — Resend Inbound** | Même obstacle qu'un routeur externe : il faut lui donner les MX d'un domaine, donc couper les boîtes LWS ou en créer un nouveau. |

**Recommandation : B.** Elle n'exige aucun changement de ce qui vient d'être
prouvé, et elle réutilise trois briques déjà écrites. A reste faisable et le
code ne bouge pas — le facteur n'est qu'un adaptateur au-dessus de
`enregistrerEntrant`.

⚠️ **B dépend de `RECHAUFFEUR_CLE`** (le coffre), qui est déjà l'un des trois
blocages de la liste. Poser la variable débloque donc *deux* couches d'un coup.

## Ce que la couche ne fera jamais

- **WhatsApp.** 177 échanges partent par `wa.me` ouverts à la main. Aucun
  mécanisme ne captera jamais une réponse sans l'API Business. La saisie
  manuelle (couche 5a, livrée) reste la seule voie, et ce n'est pas un pis-aller.
- **Poser `sales_pipeline_state.replied`.** Le raisonnement est en tête de
  `reply.ts` : `hasInterest()` s'en sert pour éteindre les cellules WhatsApp et
  Appel, ce qui couperait les étapes que la séquence veut enchaîner. Une réponse
  débloque une attente ; elle ne dit pas que le prospect est intéressé.
