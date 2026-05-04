import type { AutomationNodeType, NodeCategory } from './types'

export type ConfigField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'code'
  placeholder?: string
  options?: { label: string; value: string }[]
  description?: string
}

export type NodeDefinition = {
  label: string
  description: string
  category: NodeCategory
  iconName: string
  colorClass: string
  bgClass: string
  borderClass: string
  configFields: ConfigField[]
}

export const NODE_DEFINITIONS: Record<AutomationNodeType, NodeDefinition> = {
  trigger_contact_created: {
    label: 'Contact créé',
    description: 'Déclenche quand un nouveau contact est ajouté',
    category: 'trigger',
    iconName: 'UserPlus',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'filterSource', label: 'Source (optionnel)', type: 'text', placeholder: 'ex: linkedin, web...' },
    ],
  },
  trigger_deal_created: {
    label: 'Opportunité créée',
    description: 'Déclenche quand une opportunité est créée',
    category: 'trigger',
    iconName: 'Briefcase',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'pipeline', label: 'Pipeline', type: 'text', placeholder: 'Tous les pipelines' },
    ],
  },
  trigger_stage_changed: {
    label: 'Étape changée',
    description: 'Déclenche quand un deal change de statut',
    category: 'trigger',
    iconName: 'GitBranch',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'fromStage', label: "De l'étape", type: 'text', placeholder: 'Toutes les étapes' },
      { key: 'toStage', label: "Vers l'étape", type: 'text', placeholder: 'Toutes les étapes' },
    ],
  },
  trigger_webhook: {
    label: 'Webhook entrant',
    description: 'Reçoit des données via une URL webhook unique',
    category: 'trigger',
    iconName: 'Webhook',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'secret', label: 'Secret de validation', type: 'text', placeholder: 'Généré automatiquement' },
    ],
  },
  trigger_scheduled: {
    label: 'Planification',
    description: 'Déclenche selon un calendrier (cron)',
    category: 'trigger',
    iconName: 'Clock',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'cron', label: 'Expression cron', type: 'text', placeholder: '0 9 * * 1-5' },
      { key: 'timezone', label: 'Fuseau horaire', type: 'text', placeholder: 'Europe/Paris' },
    ],
  },
  trigger_email_received: {
    label: 'Email reçu',
    description: "Déclenche à la réception d'un email",
    category: 'trigger',
    iconName: 'Mail',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/40',
    configFields: [
      { key: 'fromFilter', label: 'Filtre expéditeur', type: 'text', placeholder: '@exemple.com' },
      { key: 'subjectFilter', label: 'Filtre sujet', type: 'text', placeholder: 'Mots-clés...' },
    ],
  },
  action_send_email: {
    label: 'Envoyer email',
    description: 'Envoie un email via Resend',
    category: 'action',
    iconName: 'Send',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      { key: 'to', label: 'Destinataire', type: 'text', placeholder: '{{contact.email}}' },
      { key: 'subject', label: 'Sujet', type: 'text', placeholder: "Objet de l'email" },
      { key: 'body', label: 'Corps', type: 'textarea', placeholder: "Corps de l'email..." },
    ],
  },
  action_update_contact: {
    label: 'Mettre à jour contact',
    description: "Modifie les champs d'un contact",
    category: 'action',
    iconName: 'UserCog',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      {
        key: 'field',
        label: 'Champ à modifier',
        type: 'select',
        options: [
          { label: 'Statut', value: 'status' },
          { label: 'Tags', value: 'tags' },
          { label: 'Score', value: 'score' },
          { label: 'Pipeline', value: 'pipeline' },
        ],
      },
      { key: 'value', label: 'Nouvelle valeur', type: 'text', placeholder: 'Valeur' },
    ],
  },
  action_create_task: {
    label: 'Créer tâche',
    description: 'Crée une tâche dans le CRM',
    category: 'action',
    iconName: 'CheckSquare',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      { key: 'title', label: 'Titre', type: 'text', placeholder: 'Relancer {{contact.name}}' },
      { key: 'assignee', label: 'Assigné à', type: 'text', placeholder: 'Utilisateur...' },
      { key: 'dueInDays', label: 'Délai (jours)', type: 'number', placeholder: '3' },
    ],
  },
  action_add_to_pipeline: {
    label: 'Ajouter au pipeline',
    description: 'Ajoute ou déplace dans un pipeline',
    category: 'action',
    iconName: 'FolderKanban',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      { key: 'pipeline', label: 'Pipeline', type: 'text', placeholder: 'Nom du pipeline' },
      { key: 'stage', label: 'Étape', type: 'text', placeholder: 'Étape cible' },
    ],
  },
  action_slack_notification: {
    label: 'Notification Slack',
    description: 'Envoie un message dans Slack',
    category: 'action',
    iconName: 'MessageSquare',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      { key: 'channel', label: 'Canal', type: 'text', placeholder: '#sales' },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Nouveau contact: {{contact.name}}',
      },
    ],
  },
  action_webhook_out: {
    label: 'Webhook sortant',
    description: 'Envoie des données vers une URL externe',
    category: 'action',
    iconName: 'Globe',
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/40',
    configFields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://...' },
      {
        key: 'method',
        label: 'Méthode HTTP',
        type: 'select',
        options: [
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'PATCH', value: 'PATCH' },
        ],
      },
      {
        key: 'payload',
        label: 'Payload JSON',
        type: 'code',
        placeholder: '{"contactId": "{{contact.id}}"}',
      },
    ],
  },
  action_condition: {
    label: 'Condition',
    description: 'Branche le flux selon une condition',
    category: 'action',
    iconName: 'GitFork',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/40',
    configFields: [
      { key: 'field', label: 'Champ', type: 'text', placeholder: '{{contact.score}}' },
      {
        key: 'operator',
        label: 'Opérateur',
        type: 'select',
        options: [
          { label: 'Égal à', value: 'eq' },
          { label: 'Différent de', value: 'neq' },
          { label: 'Supérieur à', value: 'gt' },
          { label: 'Inférieur à', value: 'lt' },
          { label: 'Contient', value: 'contains' },
        ],
      },
      { key: 'value', label: 'Valeur de comparaison', type: 'text', placeholder: '50' },
    ],
  },
  action_wait: {
    label: 'Attendre',
    description: 'Met le flux en pause pour une durée définie',
    category: 'action',
    iconName: 'Timer',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/40',
    configFields: [
      { key: 'duration', label: 'Durée', type: 'number', placeholder: '24' },
      {
        key: 'unit',
        label: 'Unité',
        type: 'select',
        options: [
          { label: 'Minutes', value: 'minutes' },
          { label: 'Heures', value: 'hours' },
          { label: 'Jours', value: 'days' },
        ],
      },
    ],
  },
  supabase_edge_function: {
    label: 'Edge Function',
    description: 'Lance une Supabase Edge Function',
    category: 'supabase',
    iconName: 'Zap',
    colorClass: 'text-green-400',
    bgClass: 'bg-green-400/10',
    borderClass: 'border-green-400/40',
    configFields: [
      {
        key: 'functionName',
        label: 'Nom de la fonction',
        type: 'text',
        placeholder: 'my-edge-function',
        description: 'Nom exact de votre Edge Function Supabase deployée',
      },
      {
        key: 'payload',
        label: 'Payload (JSON)',
        type: 'code',
        placeholder: '{\n  "contactId": "{{contact.id}}"\n}',
        description: 'Données envoyées à la fonction. Utilisez {{variable}} pour les données dynamiques.',
      },
      {
        key: 'authMode',
        label: 'Authentification',
        type: 'select',
        options: [
          { label: 'Clé service (recommandé)', value: 'service' },
          { label: 'Clé anonyme', value: 'anon' },
        ],
      },
    ],
  },
  supabase_sql_query: {
    label: 'Requête SQL',
    description: 'Exécute une requête sur la base Supabase',
    category: 'supabase',
    iconName: 'Database',
    colorClass: 'text-green-400',
    bgClass: 'bg-green-400/10',
    borderClass: 'border-green-400/40',
    configFields: [
      {
        key: 'query',
        label: 'Requête SQL',
        type: 'code',
        placeholder: "SELECT * FROM contacts\nWHERE id = '{{contact.id}}'",
      },
      { key: 'outputVar', label: 'Stocker le résultat dans', type: 'text', placeholder: 'queryResult' },
    ],
  },
  ai_qualification: {
    label: 'IA Qualification',
    description: 'Score et qualifie automatiquement un contact',
    category: 'ai',
    iconName: 'BrainCircuit',
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/40',
    configFields: [
      {
        key: 'criteria',
        label: 'Critères de qualification',
        type: 'textarea',
        placeholder: 'Décrivez vos critères de qualification...',
      },
      {
        key: 'model',
        label: 'Modèle IA',
        type: 'select',
        options: [
          { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
          { label: 'Claude Haiku 4.5 (rapide)', value: 'claude-haiku-4-5-20251001' },
        ],
      },
      { key: 'outputField', label: 'Stocker le score dans', type: 'text', placeholder: 'ai_score' },
    ],
  },
  ai_email_draft: {
    label: 'IA Email',
    description: "Rédige un email personnalisé via l'IA",
    category: 'ai',
    iconName: 'Sparkles',
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
    borderClass: 'border-purple-500/40',
    configFields: [
      {
        key: 'prompt',
        label: 'Instructions',
        type: 'textarea',
        placeholder: 'Rédigez un email de prospection pour {{contact.company}}...',
      },
      {
        key: 'tone',
        label: 'Ton',
        type: 'select',
        options: [
          { label: 'Professionnel', value: 'professional' },
          { label: 'Décontracté', value: 'casual' },
          { label: 'Persuasif', value: 'persuasive' },
        ],
      },
      {
        key: 'model',
        label: 'Modèle IA',
        type: 'select',
        options: [
          { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
          { label: 'Claude Haiku 4.5 (rapide)', value: 'claude-haiku-4-5-20251001' },
        ],
      },
    ],
  },
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: 'Déclencheurs',
  action: 'Actions',
  supabase: 'Supabase',
  ai: 'Intelligence Artificielle',
}

export const CATEGORY_ORDER: NodeCategory[] = ['trigger', 'action', 'supabase', 'ai']
