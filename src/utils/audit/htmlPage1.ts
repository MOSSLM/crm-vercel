import type { AuditContent } from '@/types';
import { esc, logoSvg } from './htmlShared';

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

export function page1Html(content: AuditContent, logoUrl?: string) {
  const p = content.page1;
  const domain = p.demo_url ? getDomain(p.demo_url) : '';
  const screenshotUrl = p.demo_url ? `https://image.thum.io/get/width/800/crop/600/${p.demo_url}` : '';

  return `
<div class="page">
<div class="cover">
  <div class="cover-sky"></div>
  <div class="grain"></div>
  <div class="cover-content">
    <div class="cover-top">
      <div class="logo-block">${logoSvg(26, '#B5D0F0')}<span class="logo-wm">SAMA</span></div>
      <span class="cover-date">${esc(p.date || 'Audit · 2025')}</span>
    </div>
    <div class="cover-main">
      <div class="cover-eyebrow">${esc(p.eyebrow)}</div>
      <div class="cover-title">${esc(p.title_line1)}<br>${esc(p.title_line2)}<br><em>${esc(p.title_line3)}</em></div>
      <div class="cover-subtitle">${esc(p.subtitle)}</div>
      <div class="cover-client-row">
        <div class="cover-client-block">
          <div class="cover-client-top">
            <div class="cover-client-label">Préparé pour</div>
            ${logoUrl ? `<img src="${esc(logoUrl)}" class="cover-client-logo" alt="Logo client">` : ''}
          </div>
          <div class="cover-client-name">${esc(p.client_name || 'Entreprise Cliente')}</div>
          <div class="cover-client-meta">${esc(p.client_meta || 'Secteur · Ville, France')}</div>
        </div>
        ${p.demo_url ? `
        <a href="${esc(p.demo_url)}" class="demo-cta" target="_blank">
          <div class="demo-cta-inner">
            <div class="demo-cta-label">Site démo disponible</div>
            <div class="mockup">
              <div class="mockup-chrome">
                <div class="mockup-dots">
                  <div class="mockup-dot" style="background:rgba(255,100,100,.5)"></div>
                  <div class="mockup-dot" style="background:rgba(255,200,0,.5)"></div>
                  <div class="mockup-dot" style="background:rgba(100,200,100,.5)"></div>
                </div>
                <div class="mockup-url">${domain ? `<img src="https://www.google.com/s2/favicons?domain=${esc(domain)}&sz=16" style="width:8px;height:8px;margin-right:3px;vertical-align:middle">` : ''}${esc(p.demo_url)}</div>
              </div>
              <div class="mockup-screen">
                ${screenshotUrl ? `<img src="${esc(screenshotUrl)}" class="mockup-screenshot" alt="Aperçu du site" onerror="this.style.display='none'">` : ''}
                <div class="mockup-skeleton">
                  <div class="mockup-hero"></div>
                  <div class="mockup-line" style="width:90%"></div>
                  <div class="mockup-line" style="width:65%"></div>
                  <div class="mockup-btn"></div>
                </div>
              </div>
            </div>
            <div class="demo-cta-link">Découvrir votre site démo →</div>
          </div>
        </a>` : ''}
      </div>
    </div>
    <div class="cover-bottom">
      <div class="cover-page-num">01</div>
    </div>
  </div>
</div>
</div>`;
}
