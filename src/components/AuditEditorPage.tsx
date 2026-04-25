'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Save, Check, Loader2 } from 'lucide-react';
import type { Audit, AuditContent } from '@/types';
import { AuditPreview } from './AuditPreview';
import { saveAuditContent, saveAuditMeta } from '@/utils/auditApi';
import { generateAuditHtml } from '@/utils/auditHtmlExport';
import { Page1Editor } from './audit/editors/Page1Editor';
import { Page2Editor } from './audit/editors/Page2Editor';
import { Page3Editor } from './audit/editors/Page3Editor';
import { Page4Editor } from './audit/editors/Page4Editor';
import { Page5Editor } from './audit/editors/Page5Editor';
import { Page6Editor } from './audit/editors/Page6Editor';

// ── Field-to-page mapping ─────────────────────────────────
const FIELD_PAGE: Record<string, number> = {
  // Page 1
  'page1.date': 1, 'page1.eyebrow': 1, 'page1.title': 1, 'page1.subtitle': 1,
  'page1.client': 1, 'page1.logo': 1, 'page1.demo': 1,
  // Page 2
  'page2.header_section': 2, 'page2.section_label': 2, 'page2.section_heading': 2,
  'page2.section_intro': 2,
  'page2.problems.0': 2, 'page2.problems.1': 2, 'page2.problems.2': 2,
  'page2.problems.3': 2, 'page2.problems.4': 2, 'page2.problems.5': 2,
  'page2.quote': 2,
  // Page 3
  'page3.header_section': 3, 'page3.section_label': 3, 'page3.section_heading': 3,
  'page3.section_intro': 3,
  'page3.solutions.0': 3, 'page3.solutions.1': 3, 'page3.solutions.2': 3, 'page3.solutions.3': 3,
  // Page 4
  'page4.header_section': 4, 'page4.section_label': 4, 'page4.section_heading': 4,
  'page4.section_subtitle': 4,
  'page4.livrables.0': 4, 'page4.livrables.1': 4, 'page4.livrables.2': 4, 'page4.livrables.3': 4,
  // Page 5
  'page5.header_section': 5, 'page5.section_label': 5,
  'page5.pricing_subtitle': 5, 'page5.pricing': 5, 'page5.price_note': 5,
  'page5.addl_section_title': 5, 'page5.addl_section_subtitle': 5,
  'page5.additional_services.0': 5, 'page5.additional_services.1': 5,
  'page5.additional_services.2': 5, 'page5.additional_services.3': 5,
  // Page 6
  'page6.header_section': 6, 'page6.section_label': 6, 'page6.section_heading': 6,
  'page6.section_subtitle': 6,
  'page6.next_steps.0': 6, 'page6.next_steps.1': 6, 'page6.next_steps.2': 6, 'page6.cta': 6,
};

const PAGE_LABELS = ['Couverture', 'Situation', 'Solution', 'Livrables', 'Tarifs', 'Étapes'];

interface AuditEditorPageProps {
  audit: Audit;
  opportunityName?: string;
}

export function AuditEditorPage({ audit: initialAudit, opportunityName }: AuditEditorPageProps) {
  const router = useRouter();
  const [content, setContent] = useState<AuditContent>(initialAudit.content);
  const [logoUrl, setLogoUrl] = useState(initialAudit.entreprise_logo_url || '');
  const [activePage, setActivePage] = useState(1);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(initialAudit.statut === 'ready');
  const [hasChanges, setHasChanges] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewInnerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setScale(Math.max(0.3, (w - 32) / 794));
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const markChange = () => setHasChanges(true);

  const updatePage = useCallback(<K extends keyof AuditContent>(page: K, data: AuditContent[K]) => {
    setContent(prev => ({ ...prev, [page]: data }));
    markChange();
  }, []);

  const handleFieldClick = (field: string) => {
    setActiveField(field);
    const page = FIELD_PAGE[field];
    if (page) setActivePage(page);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAuditContent(initialAudit.id, content);
      await saveAuditMeta(initialAudit.id, {
        entreprise_logo_url: logoUrl || undefined,
        statut: isReady ? 'ready' : 'draft',
      });
      setHasChanges(false);
      toast.success('Audit sauvegardé');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const html = generateAuditHtml(content, { logoUrl });
    const win = window.open('', '_blank');
    if (!win) { toast.error("Impossible d'ouvrir une nouvelle fenêtre"); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  useEffect(() => {
    const pageId = `audit-p${activePage}`;
    const el = previewInnerRef.current?.querySelector(`#${pageId}`);
    if (el && previewContainerRef.current) {
      const offsetTop = (el as HTMLElement).offsetTop * scale;
      previewContainerRef.current.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  }, [activePage, scale]);

  const totalHeight = (1123 * 6 + 24 * 5) * scale;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-sm font-semibold">Audit — {opportunityName || 'Opportunité'}</div>
            <div className="text-xs text-muted-foreground">
              {isReady ? 'Prêt' : 'Brouillon'}
              {hasChanges && ' · Modifications non sauvegardées'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setIsReady(r => !r); markChange(); }}
          >
            {isReady ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : null}
            {isReady ? 'Prêt' : 'Marquer prêt'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exporter PDF
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Sauvegarder
          </Button>
        </div>
      </div>

      {/* Body */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* LEFT — Editor */}
        <ResizablePanel defaultSize={38} minSize={28} maxSize={55}>
          <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Page tabs */}
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border shrink-0 overflow-x-auto">
              {PAGE_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setActivePage(i + 1)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    activePage === i + 1
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Editor fields */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {activePage === 1 && (
                <Page1Editor
                  data={content.page1}
                  logoUrl={logoUrl}
                  onChange={data => updatePage('page1', data)}
                  onMetaChange={(k, v) => { if (k === 'entreprise_logo_url') { setLogoUrl(v); markChange(); } }}
                />
              )}
              {activePage === 2 && (
                <Page2Editor data={content.page2} onChange={data => updatePage('page2', data)} />
              )}
              {activePage === 3 && (
                <Page3Editor data={content.page3} onChange={data => updatePage('page3', data)} />
              )}
              {activePage === 4 && (
                <Page4Editor data={content.page4} onChange={data => updatePage('page4', data)} />
              )}
              {activePage === 5 && (
                <Page5Editor data={content.page5} onChange={data => updatePage('page5', data)} />
              )}
              {activePage === 6 && (
                <Page6Editor data={content.page6} onChange={data => updatePage('page6', data)} />
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT — Preview */}
        <ResizablePanel defaultSize={62} minSize={40}>
          <div
            ref={previewContainerRef}
            className="h-full overflow-y-auto bg-[#1a1a1e]"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div
              style={{
                width: 794,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
                height: totalHeight / scale,
              }}
            >
              <div ref={previewInnerRef} style={{ paddingTop: 16 }}>
                <AuditPreview
                  content={content}
                  logoUrl={logoUrl || undefined}
                  activeField={activeField}
                  onFieldClick={handleFieldClick}
                />
                <div style={{ height: 16 }} />
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
