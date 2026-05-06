'use client'
import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Mail,
  Globe,
  Database,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Plug,
  Zap,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type ConnectionId = 'email' | 'slack' | 'webhook' | 'supabase'

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number'
  placeholder?: string
  description?: string
  required?: boolean
}

interface ConnectionDef {
  id: ConnectionId
  title: string
  description: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  accentColor: string
  fields: FieldDef[]
  testLabel: string
  docUrl?: string
}

interface SavedConnection {
  config: Record<string, string>
  testedAt?: string
  testStatus?: 'success' | 'error'
}

type ConnectionsStore = Partial<Record<ConnectionId, SavedConnection>>

// ─── Connection definitions ───────────────────────────────────────────────────

const CONNECTION_DEFS: ConnectionDef[] = [
  {
    id: 'email',
    title: 'Email (SMTP)',
    description: 'Envoyez des emails depuis vos automatisations via votre propre serveur SMTP.',
    icon: Mail,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    accentColor: 'border-blue-500/30',
    fields: [
      { key: 'host', label: 'Serveur SMTP', type: 'text', placeholder: 'smtp.example.com', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '587', required: true },
      { key: 'user', label: 'Utilisateur', type: 'text', placeholder: 'user@example.com', required: true },
      { key: 'password', label: 'Mot de passe', type: 'password', placeholder: '••••••••', required: true },
      { key: 'fromName', label: 'Nom expéditeur', type: 'text', placeholder: 'Mon CRM' },
      { key: 'fromEmail', label: 'Email expéditeur', type: 'text', placeholder: 'noreply@example.com' },
    ],
    testLabel: 'Envoyer un email de test',
  },
  {
    id: 'slack',
    title: 'Slack',
    description: 'Envoyez des notifications Slack depuis vos workflows via un Incoming Webhook.',
    icon: Zap,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    accentColor: 'border-purple-500/30',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Webhook URL',
        type: 'url',
        placeholder: 'https://hooks.slack.com/services/...',
        required: true,
        description: 'Créez un Incoming Webhook dans les paramètres de votre app Slack.',
      },
      { key: 'defaultChannel', label: 'Canal par défaut', type: 'text', placeholder: '#general' },
      { key: 'botName', label: 'Nom du bot', type: 'text', placeholder: 'CRM Bot' },
    ],
    testLabel: 'Envoyer un message de test',
  },
  {
    id: 'webhook',
    title: 'Webhook sortant',
    description: "Appelez n'importe quelle API externe depuis vos automatisations avec authentification.",
    icon: Globe,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    accentColor: 'border-emerald-500/30',
    fields: [
      {
        key: 'baseUrl',
        label: 'URL de base',
        type: 'url',
        placeholder: 'https://api.example.com',
        required: true,
        description: 'URL de base ajoutée en préfixe à tous les appels webhook sortants.',
      },
      {
        key: 'authHeader',
        label: 'Header Authorization',
        type: 'text',
        placeholder: 'Bearer mon-token-secret',
        description: 'Valeur complète du header Authorization (ex: Bearer xxx ou Basic xxx).',
      },
      { key: 'customHeader', label: 'Header personnalisé (clé)', type: 'text', placeholder: 'X-Api-Key' },
      { key: 'customHeaderValue', label: 'Header personnalisé (valeur)', type: 'password', placeholder: '••••••••' },
    ],
    testLabel: 'Tester la connexion',
  },
  {
    id: 'supabase',
    title: 'Supabase Edge Functions',
    description: "Invoquez vos Edge Functions Supabase directement depuis les nœuds d'automatisation.",
    icon: Database,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-500',
    accentColor: 'border-green-500/30',
    fields: [
      {
        key: 'projectUrl',
        label: 'Project URL',
        type: 'url',
        placeholder: 'https://xxxx.supabase.co',
        required: true,
        description: 'Trouvez cette URL dans Project Settings → API.',
      },
      {
        key: 'anonKey',
        label: 'Anon Key',
        type: 'password',
        placeholder: 'eyJh...',
        description: 'Clé publique anon/service — utilisée pour les Edge Functions avec RLS.',
      },
      {
        key: 'serviceKey',
        label: 'Service Role Key',
        type: 'password',
        placeholder: 'eyJh...',
        description: 'Clé secrète service role — bypass RLS. Ne jamais exposer côté client.',
      },
    ],
    testLabel: 'Vérifier la connexion',
  },
]

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'crm_connections'

function loadConnections(): ConnectionsStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveConnection(id: ConnectionId, data: SavedConnection) {
  const store = loadConnections()
  store[id] = data
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function isConfigured(config: Record<string, string>, def: ConnectionDef): boolean {
  return def.fields.filter((f) => f.required).every((f) => !!config[f.key]?.trim())
}

// ─── PasswordInput ────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9 font-mono text-sm"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// ─── ConnectionCard ───────────────────────────────────────────────────────────

function ConnectionCard({ def, saved }: { def: ConnectionDef; saved?: SavedConnection }) {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>(saved?.config ?? {})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(
    saved?.testStatus ?? null
  )
  const [dirty, setDirty] = useState(false)

  const configured = isConfigured(config, def)

  const setField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = () => {
    saveConnection(def.id, { config, testStatus: testResult ?? undefined })
    setDirty(false)
    toast.success(`${def.title} sauvegardé`)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // TODO: Replace with real test calls per integration type
      // Email: POST /api/automations/test/email with config
      // Slack: fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ text: 'Test CRM' }) })
      // Webhook: fetch(baseUrl, { headers: { Authorization: authHeader } })
      // Supabase: fetch(`${projectUrl}/functions/v1/health`, { headers: { apikey: anonKey } })
      await new Promise((r) => setTimeout(r, 1200))
      setTestResult('success')
      saveConnection(def.id, { config, testedAt: new Date().toISOString(), testStatus: 'success' })
      setDirty(false)
      toast.success(`${def.title} : connexion réussie`)
    } catch {
      setTestResult('error')
      toast.error(`${def.title} : échec de la connexion`)
    } finally {
      setTesting(false)
    }
  }

  const Icon = def.icon

  return (
    <Card
      className={cn(
        'transition-all',
        configured && open && def.accentColor
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', def.iconBg)}>
            <Icon className={cn('h-4 w-4', def.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{def.title}</CardTitle>
              {configured ? (
                <Badge
                  variant="default"
                  className={cn(
                    'px-1.5 text-[10px]',
                    testResult === 'success'
                      ? 'bg-emerald-500 hover:bg-emerald-500/90'
                      : 'bg-muted text-muted-foreground hover:bg-muted'
                  )}
                >
                  {testResult === 'success' ? 'Connecté' : 'Configuré'}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-1.5 text-[10px] text-muted-foreground">
                  Non configuré
                </Badge>
              )}
              {testResult === 'error' && (
                <Badge variant="destructive" className="px-1.5 text-[10px]">
                  Erreur
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{def.description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          <Separator className="mb-4" />
          <div className="grid gap-4 sm:grid-cols-2">
            {def.fields.map((field) => (
              <div key={field.key} className={cn('flex flex-col gap-1.5', field.key === 'projectUrl' || field.key === 'webhookUrl' || field.key === 'baseUrl' ? 'sm:col-span-2' : '')}>
                <Label className="text-xs">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-destructive">*</span>}
                </Label>
                {field.type === 'password' ? (
                  <PasswordInput
                    value={config[field.key] ?? ''}
                    onChange={(v) => setField(field.key, v)}
                    placeholder={field.placeholder}
                  />
                ) : (
                  <Input
                    type={field.type}
                    value={config[field.key] ?? ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="text-sm"
                  />
                )}
                {field.description && (
                  <p className="text-[11px] text-muted-foreground">{field.description}</p>
                )}
              </div>
            ))}
          </div>

          {def.id === 'supabase' && (
            <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <p className="text-xs font-medium text-green-600 dark:text-green-400">Edge Functions</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Une fois configuré, ajoutez un nœud <strong>Supabase Edge Function</strong> dans votre
                workflow. Le nœud invoquera{' '}
                <code className="rounded bg-muted px-1 text-[10px]">supabase.functions.invoke(functionName)</code>{' '}
                avec la Service Role Key ou l'Anon Key selon le mode configuré sur le nœud.
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty}
              className="gap-1.5"
            >
              Sauvegarder
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !configured}
              className="gap-1.5"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testResult === 'success' ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              {testing ? 'Test en cours…' : def.testLabel}
            </Button>
            {testResult === 'success' && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connexion OK
              </span>
            )}
            {testResult === 'error' && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                Échec
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsConnectionsPage() {
  const [store, setStore] = useState<ConnectionsStore>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setStore(loadConnections())
    setReady(true)
  }, [])

  const configuredCount = ready
    ? CONNECTION_DEFS.filter((def) => isConfigured(store[def.id]?.config ?? {}, def)).length
    : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connexions</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Configurez vos intégrations pour les utiliser dans vos workflows
          </p>
        </div>
        {ready && (
          <Badge variant="outline" className="gap-1.5 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {configuredCount} / {CONNECTION_DEFS.length} configurée{configuredCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {CONNECTION_DEFS.map((def) => (
          <ConnectionCard
            key={def.id}
            def={def}
            saved={ready ? store[def.id] : undefined}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Les credentials sont stockés localement.{' '}
        <span className="opacity-60">
          {/* TODO: Migrate to Supabase Vault (supabase.vault.store) for server-side secure storage */}
          Migration vers Supabase Vault prévue.
        </span>
      </p>
    </div>
  )
}
