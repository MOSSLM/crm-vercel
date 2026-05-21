// node-catalog.ts — catalogue des blocs (déclencheurs / conditions / actions /
// tâches manuelles / contrôle de flux) + métadonnées de champs d'entité.
// Porté depuis claude design/automations-data.jsx.
import type { NodeCat } from './types'

export interface NodeCatalogItem {
  id: string
  icon: string
  name: string
  desc?: string
}

export interface NodeCatalogSection {
  section: string
  cat: NodeCat
  items: NodeCatalogItem[]
}

export const NODE_CATALOG: NodeCatalogSection[] = [
  {
    section: 'Déclencheurs CRM',
    cat: 'trigger',
    items: [
      { id: 'trg.stage_changed', icon: 'pipeline', name: 'Changement de stage', desc: "Quand une opportunité passe à un stage particulier d'un pipeline." },
      { id: 'trg.opportunity_created', icon: 'opportunity', name: 'Opportunité créée', desc: "Au moment où une opportunité est créée dans un pipeline." },
      { id: 'trg.tag_added', icon: 'tag', name: 'Tag ajouté', desc: "Quand un tag spécifique est appliqué à un contact ou une entreprise." },
      { id: 'trg.contact_created', icon: 'contacts', name: 'Contact créé', desc: "À la création d'un nouveau contact, avec filtres optionnels." },
      { id: 'trg.form_submitted', icon: 'form', name: 'Formulaire soumis', desc: "Dès qu'un formulaire reçoit une nouvelle soumission." },
    ],
  },
  {
    section: 'Déclencheurs temps',
    cat: 'trigger',
    items: [
      { id: 'trg.schedule', icon: 'cal', name: 'Planning récurrent', desc: "Tous les lundis à 9h, ou autre fréquence CRON." },
      { id: 'trg.no_activity', icon: 'clock', name: 'Inactivité prolongée', desc: "Quand un contact n'a aucune activité depuis X jours." },
    ],
  },
  {
    section: 'Conditions',
    cat: 'cond',
    items: [
      { id: 'cnd.if_field', icon: 'filter', name: 'Si champ…', desc: "Brancher selon la valeur d'un champ de la donnée déclencheuse." },
      { id: 'cnd.if_tag', icon: 'tag', name: 'Si tag présent', desc: "Vérifier qu'un tag est appliqué (ou pas)." },
    ],
  },
  {
    section: 'Actions auto',
    cat: 'action',
    items: [
      { id: 'act.send_email', icon: 'mail', name: 'Envoyer un email', desc: "Avec un template + variables d'interpolation." },
      { id: 'act.move_stage', icon: 'pipeline', name: 'Déplacer dans le pipeline', desc: "Pousser l'opportunité vers un autre stage." },
      { id: 'act.add_tag', icon: 'tag', name: 'Ajouter un tag', desc: "Tagger l'enregistrement courant." },
      { id: 'act.assign_owner', icon: 'user', name: 'Attribuer à un utilisateur', desc: 'Round-robin ou utilisateur fixe.' },
      { id: 'act.create_task', icon: 'task', name: 'Créer une tâche', desc: 'Tâche de suivi assignée à un utilisateur.' },
      { id: 'act.notify', icon: 'bell', name: "Notifier une équipe", desc: 'Notification Slack ou in-app.' },
      { id: 'act.webhook', icon: 'webhook', name: 'Envoyer un webhook HTTP', desc: 'POST/PUT vers une API externe.' },
      { id: 'act.ai_score', icon: 'ai', name: 'Score IA — Claude', desc: 'Évaluer la donnée avec Claude et écrire le résultat dans un champ.' },
    ],
  },
  {
    section: 'Tâches manuelles',
    cat: 'manual',
    items: [
      { id: 'act.task_call', icon: 'phone', name: "Tâche d'appel", desc: "Créer un appel à passer dans la file de démarchage." },
      { id: 'act.task_whatsapp', icon: 'whatsapp', name: 'Tâche WhatsApp', desc: "Message pré-rédigé, l'opérateur clique pour envoyer." },
      { id: 'act.task_linkedin', icon: 'linkedin', name: 'Tâche LinkedIn', desc: 'Demande de connexion ou InMail à envoyer manuellement.' },
    ],
  },
  {
    section: 'Contrôle de flux',
    cat: 'delay',
    items: [
      { id: 'flow.wait', icon: 'clock', name: 'Attendre…', desc: 'Pause fixe (heures/jours) avant la suite.' },
      { id: 'flow.exit', icon: 'flag', name: 'Terminer le workflow', desc: "Sortir de l'automatisation." },
    ],
  },
]

export const ALL_NODE_ITEMS: (NodeCatalogItem & { cat: NodeCat })[] = NODE_CATALOG.flatMap((s) =>
  s.items.map((i) => ({ ...i, cat: s.cat })),
)

export function catalogItem(typeId: string) {
  return ALL_NODE_ITEMS.find((i) => i.id === typeId)
}

export const CAT_LABEL: Record<NodeCat, string> = {
  trigger: 'Déclencheur',
  cond: 'Condition',
  action: 'Action',
  delay: 'Délai',
  manual: 'Manuel',
}

// ── Métadonnées de champs par entité (cnd.if_field) ────────────────────────
export interface EntityField {
  id: string
  label: string
  kind: 'text' | 'number' | 'email' | 'phone' | 'currency' | 'ref'
}

export const ENTITY_FIELDS: Record<string, EntityField[]> = {
  contacts: [
    { id: 'first_name', label: 'Prénom', kind: 'text' },
    { id: 'last_name', label: 'Nom', kind: 'text' },
    { id: 'email', label: 'Email', kind: 'email' },
    { id: 'tel', label: 'Téléphone', kind: 'phone' },
    { id: 'role_title', label: 'Poste', kind: 'text' },
  ],
  opportunities: [
    { id: 'titre', label: 'Titre', kind: 'text' },
    { id: 'value', label: 'Montant', kind: 'currency' },
    { id: 'mrr', label: 'MRR', kind: 'currency' },
    { id: 'stage_id', label: 'Stage', kind: 'ref' },
    { id: 'pipeline_id', label: 'Pipeline', kind: 'ref' },
  ],
}
