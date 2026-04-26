import type { AuditContent } from '@/types';
import { generateCSS } from './audit/htmlShared';
import { page1Html } from './audit/htmlPage1';
import { page2Html } from './audit/htmlPage2';
import { page3Html } from './audit/htmlPage3';
import { page4Html } from './audit/htmlPage4';
import { page5Html } from './audit/htmlPage5';
import { page6Html } from './audit/htmlPage6';

export function generateAuditHtml(content: AuditContent, opts: { logoUrl?: string } = {}): string {
  const css = generateCSS(content.global_style);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Audit — ${content.page1.client_name || 'Client'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
${page1Html(content, opts.logoUrl)}
${page2Html(content)}
${page3Html(content)}
${page4Html(content)}
${page5Html(content)}
${page6Html(content)}
</body>
</html>`;
}
