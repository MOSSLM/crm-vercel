# Centrale d'appels Twilio — Guide de configuration

Ce guide explique comment passer la centrale d'appels du **mode simulation**
(par défaut, sans compte) au **mode production** (appels et SMS réels via Twilio).

> Tant qu'aucune variable `TWILIO_*` n'est renseignée, l'application tourne en
> **mode simulation** : numéros fictifs, appels/SMS factices, **aucun coût**.
> C'est le mode idéal pour développer et faire des démos.

---

## 1. Créer et financer le compte Twilio

1. Créez un compte sur <https://www.twilio.com/try-twilio>.
2. Passez le compte en **paid** (ajoutez un moyen de paiement + un premier
   crédit). Les numéros et appels français ne sont pas disponibles sur un compte
   d'essai non financé.
3. Notez, depuis la **Console Twilio** (page d'accueil) :
   - **Account SID** (`AC…`)
   - **Auth Token**

## 2. Bundle réglementaire France (obligatoire)

L'ARCEP (régulateur FR) impose une identification avant d'acheter un numéro
français.

1. Console → **Phone Numbers → Regulatory Compliance → Bundles**.
2. Créez un **Regulatory Bundle** pour la France (type de numéro : *Local*
   et/ou *Mobile*) avec :
   - une **pièce d'identité** (personne physique) **ou** un **extrait Kbis**
     (personne morale),
   - un **justificatif d'adresse** en France.
3. Attendez la validation Twilio (généralement quelques heures à quelques
   jours).

## 3. Acheter un numéro français

- Console → **Phone Numbers → Buy a number**, pays = **France**.
- Choisissez **Local** (fixe/géographique, `+33 1–5` / `+33 9`) ou **Mobile**
  (`+33 6/7`) selon vos besoins de capacités (Voice / SMS / MMS).
- L'achat sera rattaché au bundle réglementaire validé à l'étape 2.

> Vous pourrez ensuite acheter et attribuer des numéros **directement depuis le
> CRM** (section Téléphone → Numéros), sans repasser par la console.

## 4. Clé API + application TwiML (softphone navigateur)

Le softphone (appels dans le navigateur) a besoin d'une **API Key** et d'une
**TwiML App**.

1. Console → **Account → API keys & tokens → Create API key** (type *Standard*).
   Notez le **SID** (`SK…`) et le **Secret** (affiché une seule fois).
2. Console → **Voice → TwiML → TwiML Apps → Create new TwiML App** :
   - **Voice Request URL** : `https://VOTRE_DOMAINE/api/twilio/voice` (méthode `POST`)
   - **Status Callback URL** : `https://VOTRE_DOMAINE/api/twilio/status` (méthode `POST`)
   - Notez le **TwiML App SID** (`AP…`).

## 5. Renseigner les variables d'environnement

Ajoutez dans votre environnement Vercel (Production + Preview) :

| Variable | Valeur | Rôle |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `AC…` | REST + signature webhooks |
| `TWILIO_AUTH_TOKEN` | Auth Token | REST + signature webhooks |
| `TWILIO_API_KEY_SID` | `SK…` | Signature des AccessToken du Voice SDK |
| `TWILIO_API_KEY_SECRET` | secret de la clé API | idem |
| `TWILIO_TWIML_APP_SID` | `AP…` | TwiML App utilisée pour les appels sortants |
| `NEXT_PUBLIC_APP_URL` | `https://app.votredomaine.fr` | Base publique des webhooks |
| `TWILIO_MOCK` | *(absent)* | Mettre `true` pour forcer la simulation malgré des clés présentes |
| `ANTHROPIC_API_KEY` | clé Anthropic | *(optionnel)* Évaluation d'appel par IA (Claude). Sans clé, l'analyse renvoie 503 |

> Toutes ces variables sont **optionnelles** côté code : si `TWILIO_ACCOUNT_SID`
> ou `TWILIO_AUTH_TOKEN` manquent, l'app reste en mode simulation et les routes
> `/api/twilio/*` répondent `503`. Aucune clé n'est jamais exposée au navigateur.

Vérifiez ensuite l'état dans le CRM : **Téléphone** → carte « État de
l'intégration » (badge *Simulation* ou *En ligne*), ou `GET /api/twilio/health`.

## 6. Webhooks

Twilio doit pouvoir joindre publiquement votre application. En production, les
URL pointent sur votre domaine Vercel. En local, utilisez un tunnel
(ex. `cloudflared` ou un déploiement Preview Vercel) et mettez à jour la Voice
Request URL de la TwiML App en conséquence.

Endpoints exposés par l'app (renseignés automatiquement à l'achat d'un numéro
depuis le CRM) :

| Endpoint | Usage |
|---|---|
| `POST /api/twilio/voice` | TwiML des appels **sortants** (softphone) |
| `POST /api/twilio/status` | Status callbacks des appels |
| `POST /api/twilio/incoming` | Appels **entrants** (routage On/Off, SVI, voicemail) |
| `POST /api/twilio/voicemail` | Capture des messages vocaux |
| `POST /api/twilio/recording` | Enregistrements prêts |
| `POST /api/twilio/transcription` | Transcriptions (voicemail / appels) |
| `POST /api/twilio/sms/incoming` | SMS/MMS entrants |
| `POST /api/twilio/sms/status` | Statuts de livraison SMS |

Ces URL (voice/sms/status) sont câblées automatiquement à l'achat d'un numéro
depuis le CRM. La `Voice Request URL` de la TwiML App doit pointer sur
`/api/twilio/voice` ; la `Status Callback URL` sur `/api/twilio/status`.

Un job **pg_cron** `twilio-tick` (chaque minute) appelle `/api/twilio/cron`
pour la bascule On/Off programmée et l'envoi des SMS programmés — voir
`sql/20260726_twilio_cron.sql` (même mécanisme que `process-scheduled-actions`,
en-tête `x-pg-cron-secret`).

Tous les webhooks vérifient la signature `X-Twilio-Signature` avec l'Auth Token
(fail-closed en production, fail-open en dev quand aucun token n'est configuré).

## 7. Portabilité des numéros

- **Numéros fixes / géographiques FR** (`+33 1–5`, `+33 9`) : **portables** vers
  Twilio (~1 semaine, avec justificatifs). Gérez la demande depuis
  **Téléphone → Portabilité**.
- **Numéros mobiles FR** (`+33 6/7`) : le portage vers Twilio est **actuellement
  suspendu** par Twilio. La demande est enregistrée avec le statut
  « en attente de réouverture ». En attendant, gardez votre mobile joignable via
  un **renvoi d'appel** vers un numéro Twilio (réglable par agent).

## 8. Coûts (ordre de grandeur)

Facturation à l'usage Twilio : location de numéro (~1 €/mois pour un fixe FR),
appels et SMS au compteur, plus les options (enregistrement, transcription,
Voice Intelligence). Consultez la grille officielle Twilio pour la France.
Le mode simulation n'engendre **aucun** de ces coûts.

## 9. Migrations SQL à appliquer

Le schéma vit dans `sql/` (appliqué manuellement à Supabase, via l'outil MCP).
Appliquez dans l'ordre :

1. `20260723_twilio_core.sql` — numéros, réglages agent, appels, événements
2. `20260724_twilio_porting.sql` — demandes de portabilité
3. `20260725_twilio_inbound.sql` — messagerie vocale, SVI
4. `20260726_twilio_cron.sql` — job pg_cron (remplacer `<PG_CRON_SECRET>`)
5. `20260727_twilio_sms.sql` — SMS/MMS, SMS programmés
6. `20260728_twilio_ai.sql` — transcriptions, évaluations IA, tags d'appel

## 10. Où retrouver la centrale dans le CRM

- **Téléphone** (espace Relation) — softphone, appels récents, messagerie
  vocale, réglages (mode On/Off, programmation, numéro par défaut, renvoi,
  enregistrement).
- **Téléphone → Numéros** — rechercher, acheter, attribuer, libérer.
- **Téléphone → Portabilité** — porter un numéro existant.
- **Téléphone → Standard (SVI)** — message d'accueil et menu à touches.
- **Téléphone → Messages** — inbox SMS/MMS (aussi dans l'espace agent).
- **Téléphone → Statistiques** — analytics, heatmap, appels en cours.

Le **softphone flottant** est disponible sur toutes les pages pour le personnel
(admin + agents), avec click-to-call depuis les fiches contact et le démarchage.
