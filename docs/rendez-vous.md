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
- **Hôte admin** : section **Cal.SAMA** sous `/rendez-vous` (nav « Relation »),
  avec sa propre sidebar façon Cal.com à droite de la nav du Studio :
  Aperçu (`/rendez-vous`), Réservations (`/reservations`, sous-filtres à
  venir/en attente/passées/annulées + badge), Types d'évènements (`/types`),
  Disponibilités (`/disponibilites`), Équipe (`/equipe`, admin : pages et
  compteurs de tous les hôtes, filtre « ses résas »), Statistiques
  (`/statistiques`, tuiles + réservations par semaine + répartitions),
  Intégrations (`/integrations`, Google + embed + emails), Ma page
  (`/parametres`).
- **Hôte agent** : même section sous `/espace-agent/rendez-vous`
  (nav « Pilotage »), sans l'onglet Équipe.
- **Cockpit téléphonie** : panneau « Proposer un RDV » à deux modes —
  « Réserver » (mini-calendrier avec les vrais créneaux dispo : l'agent cale
  le RDV pendant l'appel, lié à l'opportunité, avec confirmation email + .ics
  automatiques) et « Lien » (copie du lien prérempli ou envoi par email).
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

Trois types, générés depuis Cal.SAMA → Intégrations (choix de la cible, du
texte, de la couleur et de la position) :

```html
<!-- 1) Inline : le calendrier dans la page -->
<div class="sama-rdv" data-url="https://app.samadigitalstudio.fr/rdv/jean/appel-30min"></div>
<script src="https://app.samadigitalstudio.fr/api/public/scheduling/embed.js" async></script>

<!-- 2) Bouton flottant : bouton fixe en bas d'écran → popup -->
<script src="https://app.samadigitalstudio.fr/api/public/scheduling/embed.js" async
  data-button-url="https://app.samadigitalstudio.fr/rdv/jean/appel-30min"
  data-button-text="Prendre rendez-vous"
  data-button-color="#E2552B"
  data-button-position="right"></script>

<!-- 3) Popup au clic : sur n'importe quel élément -->
<a href="#" data-sama-rdv-popup="https://app.samadigitalstudio.fr/rdv/jean/appel-30min">Réserver</a>
<script src="https://app.samadigitalstudio.fr/api/public/scheduling/embed.js" async></script>
```

L'iframe inline s'auto-redimensionne (postMessage `sama-rdv:height`) ; la
popup se ferme par Échap / clic sur le fond ; `window.SamaRdv.popup(url)` est
aussi exposé. Préremplissage par query params (`?name=&email=&tz=`).

## Architecture

| Élément | Chemin |
|---|---|
| Migration + RLS + RPC | `sql/20260725_scheduling_module.sql` |
| Moteur (tz, slots, ics, tokens) + tests | `src/lib/scheduling/{tz,slots,ics,tokens}.ts` + `__tests__/` |
| Cycle de vie booking (emails, CRM, Google, rappels) | `src/lib/scheduling/{booking,data,emails,google-calendar}.ts` |
| API hôte (withAuth, staff only) | `src/app/api/scheduling/**` |
| API publique (service-role, CORS *) | `src/app/api/public/scheduling/**` |
| Cron rappels | `src/app/api/cron/scheduling-tick/route.ts` |
| Pages publiques | `src/app/rdv/**` |
| UI hôte (partagée admin/agent) | `src/components/scheduling/host/**` |
| Panneau cockpit téléphonie | `src/components/scheduling/BookingLinkPanel.tsx` |

### Habillage : la maquette intégrée telle quelle

Le design vient de la maquette Claude Design conservée dans
`claude design/Rendez-vous/`. Elle n'est pas réinterprétée :

- `scripts/scope-rdv-css.py` préfixe chaque sélecteur de `crm-base.css` et
  `rdv.css` par `.rv-scope`, et génère `src/components/scheduling/rdv-skin.css`.
  Les tokens de la maquette (`--accent` orange, `--radius`, `--font-*`) restent
  donc confinés à la section et n'écrasent jamais le design system du CRM.
  Pour régénérer après une mise à jour de la maquette :

  ```bash
  python3 scripts/scope-rdv-css.py \
    "claude design/Rendez-vous/crm-base.css" \
    "claude design/Rendez-vous/rdv.css" > src/components/scheduling/rdv-skin.css
  ```

- `rdv-embed.css` (écrit à la main, jamais régénéré) réadapte la mise en page
  plein écran de la maquette au shell existant : rail sticky, pas de scroll
  imbriqué, bandeau horizontal sous 1024 px, curseurs cliquables.
- `src/components/scheduling/rdv/Icon.tsx` reprend les 71 icônes verbatim ;
  `rdv/atoms.tsx` porte Btn, Pill, Chip, Sw, Seg, Field, Blk, Av, Row, Stack.

Corollaire : à l'intérieur de `.rv-scope`, on n'utilise **ni Tailwind de
couleur ni composants shadcn** — uniquement le vocabulaire de la maquette.
Mélanger les deux avait cassé le mode sombre et les composants shadcn.

## Extensions prévues (non incluses)

Équipes (round-robin / collectif), workflows de relance avancés, webhooks
sortants, encaissement Stripe du prix par réservation (le prix est déjà stocké
et affiché), connecteur Outlook (la table `scheduling_calendar_connections`
prévoit déjà `provider = 'microsoft'`).
