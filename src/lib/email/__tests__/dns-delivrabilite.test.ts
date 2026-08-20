import { verifierDomaine, SELECTEURS_DKIM, type Resolveur } from '../dns-delivrabilite'

/** Un DNS de papier : ce qui n'est pas déclaré n'existe pas. */
const dns = (zone: Record<string, string[]>, mx: Record<string, { exchange: string; priority: number }[]> = {}): Resolveur => ({
  txt: async (nom) => zone[nom] ?? [],
  mx: async (nom) => mx[nom] ?? [],
})

// Les deux domaines réels, relevés le 19/08/2026. Ils tiennent lieu de cas
// d'école parce qu'ils illustrent les deux rôles ET les deux pièges.
const FR = 'samadigitalstudio.fr'
const COM = 'samadigitalstudio.com'

const zoneFr = {
  [`resend._domainkey.${FR}`]: [
    'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDs6j/3E8IlMoQJxfmIpgbE4hr6Y/3s4XhC/+0By4dFOB/UwtNhnAfKkERDg8EM9MgFCqPz3A6Sedfizi+1cVIvWcsL6ksj0FS0IB8vkKDE7ujlLOZyjcIWADYXXQxToXvjEFCU5aYAIX8Lt3/fa/tfiHVJnZ+3tQ/GdJ5xEHMRPQIDAQAB',
  ],
  [`send.${FR}`]: ['v=spf1 include:amazonses.com ~all'],
}

describe('le domaine d’envoi, tel qu’il est vraiment configuré', () => {
  it('trouve le DKIM de Resend — le sélecteur manquait au portage d’origine', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR)
    expect(r.dkim.ok).toBe(true)
    expect(r.dkim.valeur).toContain('resend')
    expect(SELECTEURS_DKIM[0]).toBe('resend')
  })

  // SPF est évalué sur l'ENVELOPPE, pas sur l'en-tête `From`. Resend délègue le
  // Return-Path à `send.<domaine>` : une racine sans SPF n'est donc pas une faute.
  it('accepte un SPF porté par le sous-domaine d’enveloppe', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR)
    expect(r.spf.ok).toBe(true)
    expect(r.spf.valeur).toContain(`send.${FR}`)
    expect(r.spf.note).toMatch(/Return-Path/)
  })

  it('ne cherche l’enveloppe que pour un domaine d’envoi', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR, { role: 'reception' })
    expect(r.spf.ok).toBe(false)
  })

  // LE CONSTAT QUI COMPTE : notre domaine d'envoi n'a AUCUN DMARC, et Google
  // comme Yahoo l'exigent depuis février 2024 de tout expéditeur en volume.
  it('signale l’absence de DMARC comme bloquante, en disant pourquoi', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR)
    expect(r.dmarc.ok).toBe(false)
    expect(r.dmarc.erreur).toMatch(/Google et Yahoo/)
    expect(r.bloquants).toContain('DMARC')
    expect(r.ok).toBe(false)
  })

  // Un domaine qui n'envoie que n'a pas besoin de MX — mais les avis de
  // non-remise reviennent à l'expéditeur, et sans MX ils tombent dans le vide.
  it('ne bloque pas sur un MX absent quand le domaine ne fait qu’envoyer, mais le dit', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR)
    expect(r.mx.ok).toBe(true)
    expect(r.mx.note).toMatch(/non-remise/)
    expect(r.bloquants).not.toContain('MX')
  })

  it('bloque sur un MX absent quand le domaine doit recevoir', async () => {
    const r = await verifierDomaine(dns(zoneFr), FR, { role: 'reception' })
    expect(r.mx.ok).toBe(false)
    expect(r.bloquants).toContain('MX')
  })
})

describe('le domaine des boîtes', () => {
  const zoneCom = {
    [COM]: ['v=spf1 mx:samadigitalstudio.com a:mail.samadigitalstudio.com a:mailphp.lws-hosting.com -all'],
    [`_dmarc.${COM}`]: ['v=DMARC1; p=quarantine;'],
  }
  const mxCom = { [COM]: [{ exchange: 'mail.samadigitalstudio.com', priority: 10 }] }

  it('valide MX, SPF et DMARC — mais réclame les rapports', async () => {
    const r = await verifierDomaine(dns(zoneCom, mxCom), COM, { role: 'reception' })
    expect(r.ok).toBe(true)
    expect(r.spf.valeur).toContain('-all')
    // Pas de `rua=` : personne ne saura jamais qui usurpe le domaine.
    expect(r.dmarc.note).toMatch(/rua/)
  })

  it('ne trouve aucun DKIM, et ne bloque pas pour autant', async () => {
    const r = await verifierDomaine(dns(zoneCom, mxCom), COM, { role: 'reception' })
    expect(r.dkim.ok).toBe(false)
    expect(r.dkim.erreur).toMatch(/faux négatif/)
    expect(r.bloquants).not.toContain('DKIM')
  })
})

describe('les fautes de SPF', () => {
  it('refuse deux SPF publiés — SPF est alors cassé, pas doublé', async () => {
    const r = await verifierDomaine(dns({ 'x.fr': ['v=spf1 include:a -all', 'v=spf1 include:b -all'] }), 'x.fr')
    expect(r.spf.ok).toBe(false)
    expect(r.spf.erreur).toMatch(/il n’en faut qu’un/)
  })

  it('refuse au-delà de dix résolutions DNS — SPF rendrait permerror', async () => {
    const trop = 'v=spf1 ' + Array.from({ length: 11 }, (_, i) => `include:s${i}.fr`).join(' ') + ' -all'
    const r = await verifierDomaine(dns({ 'x.fr': [trop] }), 'x.fr')
    expect(r.spf.ok).toBe(false)
    expect(r.spf.erreur).toMatch(/permerror/)
  })

  it('accepte ~all en le disant, refuse l’absence de « all »', async () => {
    const doux = await verifierDomaine(dns({ 'x.fr': ['v=spf1 include:a.fr ~all'] }), 'x.fr')
    expect(doux.spf.ok).toBe(true)
    expect(doux.spf.note).toMatch(/-all/)

    const sansAll = await verifierDomaine(dns({ 'x.fr': ['v=spf1 include:a.fr'] }), 'x.fr')
    expect(sansAll.spf.ok).toBe(false)
  })
})

describe('les fautes de DMARC', () => {
  it('refuse un DMARC sans règle', async () => {
    const r = await verifierDomaine(dns({ '_dmarc.x.fr': ['v=DMARC1; rua=mailto:a@x.fr'] }), 'x.fr')
    expect(r.dmarc.ok).toBe(false)
    expect(r.dmarc.erreur).toMatch(/sans règle/)
  })

  it('accepte p=none en disant que c’est un point de départ', async () => {
    const r = await verifierDomaine(dns({ '_dmarc.x.fr': ['v=DMARC1; p=none; rua=mailto:a@x.fr'] }), 'x.fr')
    expect(r.dmarc.ok).toBe(true)
    expect(r.dmarc.note).toMatch(/durcir/)
  })
})

describe('un DNS muet ne fait pas tomber le contrôle', () => {
  it('rend un rapport complet quand le résolveur échoue', async () => {
    const casse: Resolveur = {
      txt: async () => { throw new Error('SERVFAIL') },
      mx: async () => { throw new Error('SERVFAIL') },
    }
    const r = await verifierDomaine(casse, 'x.fr')
    expect(r.ok).toBe(false)
    expect(r.bloquants).toEqual(['SPF', 'DMARC'])
  })
})
