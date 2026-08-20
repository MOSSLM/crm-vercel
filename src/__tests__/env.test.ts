/**
 * @jest-environment node
 *
 * `env.ts` valide À L'IMPORT et se fige au premier chargement : chaque cas
 * exige donc `jest.resetModules()` puis un `import()` neuf. C'est aussi ce qui
 * rend le bug d'origine si coûteux — une variable mal formée ne se rattrape pas
 * à l'exécution, elle éteint le module pour toute la durée du processus.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGINAL = { ...process.env }

const BASE = {
  SUPABASE_URL: 'https://exemple.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  GMAPS_API_TOKEN: 'jeton',
  CRON_SECRET: 'secret-cron',
}

async function chargerAvec(vars: Record<string, string | undefined>) {
  jest.resetModules()
  process.env = { ...ORIGINAL, NODE_ENV: 'test' } as NodeJS.ProcessEnv
  for (const cle of Object.keys(process.env)) {
    if (/^(RESEND_|STRIPE_|ZADARMA_|RENDER_|GA4_|CLARITY_|GOOGLE_CALENDAR_|GMAPS_|PAGESPEED_|TELEPHONY_|SUPABASE_|CRON_|PG_CRON_)/.test(cle)) {
      delete process.env[cle]
    }
  }
  Object.assign(process.env, BASE, vars)
  return import('../env')
}

afterAll(() => {
  process.env = ORIGINAL
})

describe('src/env.ts', () => {
  // LE BUG DU 20/08/2026. `vercel env pull` écrit un placeholder sur les
  // variables marquées « Sensitive ». RESEND_FROM_EMAIL est la seule au format
  // strict : son placeholder a fait jeter le module, et `getServiceClient()`
  // l'importe — donc /api/telephony/me, /api/agent/journee et
  // /api/entreprises/perimetre ont rendu 500 sans envoyer un seul e-mail.
  it('ne meurt pas sur une variable optionnelle mal formée', async () => {
    const env = await chargerAvec({ RESEND_FROM_EMAIL: 'sensitive-placeholder' })
    expect(env.SUPABASE_URL).toBe(BASE.SUPABASE_URL)
    expect(env.RESEND_FROM_EMAIL).toBeUndefined()
  })

  // Un dégradé silencieux serait pire que la panne : on chercherait une heure
  // pourquoi aucun e-mail ne part alors que « la clé est bien posée ».
  it('dit ce qu’il a écarté, et pourquoi', async () => {
    const env = await chargerAvec({ RESEND_FROM_EMAIL: 'pas-une-adresse' })
    expect(env.VARIABLES_IGNOREES).toEqual([
      expect.objectContaining({ variable: 'RESEND_FROM_EMAIL' }),
    ])
  })

  it('écarte plusieurs variables mal formées d’un coup', async () => {
    const env = await chargerAvec({
      RESEND_FROM_EMAIL: 'x',
      RENDER_API_URL: 'pas-une-url',
      GMAPS_BASE_URL: 'pas-une-url-non-plus',
    })
    expect(env.VARIABLES_IGNOREES.map((v) => v.variable).sort()).toEqual([
      'GMAPS_BASE_URL',
      'RENDER_API_URL',
      'RESEND_FROM_EMAIL',
    ])
  })

  it('ne se plaint de rien quand tout est propre', async () => {
    const env = await chargerAvec({ RESEND_FROM_EMAIL: 'contact@samadigitalstudio.fr' })
    expect(env.VARIABLES_IGNOREES).toHaveLength(0)
    expect(env.RESEND_FROM_EMAIL).toBe('contact@samadigitalstudio.fr')
  })

  // La liste `DEGRADABLES` est un `Set<string>` : aucun typage ne rattrape une
  // faute de frappe, et une variable qui y figure sans dégrader vraiment ne se
  // découvrirait qu'en production, le jour où elle est mal formée. On les
  // éprouve donc TOUTES d'un coup, avec une valeur vide — qui échoue à `min(1)`
  // comme à `email()` et à `url()`.
  it('dégrade réellement chacune des variables déclarées dégradables', async () => {
    const source = readFileSync(join(__dirname, '..', 'env.ts'), 'utf8')
    const bloc = source.slice(source.indexOf('const DEGRADABLES = new Set(['))
    const noms = [...bloc.slice(0, bloc.indexOf(']);')).matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1])
    expect(noms.length).toBeGreaterThan(10)

    const vides = Object.fromEntries(noms.map((n) => [n, '']))
    const env = await chargerAvec(vides)
    expect(env.VARIABLES_IGNOREES.map((v) => v.variable).sort()).toEqual([...noms].sort())
  })

  // CE QUI DOIT RESTER FATAL. Sans clé Supabase, rien ne peut lire quoi que ce
  // soit : dégrader ici rendrait un CRM qui démarre et ne sait rien faire.
  it('jette toujours quand une variable critique manque', async () => {
    await expect(chargerAvec({ SUPABASE_SERVICE_ROLE_KEY: undefined })).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
  })

  it('jette toujours quand SUPABASE_URL n’est pas une URL', async () => {
    await expect(chargerAvec({ SUPABASE_URL: 'localhost' })).rejects.toThrow(/SUPABASE_URL/)
  })
})
