'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Download, Save, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import type { Audit, AuditContent, AuditLivrable, AuditNextStep, AuditPage1, AuditPage2, AuditPage3, AuditPage4, AuditPage5, AuditPage6, AuditPlanningStep, AuditProblem, AuditSolution } from '@/types';
import { AuditPreview } from './AuditPreview';
import { saveAuditContent, saveAuditMeta } from '@/utils/auditApi';
import { generateAuditHtml } from '@/utils/auditHtmlExport';

// ── Field-to-page mapping ─────────────────────────────────
const FIELD_PAGE: Record<string, number> = {
  'page1.date': 1, 'page1.eyebrow': 1, 'page1.title': 1, 'page1.subtitle': 1, 'page1.client': 1, 'page1.logo': 1,
  'page2.section_intro': 2, 'page2.problems.0': 2, 'page2.problems.1': 2, 'page2.problems.2': 2, 'page2.quote': 2,
  'page3.section_intro': 3, 'page3.solutions.0': 3, 'page3.solutions.1': 3, 'page3.solutions.2': 3, 'page3.solutions.3': 3,
  'page4.livrables.0': 4, 'page4.livrables.1': 4, 'page4.livrables.2': 4, 'page4.livrables.3': 4,
  'page5.planning_steps.0': 5, 'page5.planning_steps.1': 5, 'page5.planning_steps.2': 5, 'page5.planning_steps.3': 5, 'page5.pricing': 5,
  'page6.next_steps.0': 6, 'page6.next_steps.1': 6, 'page6.next_steps.2': 6, 'page6.cta': 6,
};

// ── Shared field styles ───────────────────────────────────
const labelStyle = 'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1';
const fieldGroupStyle = 'flex flex-col gap-1 mb-4';

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={fieldGroupStyle}>
      <label className={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Page 1 editor ─────────────────────────────────────────
function Page1Editor({ data, logoUrl, onChange, onMetaChange }: {
  data: AuditPage1;
  logoUrl?: string;
  onChange: (d: AuditPage1) => void;
  onMetaChange: (k: string, v: string) => void;
}) {
  const set = (k: keyof AuditPage1) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <div className="space-y-1">
      <FieldGroup label="Date (en-tête)">
        <Input value={data.date} onChange={set('date')} placeholder="Audit · Avril 2025" />
      </FieldGroup>
      <FieldGroup label="Accroche (eyebrow)">
        <Input value={data.eyebrow} onChange={set('eyebrow')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 1">
        <Input value={data.title_line1} onChange={set('title_line1')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 2">
        <Input value={data.title_line2} onChange={set('title_line2')} />
      </FieldGroup>
      <FieldGroup label="Titre — ligne 3 (italique)">
        <Input value={data.title_line3} onChange={set('title_line3')} />
      </FieldGroup>
      <FieldGroup label="Sous-titre">
        <Textarea value={data.subtitle} onChange={set('subtitle')} rows={2} />
      </FieldGroup>
      <div className="border-t border-border pt-4 mt-4">
        <p className={`${labelStyle} mb-3`}>Bloc client (auto-rempli depuis l'opportunité)</p>
        <FieldGroup label="Nom entreprise">
          <Input value={data.client_name} onChange={set('client_name')} placeholder="Entreprise Cliente" />
        </FieldGroup>
        <FieldGroup label="Secteur · Ville">
          <Input value={data.client_meta} onChange={set('client_meta')} placeholder="Plomberie · Paris, France" />
        </FieldGroup>
        <FieldGroup label="URL site démo">
          <Input value={data.demo_url} onChange={set('demo_url')} placeholder="https://demo.sama.fr/..." />
        </FieldGroup>
        <FieldGroup label="Logo URL">
          <Input
            value={logoUrl || ''}
            onChange={(e) => onMetaChange('entreprise_logo_url', e.target.value)}
            placeholder="https://..."
          />
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded mt-1 border" />}
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Page 2 editor ─────────────────────────────────────────
function Page2Editor({ data, onChange }: { data: AuditPage2; onChange: (d: AuditPage2) => void }) {
  const setProb = (i: number, k: keyof AuditProblem, v: string) => {
    const problems = data.problems.map((p, idx) => idx === i ? { ...p, [k]: v } : p);
    onChange({ ...data, problems });
  };

  return (
    <div className="space-y-1">
      <FieldGroup label="Intro de section">
        <Textarea value={data.section_intro} onChange={e => onChange({ ...data, section_intro: e.target.value })} rows={3} />
      </FieldGroup>

      <p className={`${labelStyle} mt-4 mb-2`}>Constats (3 cartes)</p>
      {data.problems.map((p, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Carte {i + 1}</div>
          <FieldGroup label="Titre">
            <Input value={p.title} onChange={e => setProb(i, 'title', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
            <Textarea value={p.desc} onChange={e => setProb(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <FieldGroup label="Citation">
          <Textarea value={data.quote} onChange={e => onChange({ ...data, quote: e.target.value })} rows={2} />
        </FieldGroup>
        <FieldGroup label="Source de la citation">
          <Input value={data.quote_source} onChange={e => onChange({ ...data, quote_source: e.target.value })} />
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Page 3 editor ─────────────────────────────────────────
function Page3Editor({ data, onChange }: { data: AuditPage3; onChange: (d: AuditPage3) => void }) {
  const setSol = (i: number, k: keyof AuditSolution, v: string) => {
    const solutions = data.solutions.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, solutions });
  };
  const addSol = () => onChange({ ...data, solutions: [...data.solutions, { num: String(data.solutions.length + 1), name: '', desc: '', tag: '' }] });
  const removeSol = (i: number) => onChange({ ...data, solutions: data.solutions.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-1">
      <FieldGroup label="Intro de section">
        <Textarea value={data.section_intro} onChange={e => onChange({ ...data, section_intro: e.target.value })} rows={2} />
      </FieldGroup>
      <p className={`${labelStyle} mt-4 mb-2`}>Solutions / Conseils</p>
      {data.solutions.map((s, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">#{s.num}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSol(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label="Nom">
              <Input value={s.name} onChange={e => setSol(i, 'name', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Tag">
              <Input value={s.tag} onChange={e => setSol(i, 'tag', e.target.value)} placeholder="SEO" />
            </FieldGroup>
          </div>
          <FieldGroup label="Description">
            <Textarea value={s.desc} onChange={e => setSol(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addSol} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Ajouter une solution
      </Button>
    </div>
  );
}

// ── Page 4 editor ─────────────────────────────────────────
function Page4Editor({ data, onChange }: { data: AuditPage4; onChange: (d: AuditPage4) => void }) {
  const setLiv = (i: number, k: keyof AuditLivrable, v: string | string[]) => {
    const livrables = data.livrables.map((l, idx) => idx === i ? { ...l, [k]: v } : l);
    onChange({ ...data, livrables });
  };
  const setItem = (li: number, ii: number, v: string) => {
    const items = data.livrables[li].items.map((item, idx) => idx === ii ? v : item);
    setLiv(li, 'items', items);
  };
  const addItem = (li: number) => setLiv(li, 'items', [...data.livrables[li].items, '']);
  const removeItem = (li: number, ii: number) => setLiv(li, 'items', data.livrables[li].items.filter((_, idx) => idx !== ii));

  return (
    <div className="space-y-1">
      {data.livrables.map((liv, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-4">
          <FieldGroup label={`Titre livrable ${i + 1}`}>
            <Input value={liv.title} onChange={e => setLiv(i, 'title', e.target.value)} />
          </FieldGroup>
          <p className={labelStyle}>Éléments inclus</p>
          {liv.items.map((item, j) => (
            <div key={j} className="flex items-center gap-1 mb-1">
              <Input value={item} onChange={e => setItem(i, j, e.target.value)} className="flex-1 h-7 text-xs" />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removeItem(i, j)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => addItem(i)} className="mt-1 h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Ajouter
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Page 5 editor ─────────────────────────────────────────
function Page5Editor({ data, onChange }: { data: AuditPage5; onChange: (d: AuditPage5) => void }) {
  const setStep = (i: number, k: keyof AuditPlanningStep, v: string) => {
    const steps = data.planning_steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, planning_steps: steps });
  };
  const set = (k: keyof AuditPage5) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <div className="space-y-1">
      <p className={`${labelStyle} mb-2`}>Planning</p>
      {data.planning_steps.map((step, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FieldGroup label="Semaine">
              <Input value={step.week} onChange={e => setStep(i, 'week', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Titre">
              <Input value={step.title} onChange={e => setStep(i, 'title', e.target.value)} />
            </FieldGroup>
          </div>
          <FieldGroup label="Description">
            <Textarea value={step.desc} onChange={e => setStep(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}

      <div className="border-t border-border pt-4 mt-4">
        <p className={`${labelStyle} mb-3`}>Investissement</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Label setup">
            <Input value={data.price_setup_label} onChange={set('price_setup_label')} />
          </FieldGroup>
          <FieldGroup label="Prix setup">
            <Input value={data.price_setup} onChange={set('price_setup')} placeholder="1 490 €" />
          </FieldGroup>
          <FieldGroup label="Sous-label setup">
            <Input value={data.price_setup_desc} onChange={set('price_setup_desc')} />
          </FieldGroup>
          <FieldGroup label="Prix mensuel">
            <Input value={data.price_monthly} onChange={set('price_monthly')} placeholder="89 €/mois" />
          </FieldGroup>
          <FieldGroup label="Label mensuel">
            <Input value={data.price_monthly_label} onChange={set('price_monthly_label')} />
          </FieldGroup>
          <FieldGroup label="Prix total an 1">
            <Input value={data.price_total} onChange={set('price_total')} placeholder="2 558 €" />
          </FieldGroup>
        </div>
        <FieldGroup label="Note tarifaire">
          <Textarea value={data.price_note} onChange={set('price_note')} rows={3} />
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Page 6 editor ─────────────────────────────────────────
function Page6Editor({ data, onChange }: { data: AuditPage6; onChange: (d: AuditPage6) => void }) {
  const setStep = (i: number, k: keyof AuditNextStep, v: string) => {
    const steps = data.next_steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s);
    onChange({ ...data, next_steps: steps });
  };
  const set = (k: keyof AuditPage6) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });

  return (
    <div className="space-y-1">
      <p className={`${labelStyle} mb-2`}>Prochaines étapes</p>
      {data.next_steps.map((step, i) => (
        <div key={i} className="border border-border rounded-md p-3 mb-3 space-y-2">
          <FieldGroup label={`Étape ${i + 1} — Titre`}>
            <Input value={step.title} onChange={e => setStep(i, 'title', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
            <Textarea value={step.desc} onChange={e => setStep(i, 'desc', e.target.value)} rows={2} />
          </FieldGroup>
        </div>
      ))}

      <div className="border-t border-border pt-4">
        <p className={`${labelStyle} mb-3`}>Bloc CTA</p>
        <FieldGroup label="Titre CTA">
          <Input value={data.cta_title} onChange={set('cta_title')} />
        </FieldGroup>
        <FieldGroup label="Sous-titre CTA">
          <Input value={data.cta_sub} onChange={set('cta_sub')} />
        </FieldGroup>
        <div className="grid grid-cols-2 gap-2">
          <FieldGroup label="Téléphone">
            <Input value={data.contact_phone} onChange={set('contact_phone')} />
          </FieldGroup>
          <FieldGroup label="Email">
            <Input value={data.contact_email} onChange={set('contact_email')} />
          </FieldGroup>
        </div>
        <FieldGroup label="Site web">
          <Input value={data.contact_website} onChange={set('contact_website')} />
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────
interface AuditEditorPageProps {
  audit: Audit;
  opportunityName?: string;
}

const PAGE_LABELS = ['Couverture', 'Situation', 'Solution', 'Livrables', 'Planning & Prix', 'Étapes'];

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

  // Scale preview to panel width
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

  // Scroll preview to active page when page tab changes
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
            {/* Scaled wrapper: inner natural width = 794px, we scale it */}
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
