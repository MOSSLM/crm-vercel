/**
 * @jest-environment node
 */
import { wrapEmailBodyHtml, buildSignatureHtml, buildSignatureText, renderEmailHtml } from '../emailTemplate';
import type { SignatureData } from '@/components/messaging/SignatureSettings';

const SIG: SignatureData = {
  first_name: 'Jean',
  last_name: 'Dupont',
  job_title: 'Directeur',
  company: 'SAMA',
  email: 'jean@sama.fr',
  phone: '06 12 34 56 78',
  website: 'https://sama.fr',
  linkedin_url: '',
  accent_color: '#3A7BD5',
};

describe('emailTemplate — rendu minimal « humain »', () => {
  it('renders plain paragraphs without any branded template', () => {
    const html = wrapEmailBodyHtml('Bonjour,\n\nPremière ligne.\nDeuxième ligne.', SIG);

    expect(html).toContain('<p style="margin:0 0 16px 0;">Bonjour,</p>');
    expect(html).toContain('Première ligne.<br>Deuxième ligne.');

    // Aucune fioriture : pas de header/footer de marque, pas de table,
    // pas de styles décoratifs, pas d'emojis.
    expect(html).not.toContain('AGENCE DIGITALE');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('letter-spacing');
    expect(html).not.toContain('text-transform');
    expect(html).not.toContain('Georgia');
    expect(html).not.toContain('#0B1D3A');
    expect(html).not.toMatch(/[📧📞🌐🔗👉]/u);
  });

  it('renders a simple hand-typed signature', () => {
    const html = buildSignatureHtml(SIG);
    expect(html).toContain('Jean Dupont');
    expect(html).toContain('Directeur — SAMA');
    expect(html).toContain('06 12 34 56 78');
    expect(html).toContain('<a href="https://sama.fr">sama.fr</a>');
    expect(html).not.toContain('<table');

    expect(buildSignatureText(SIG)).toBe('Jean Dupont\nDirecteur — SAMA\n06 12 34 56 78\nsama.fr');
  });

  it('omits the signature block when empty', () => {
    const empty = { ...SIG, first_name: '', last_name: '', job_title: '', company: '', phone: '', website: '', email: '' };
    expect(buildSignatureHtml(empty)).toBe('');
    expect(wrapEmailBodyHtml('Bonjour,', null)).not.toContain('margin:24px');
  });

  it('renderEmailHtml stays compatible with existing callers', async () => {
    const html = await renderEmailHtml('Bonjour,', SIG);
    expect(html).toContain('Bonjour,');
    expect(html).toContain('Jean Dupont');
  });
});
