# Migration CRM vers Lead Magnet V2

## Fichiers impactés

- `src/components/production/LeadMagnetPage.tsx`
- `src/utils/leadMagnetV2Api.ts`
- `src/app/api/public/lead-magnets/[id]/route.ts`

## Plan de migration

1. **Geler la legacy en lecture seule**
   - Ne plus écrire dans `public.lead_magnets`.
   - Conserver l'API publique sur une vue V2 read-only (`vw_lead_magnet_plugin_ready`).

2. **Basculer le data layer CRM vers V2**
   - Créer un module dédié (`leadMagnetV2Api`) qui centralise la lecture/écriture de:
     - `lead_magnet_projects`
     - `lead_magnet_pages`
     - `lead_magnet_reviews`

3. **Remplacer l'écran CRM legacy**
   - Abandonner l'édition tabulaire de `lead_magnets`.
   - Introduire un écran unique par projet pour:
     - projet (`pret_pour_lm`, `overrides`, `assets`)
     - pages (CRUD)
     - reviews (CRUD + ordre + actif/inactif)

4. **Respecter la règle plugin read-only**
   - L'endpoint plugin `/api/public/lead-magnets/[id]` lit seulement `vw_lead_magnet_plugin_ready`.
   - Aucun endpoint public en écriture n'est exposé.

5. **Sortie progressive**
   - Valider sur un lot de projets.
   - Une fois stable, supprimer les points d'entrée legacy restants.
