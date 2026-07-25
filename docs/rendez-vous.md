# Module Rendez-vous (clone Cal.com / Calendly intégré)

Un hôte (admin ou agent freelance) configure ses disponibilités une fois, partage
son lien public `/rdv/{username}`, un invité **sans compte** choisit un créneau,
et le rendez-vous se crée automatiquement partout : bookings CRM, calendrier CRM,
Google Calendar (si connecté), emails de confirmation des deux côtés avec
fichier `.ics`, lien visio et liens reprogrammer/annuler.

## Parcours

- **Invité** : `/rdv/{username}` (profil + types d'évènements) →
  `/rdv/{username}/{slug}` (calendrier + créneaux dans SON fuseau, détecté et
  changeable → formulaire avec questions custom → confirmation) →
  `/rdv/gerer/{token}` (reprogrammer / annuler).
- **Hôte admin** : `/rendez-vous` (réservations), `/rendez-vous/types`,
  `/rendez-vous/disponibilites`, `/rendez-vous/parametres` (nav « Relation »).
- **Hôte agent** : mêmes écrans sous `/espace-agent/rendez-vous` (nav « Pilotage »).
- **Cockpit téléphonie** : panneau « Proposer un RDV » (copie du lien prérempli
  + envoi par email au prospect pendant l'appel).
- **Landing** : le CTA « Réserver un échange » pointe sur `/rdv` (redirige vers
  la page du premier admin actif).

## Garanties clés

- **Tout en UTC** : les règles de dispo sont des minutes-locales dans le fuseau
  du planning, converties date par date (`src/lib/scheduling/tz.ts`, basé Intl,
  zéro dépendance). Les changements d'heure ne décalent jamais les créneaux
  (testé : DST mars/octobre Europe/Paris).
- **Double-booking impossible** : contrainte d'exclusion GiST
  `scheduling_bookings_no_overlap` sur `(user_id, tstzrange(start_at, end_at))`
  pour les statuts actifs. Sous concurrence, le perdant reçoit `23P01` → 409
  `slot_taken`. La reprogrammation est atomique via la RPC
  `scheduling_reschedule_booking` (annulation + insertion en une transaction).
- **Calcul des créneaux** (`src/lib/scheduling/slots.ts`, pur et testé) :
  plages du planning − busy réel (bookings actifs + calendrier CRM avec
  récurrences + agendas Google) − buffers avant/après − préavis minimum −
  limites jour/semaine, découpé durée + grille de départ.

## Mise en service (étapes manuelles)

1. **SQL** : exécuter `sql/20260725_scheduling_module.sql` dans l'éditeur SQL
   Supabase (crée les tables `scheduling_*`, RLS, RPC, extension `btree_gist`).
2. **Rappels** : enregistrer le job pg_cron commenté en fin de migration
   (remplacer `<PG_CRON_SECRET>`) — il appelle `/api/cron/scheduling-tick`
   toutes les 5 min pour envoyer les rappels email (la veille + 1 h avant par
   défaut, configurable par type d'évènement).
3. **Emails** : `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (déjà utilisés par le
   CRM). Sans clé, les réservations fonctionnent mais aucun email ne part.
4. **Google Calendar (optionnel)** : créer un client OAuth « Web » dans Google
   Cloud Console avec le redirect
   `https://app.samadigitalstudio.fr/api/scheduling/google/callback`, activer
   l'API Google Calendar, puis poser `GOOGLE_CALENDAR_CLIENT_ID` et
   `GOOGLE_CALENDAR_CLIENT_SECRET` dans Vercel. Chaque hôte connecte ensuite
   son compte dans « Ma page & agendas ». Apporte : busy réel multi-agendas
   (FreeBusy) + création d'évènement avec lien **Google Meet** automatique.

## Embed sur un site externe

```html
<div class="sama-rdv" data-url="https://app.samadigitalstudio.fr/rdv/jean/appel-30min"></div>
<script src="https://app.samadigitalstudio.fr/api/public/scheduling/embed.js" async></script>
```

L'iframe s'auto-redimensionne (postMessage `sama-rdv:height`). Le snippet est
copiable depuis « Ma page & agendas ». Préremplissage possible par query params
(`?name=&email=&tz=`).

## Architecture

| Élément | Chemin |
|---|---|
| Migration + RLS + RPC | `sql/20260725_scheduling_module.sql` |
| Moteur (tz, slots, ics, tokens) + tests | `src/lib/scheduling/{tz,slots,ics,tokens}.ts` + `__tests__/` |
| Cycle de vie booking (emails, CRM, Google, rappels) | `src/lib/scheduling/{booking,data,emails,google-calendar}.ts` |
| API hôte (withAuth, staff only) | `src/app/api/scheduling/**` |
| API publique (service-role, CORS *) | `src/app/api/public/scheduling/**` |
| Cron rappels | `src/app/api/cron/scheduling-tick/route.ts` |
| Pages publiques | `src/app/rdv/**` + `src/components/scheduling/{BookingWidget,ManageBookingView}.tsx` |
| UI hôte (partagée admin/agent) | `src/components/scheduling/host/**` |
| Panneau cockpit téléphonie | `src/components/scheduling/BookingLinkPanel.tsx` |

Chaque booking est relié au CRM : matching contact par email
(`contact_id`/`entreprise_id`), évènement `crm_calendar_events` (catégorie
« Rendez-vous », visible dans `/calendar`, calendrier équipe téléphonie et
espace agent), champs `opportunite_id`/`call_id` pour la téléphonie, emails
journalisés dans `email_logs` (type `scheduling`).

## Extensions prévues (non incluses)

Équipes (round-robin / collectif), workflows de relance avancés, webhooks
sortants, encaissement Stripe du prix par réservation (le prix est déjà stocké
et affiché), connecteur Outlook (la table `scheduling_calendar_connections`
prévoit déjà `provider = 'microsoft'`).
