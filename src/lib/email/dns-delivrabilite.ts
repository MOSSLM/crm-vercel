// dns-delivrabilite.ts — l'état d'authentification d'un domaine expéditeur.
//
// PORTÉ DEPUIS LE RÉCHAUFFEUR (`/Users/matt/Code/email-warmup/src/lib/dns-check.ts`),
// et corrigé sur trois points que notre configuration réelle a révélés.
//
// CE QUE LA MESURE DU 19/08/2026 A MONTRÉ SUR NOS DEUX DOMAINES
//
//   samadigitalstudio.fr   — le domaine d'ENVOI (Resend). DKIM présent
//     (`resend._domainkey`), Return-Path délégué à `send.` qui porte
//     `include:amazonses.com`. Mais AUCUN DMARC, et aucun MX.
//
//   samadigitalstudio.com  — le domaine des BOÎTES (LWS). SPF en `-all` SANS
//     Resend, DMARC en `p=quarantine`, MX vers `mail.samadigitalstudio.com`.
//
// TROIS CORRECTIONS PAR RAPPORT AU PORTAGE D'ORIGINE
//
// 1. **Le sélecteur `resend` manquait** dans la liste devinée : le contrôle
//    rendait un faux négatif sur notre propre domaine d'envoi.
// 2. **SPF ne se lit pas sur le domaine d'en-tête quand le Return-Path est
//    délégué.** Resend fait signer l'enveloppe par `send.<domaine>` : c'est LÀ
//    que SPF est évalué, et un domaine racine sans SPF n'est pas une faute.
// 3. **Un MX absent ne veut pas dire la même chose selon le rôle.** Pour un
//    domaine de boîtes, c'est bloquant. Pour un domaine qui ne fait qu'envoyer,
//    c'est un avertissement — mais un vrai : les avis de non-remise reviennent
//    à l'adresse d'expéditeur, et sans MX ils tombent dans le vide.
//
// On n'énumère jamais le DNS : les sélecteurs DKIM se devinent, et c'est
// pourquoi DKIM n'est jamais bloquant.

/** Ce que le module a besoin de savoir demander. Injecté, donc testable sans réseau. */
export interface Resolveur {
  txt(nom: string): Promise<string[]>
  mx(nom: string): Promise<{ exchange: string; priority: number }[]>
}

export type Role = 'envoi' | 'reception'

export interface Constat {
  ok: boolean
  valeur?: string
  erreur?: string
  note?: string
}

export interface RapportDns {
  domaine: string
  role: Role
  mx: Constat
  spf: Constat
  dkim: Constat
  dmarc: Constat
  ok: boolean
  /** Ce qui empêche d'envoyer sereinement — pas ce qui est perfectible. */
  bloquants: string[]
}

/**
 * Sélecteurs DKIM courants. `resend` en tête : c'est le nôtre, et l'oublier
 * faisait dire « aucun DKIM » d'un domaine correctement signé.
 */
export const SELECTEURS_DKIM = [
  'resend', 'google', 'selector1', 'selector2', 'k1', 'k2', 'default',
  'mail', 'dkim', 's1', 's2', 'zoho', 'protonmail', 'mandrill', 'sm',
] as const

const estSpf = (r: string) => r.toLowerCase().startsWith('v=spf1')

async function verifierMx(r: Resolveur, domaine: string, role: Role): Promise<Constat> {
  const records = await r.mx(domaine).catch(() => [])
  if (records.length === 0) {
    return role === 'reception'
      ? { ok: false, erreur: 'Aucun MX — ce domaine ne peut recevoir aucun courrier.' }
      : {
          ok: true,
          erreur: undefined,
          note:
            'Aucun MX. Le domaine n’envoie que : acceptable, mais les avis de non-remise ' +
            'renvoyés à l’adresse d’expéditeur n’arriveront nulle part.',
        }
  }
  const meilleur = [...records].sort((a, b) => a.priority - b.priority)[0]
  return { ok: true, valeur: `${meilleur.exchange} (priorité ${meilleur.priority})` }
}

/**
 * SPF, en tenant compte du Return-Path délégué.
 *
 * `sousDomaineEnveloppe` est le domaine que l'expéditeur utilise comme
 * enveloppe — `send.<domaine>` chez Resend. Quand il porte un SPF valide, le
 * domaine racine n'a pas à en porter un : SPF est évalué sur l'enveloppe, pas
 * sur l'en-tête `From`.
 */
async function verifierSpf(
  r: Resolveur,
  domaine: string,
  sousDomaineEnveloppe: string | null,
): Promise<Constat> {
  const surLaRacine = (await r.txt(domaine).catch(() => [])).filter(estSpf)

  if (surLaRacine.length === 0 && sousDomaineEnveloppe) {
    const surLEnveloppe = (await r.txt(`${sousDomaineEnveloppe}.${domaine}`).catch(() => [])).filter(estSpf)
    if (surLEnveloppe.length > 0) {
      return {
        ok: true,
        valeur: `${sousDomaineEnveloppe}.${domaine} : ${surLEnveloppe[0]}`,
        note: 'SPF porté par le sous-domaine d’enveloppe (Return-Path) — c’est là qu’il est évalué.',
      }
    }
  }

  if (surLaRacine.length === 0) return { ok: false, erreur: 'Aucun enregistrement SPF.' }
  if (surLaRacine.length > 1) {
    return {
      ok: false,
      valeur: surLaRacine.join(' | '),
      erreur: `${surLaRacine.length} SPF publiés — SPF est cassé, il n’en faut qu’un.`,
    }
  }

  const valeur = surLaRacine[0]
  // La limite de 10 résolutions DNS est dure : au-delà, SPF rend `permerror` et
  // le message est traité comme non authentifié.
  const resolutions = (valeur.match(/\b(include|a|mx|ptr|exists|redirect)[:=]/g) ?? []).length
  if (resolutions > 10) {
    return { ok: false, valeur, erreur: `${resolutions} résolutions DNS (10 au maximum) — SPF rendra permerror.` }
  }
  if (/[~?]all\s*$/.test(valeur)) {
    return { ok: true, valeur, note: 'Se termine par ~all ou ?all — passer à -all une fois la configuration stabilisée.' }
  }
  if (!/-all\s*$/.test(valeur)) return { ok: false, valeur, erreur: 'Aucun mécanisme « all » final.' }
  return { ok: true, valeur }
}

async function verifierDkim(r: Resolveur, domaine: string): Promise<Constat> {
  for (const selecteur of SELECTEURS_DKIM) {
    const records = await r.txt(`${selecteur}._domainkey.${domaine}`).catch(() => [])
    const trouve = records.find((t) => t.toLowerCase().includes('p='))
    if (!trouve) continue
    const cle = /p=([A-Za-z0-9+/=]{1,400})(;|$)/.exec(trouve)
    return {
      ok: true,
      valeur: `sélecteur « ${selecteur} »`,
      note: cle && cle[1].length < 250 ? 'Clé courte (1024 bits ?) — préférer 2048 bits.' : undefined,
    }
  }
  return {
    ok: false,
    erreur:
      `Aucun DKIM sur les sélecteurs courants (${SELECTEURS_DKIM.slice(0, 5).join(', ')}…). ` +
      'Un sélecteur personnalisé donne un faux négatif : ce contrôle ne bloque donc jamais.',
  }
}

async function verifierDmarc(r: Resolveur, domaine: string): Promise<Constat> {
  const records = (await r.txt(`_dmarc.${domaine}`).catch(() => [])).filter((t) =>
    t.toLowerCase().startsWith('v=dmarc1'),
  )
  if (records.length === 0) {
    return {
      ok: false,
      erreur:
        'Aucun DMARC. Depuis février 2024, Google et Yahoo l’EXIGENT de tout expéditeur en volume — ' +
        'même un simple « v=DMARC1; p=none; » suffit à être en règle.',
    }
  }
  const valeur = records[0]
  const regle = /p=(none|quarantine|reject)/i.exec(valeur)?.[1]?.toLowerCase()
  if (!regle) return { ok: false, valeur, erreur: 'DMARC publié sans règle « p= ».' }

  const notes: string[] = []
  if (regle === 'none') notes.push('p=none : bon pour démarrer, à durcir ensuite en quarantine puis reject')
  if (!/rua=/i.test(valeur)) notes.push('pas de rua= : aucun rapport ne vous reviendra')
  return { ok: true, valeur, note: notes.length ? notes.join(' · ') : undefined }
}

/**
 * L'état d'un domaine, du point de vue de ce qu'on lui demande.
 *
 * `role: 'envoi'` — le domaine d'où partent les e-mails de prospection.
 * `role: 'reception'` — celui qui porte les boîtes et reçoit les réponses.
 *
 * DKIM ne bloque jamais (sélecteurs devinés). MX ne bloque que pour un domaine
 * de réception. SPF et DMARC bloquent dans les deux cas : sans eux, un message
 * en volume part au dossier indésirable, quel que soit son contenu.
 */
export async function verifierDomaine(
  resolveur: Resolveur,
  domaine: string,
  options: { role?: Role; sousDomaineEnveloppe?: string | null } = {},
): Promise<RapportDns> {
  const role = options.role ?? 'envoi'
  // `send` est la convention de Resend ; on la passe explicitement pour ne pas
  // la supposer d'un domaine qui n'envoie pas par eux.
  const enveloppe = options.sousDomaineEnveloppe === undefined ? 'send' : options.sousDomaineEnveloppe

  const [mx, spf, dkim, dmarc] = await Promise.all([
    verifierMx(resolveur, domaine, role),
    verifierSpf(resolveur, domaine, role === 'envoi' ? enveloppe : null),
    verifierDkim(resolveur, domaine),
    verifierDmarc(resolveur, domaine),
  ])

  const bloquants: string[] = []
  if (!spf.ok) bloquants.push('SPF')
  if (!dmarc.ok) bloquants.push('DMARC')
  if (!mx.ok) bloquants.push('MX')

  return { domaine, role, mx, spf, dkim, dmarc, ok: bloquants.length === 0, bloquants }
}

/** Le résolveur réel. Isolé ici : tout le reste du module se teste sans réseau. */
export function resolveurSysteme(): Resolveur {
  return {
    async txt(nom) {
      const { Resolver } = await import('node:dns/promises')
      const r = new Resolver({ timeout: 5000, tries: 2 })
      const records = await r.resolveTxt(nom)
      return records.map((morceaux) => morceaux.join(''))
    },
    async mx(nom) {
      const { Resolver } = await import('node:dns/promises')
      const r = new Resolver({ timeout: 5000, tries: 2 })
      return r.resolveMx(nom)
    },
  }
}
