import { extraireMessageIdRfc, extraireReference } from '../connecteur-imap'

describe('extraireReference', () => {
  it('lit la référence, insensible à la casse de l\'en-tête', () => {
    expect(extraireReference('X-Sama-Ref: abc123def456\r\nSubject: test')).toBe('abc123def456')
    expect(extraireReference('x-sama-ref: abc123def456')).toBe('abc123def456')
  })

  it('rend null quand l\'en-tête est absent — du vrai courrier, pas de la chauffe', () => {
    expect(extraireReference('Subject: bonjour\r\nFrom: a@b.fr')).toBeNull()
  })

  it('ne capte pas un en-tête qui contient juste le nom en sous-chaîne', () => {
    expect(extraireReference('X-Not-Sama-Ref: abc123')).toBeNull()
  })

  it('s\'arrête au premier blanc — pas la ligne entière', () => {
    expect(extraireReference('X-Sama-Ref: abc123   \r\n')).toBe('abc123')
  })
})

describe('extraireMessageIdRfc', () => {
  it('lit le Message-ID', () => {
    expect(extraireMessageIdRfc('Message-ID: <abc@exemple.fr>\r\n')).toBe('<abc@exemple.fr>')
  })

  it('rend null quand absent', () => {
    expect(extraireMessageIdRfc('Subject: test')).toBeNull()
  })
})
