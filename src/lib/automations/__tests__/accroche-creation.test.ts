/**
 * « Votre site » n'existe pas toujours.
 *
 * LE DÉFAUT, MESURÉ
 * Les trois modèles WhatsApp qui portent la démo disaient tous « une version
 * plus vendeuse de VOTRE site ». Or 797 entreprises du parc n'ont pas de site
 * (constat `absent` ou hôte qui n'en est pas un), et 34 240 n'ont jamais été
 * regardées. Le message le plus visible qu'on envoie affirmait donc quelque
 * chose de faux à une partie du fichier — et il part chez le prospect, pas dans
 * un journal.
 *
 * LA VARIABLE N'EST PAS L'URL
 * `company.website` est la COLONNE, et elle ment dans les deux sens : 67
 * entreprises portent une URL avec un constat `absent`, et une colonne vide ne
 * prouve rien. `company.site_present` / `company.site_absent` portent la
 * MESURE, lue dans `v_entreprises_presence_site`.
 *
 * DEUX VARIABLES POUR TROIS ÉTATS, et c'est la leçon de ce fichier. La première
 * version en posait UNE, valant « oui » ou « non » — et le test « parle de
 * création à qui n'en a pas » a rougi tout de suite : `{% si %}` teste une
 * PRÉSENCE, or « non » est une chaîne présente. Le prospect sans site lisait
 * « votre site ». Avec deux variables, « les deux vides » dit « personne n'a
 * regardé », et aucun opérateur n'a eu à être ajouté au langage.
 *
 * ET LE VIDE PREND LA VOIE « SINON » — celle écrite pour quelqu'un dont on ne
 * sait rien. C'est le bon côté de l'erreur : proposer un site à qui en a déjà
 * un se corrige d'un mot, affirmer « votre site » à qui n'en a pas, non.
 */
import { rendreConditionnels, rendreMessage } from '../redaction'

/** Copie des corps en base au 20/08/2026 (`whatsapp_templates`). */
const ENVOI_DEMO =
  '{% si company.site_present %}Très bien, je me suis permis de faire une version plus vendeuse de votre site, avec vos informations :{% sinon %}Très bien, je me suis permis de vous faire un site, avec vos informations :{% fin %}\n\n{{company.demo_url}}'

const RELANCE_SILENCE =
  'Bonjour, je me permets de revenir vers vous.\n\n{% si company.site_present %}J’ai préparé une version plus vendeuse du site de {{company.name}} :{% sinon %}J’ai préparé un site pour {{company.name}}, vous pouvez le voir ici :{% fin %}\n\n{{company.demo_url}}'

/**
 * Les trois états, tels que `buildVars` les pose : présent, absent, et « les
 * DEUX vides » — personne n'a regardé.
 */
const varsDe = (etat: 'present' | 'absent' | 'inconnu') => ({
  'company.site_present': etat === 'present' ? 'oui' : '',
  'company.site_absent': etat === 'absent' ? 'oui' : '',
  'company.name': 'Toiture Martin',
  'company.demo_url': 'https://toituremartin.samadigitalstudio.fr',
})

describe('l’accroche s’adapte à ce qu’on a mesuré', () => {
  it('parle de refonte à qui a un site', () => {
    const t = rendreMessage(ENVOI_DEMO, varsDe('present'))
    expect(t).toContain('version plus vendeuse de votre site')
    expect(t).not.toContain('vous faire un site')
  })

  // LE TEST QUI COMPTE : 797 entreprises sont dans ce cas. Et il rougissait
  // sur la première version de cette variable — « oui »/« non » dans un seul
  // champ —, parce que « non » est une chaîne PRÉSENTE : `{% si %}` prenait la
  // voie du OUI et le prospect sans site lisait « votre site ».
  it('parle de création à qui n’en a pas', () => {
    const t = rendreMessage(ENVOI_DEMO, varsDe('absent'))
    expect(t).toContain('vous faire un site')
    expect(t).not.toContain('votre site')
  })

  // « inconnu » n'est pas « il en a un ». 34 240 fiches n'ont jamais été
  // regardées : leur écrire « votre site » serait une affirmation gratuite.
  it('ne suppose rien quand personne n’a regardé', () => {
    const t = rendreMessage(ENVOI_DEMO, varsDe('inconnu'))
    expect(t).toContain('vous faire un site')
    expect(t).not.toContain('votre site')
  })

  it('la relance après silence suit la même règle', () => {
    expect(rendreMessage(RELANCE_SILENCE, varsDe('present'))).toContain('version plus vendeuse du site de Toiture Martin')
    expect(rendreMessage(RELANCE_SILENCE, varsDe('absent'))).toContain('préparé un site pour Toiture Martin')
    expect(rendreMessage(RELANCE_SILENCE, varsDe('inconnu'))).toContain('préparé un site pour Toiture Martin')
  })

  // Une clé absente du catalogue est une FAUTE, et l'éditeur refuse alors
  // d'enregistrer. Si `company.site_present` n'y était pas, ces modèles
  // seraient devenus impossibles à rouvrir — sans que rien ne le dise avant
  // l'essai.
  it('la clé est connue du catalogue, donc l’éditeur accepte les modèles', () => {
    for (const corps of [ENVOI_DEMO, RELANCE_SILENCE]) {
      expect(rendreConditionnels(corps, varsDe('present')).fautes).toEqual([])
    }
  })

  // Aucune balise ne doit survivre au rendu : ce qui part au prospect ne porte
  // jamais de `{% %}` ni de `{{ }}`.
  it('ne laisse jamais une balise brute dans ce qui part', () => {
    for (const etat of ['present', 'absent', 'inconnu'] as const) {
      for (const corps of [ENVOI_DEMO, RELANCE_SILENCE]) {
        const t = rendreMessage(corps, varsDe(etat))
        expect(t).not.toMatch(/\{%|%\}|\{\{|\}\}/)
      }
    }
  })
})
