'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Save, Check, Loader2, Globe, MapPin } from 'lucide-react';
import type { Audit, AuditContent, AuditGlobalStyle } from '@/types';
import { AuditPreview } from './AuditPreview';
import type { AuditLu } from '@/lib/audit-site/lecture';
import { saveAudit } from '@/utils/auditApi';
import {
  problemsFromKeys,
  solutionsFromKeys,
  renumberSolutions,
  ensureMinIssueKeys,
  CARTES_RETENUES,
  MAX_AUDIT_ISSUES,
} from '@/data/auditIssues';
import { classerParForce } from '@/lib/audit/autres-ameliorations';
import { codesRetenus, construirePage5, type OffreAudit } from '@/lib/audit/offres-audit';
import { authedFetch } from '@/utils/authedFetch';
import { generateAuditHtml } from '@/utils/auditHtmlExport';
import { construireMesures, mesuresVides, type EchantillonMediane } from '@/lib/audit/mesures';
import { supabase } from '@/utils/supabase/client';
import { AUDIT_PREVIEW_DEBOUNCE_MS } from '@/utils/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { Page1Editor } from './audit/editors/Page1Editor';
import { Page2Editor } from './audit/editors/Page2Editor';
import { Page3Editor } from './audit/editors/Page3Editor';
import { Page4Editor } from './audit/editors/Page4Editor';
import { Page5Editor } from './audit/editors/Page5Editor';
import { Page6Editor } from './audit/editors/Page6Editor';
import { StyleEditor } from './audit/editors/StyleEditor';

/**
 * De quel champ du document relève quel onglet.
 *
 * C'ÉTAIT UNE TABLE DE CENT ENTRÉES ÉCRITE À LA MAIN, avec les index énumérés un
 * par un — `page2.problems.0` à `page2.problems.5`. Elle datait du deck de six
 * pages : les blocs que le document compact a introduits (`page3.avant_apres.N`
 * en tête, qui est à lui seul une demi-page) n'y figuraient pas, donc cliquer
 * dessus dans l'aperçu n'ouvrait aucun formulaire — le bloc paraissait
 * simplement non modifiable. Le préfixe suffit à trancher, et il ne peut pas
 * prendre de retard sur le rendu : tout `data-field` commence par `pageN.`.
 */
export function ongletDuChamp(field: string): number | null {
  const n = Number(/^page([1-6])\./.exec(field)?.[1]);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : null;
}

/**
 * Les onglets, dans l'ordre du document.
 *
 * Ils portaient encore les titres du deck supprimé — « Situation », « Solution »,
 * « Livrables », « Tarifs » — alors que les demi-pages correspondantes ne
 * montrent plus cela du tout : la deuxième est devenue le relevé de mesures, la
 * troisième l'avant/après. Un onglet qui annonce autre chose que ce qu'il ouvre
 * fait chercher ailleurs le champ qu'on a sous les yeux.
 */
const PAGE_LABELS = [
  'Couverture',
  'Le relevé',
  'Constat → après',
  'Ce qui change',
  'Investissement',
  'Étapes',
  'Style',
];

interface AuditEditorPageProps {
  audit: Audit;
  opportunityName?: string;
  /** URL du site actuel de l'entreprise (bouton de vérification). */
  siteUrl?: string;
  /** URL de la fiche Google / Maps (bouton de vérification). */
  googleUrl?: string;
  /** Problèmes pré-détectés par l'enrichissement, pour pré-cocher en un clic. */
  detectedIssueKeys?: string[];
  /** Mesures du site actuel, affichées en tête de la page « Situation ». */
  siteAudit?: AuditLu | null;
  /** L'opportunité à laquelle l'audit est rattaché — la cible du devis. */
  opportuniteId?: string;
  /** La médiane du parc, calculée côté serveur : le navigateur ne peut pas. */
  mediane?: EchantillonMediane | null;
}

export function AuditEditorPage({ audit: initialAudit, opportunityName, siteUrl, googleUrl, detectedIssueKeys, siteAudit, opportuniteId, mediane }: AuditEditorPageProps) {
  const router = useRouter();
  const [content, setContent] = useState<AuditContent>(initialAudit.content);
  const debouncedContent = useDebounce(content, AUDIT_PREVIEW_DEBOUNCE_MS);
  const [logoUrl, setLogoUrl] = useState(initialAudit.entreprise_logo_url || '');
  const [activePage, setActivePage] = useState(1);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(initialAudit.statut === 'ready');
  const [hasChanges, setHasChanges] = useState(false);
  /*
   * Le sélecteur « version courte / complète » a disparu avec l'ancien deck.
   * Le document compact ne se déplie pas : il détaille les trois constats qui
   * se comparent et compte les autres dans son bandeau. Un bouton qui ne change
   * plus rien à l'écran est pire qu'un bouton absent.
   */
  /**
   * Les offres que l'audit a le droit de proposer, chargées une fois.
   *
   * Tableau vide tant qu'elles n'arrivent pas — et si elles n'arrivent jamais,
   * la page tarifs garde ce que le document contenait déjà. Une page de tarifs
   * vide devant un prospect coûterait plus cher qu'un tarif à revoir.
   */
  const [offres, setOffres] = useState<OffreAudit[]>([]);

  useEffect(() => {
    let vivant = true;
    authedFetch('/api/audit/offres')
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        if (vivant && Array.isArray(b?.offres)) setOffres(b.offres);
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  const markChange = () => setHasChanges(true);

  const updatePage = useCallback(<K extends keyof AuditContent>(page: K, data: AuditContent[K]) => {
    setContent(prev => ({ ...prev, [page]: data }));
    markChange();
  }, []);

  const updateGlobalStyle = useCallback((patch: Partial<AuditGlobalStyle>) => {
    setContent(prev => ({ ...prev, global_style: { ...prev.global_style, ...patch } }));
    markChange();
  }, []);

  // ── Problèmes / solutions du catalogue (cases à cocher) ──────────────
  // La clé d'un problème coché est pairée à sa solution sur la page 3.
  const selectedIssueKeys = useMemo(
    () => (content.page2?.problems ?? []).map(p => p.key).filter((k): k is string => !!k),
    [content.page2?.problems],
  );

  const toggleIssue = useCallback((key: string) => {
    setContent(prev => {
      const isOn = prev.page2.problems.some(p => p.key === key);
      let problems = prev.page2.problems;
      let solutions = prev.page3.solutions;
      if (isOn) {
        problems = problems.filter(p => p.key !== key);
        solutions = solutions.filter(s => s.key !== key);
      } else {
        if (problems.length >= MAX_AUDIT_ISSUES) {
          toast.error(`Maximum ${MAX_AUDIT_ISSUES} problèmes — décochez-en un avant.`);
          return prev;
        }
        // La grille de la page 2 fait trois colonnes : 3 ou 6 cartes remplissent
        // des rangées nettes, 4 ou 5 laissent des trous visibles à l'impression.
        if (problems.length + 1 === CARTES_RETENUES + 1) {
          toast.warning('4 cartes laissent un trou dans la grille — visez 3 ou 6.');
        }
        problems = [...problems, ...problemsFromKeys([key])];
        solutions = [...solutions, ...solutionsFromKeys([key])];
      }
      return {
        ...prev,
        page2: { ...prev.page2, problems },
        page3: { ...prev.page3, solutions: renumberSolutions(solutions) },
      };
    });
    markChange();
  }, []);

  const applyDetectedIssues = useCallback(() => {
    if (!detectedIssueKeys || detectedIssueKeys.length === 0) return;

    // L'analyseur émet souvent cinq ou six constats. On n'en retient que les
    // plus FORTS — le poids de la preuve qui les déclenche, pas leur rang dans
    // le catalogue. Les autres ne disparaissent pas : ils alimentent la ligne
    // « et X autres améliorations possibles » en bas de la page 2.
    const classees = classerParForce(ensureMinIssueKeys(detectedIssueKeys), siteAudit);
    const keys = classees.slice(0, CARTES_RETENUES);

    setContent(prev => {
      const customProblems = prev.page2.problems.filter(p => !p.key);
      const customSolutions = prev.page3.solutions.filter(s => !s.key);
      const problems = [...problemsFromKeys(keys), ...customProblems].slice(0, MAX_AUDIT_ISSUES);
      const solutions = renumberSolutions([...solutionsFromKeys(keys), ...customSolutions]);
      return {
        ...prev,
        page2: { ...prev.page2, problems },
        page3: { ...prev.page3, solutions },
        // Les tarifs suivent les constats : le socle est toujours là, les
        // additions ne sont conseillées que si un constat retenu les justifie.
        // Une addition sans constat serait une vente forcée, et ça se voit.
        page5: construirePage5(prev.page5, offres, classees),
      };
    });
    markChange();

    const restants = classees.length - keys.length;
    toast.success(
      restants > 0
        ? `${keys.length} constats retenus · ${restants} autres annoncés en bas de page`
        : `${keys.length} constats retenus`,
    );
  }, [detectedIssueKeys, siteAudit, offres]);

  const handleFieldClick = useCallback((field: string) => {
    setActiveField(field);
    const page = ongletDuChamp(field);
    if (page) setActivePage(page);
  }, []);

  const handleSave = async () => {
    if (!initialAudit.id) {
      toast.error("Audit non initialisé — veuillez recharger la page");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expirée — veuillez recharger la page");
        return;
      }

      await saveAudit(initialAudit.id, content, {
        entreprise_logo_url: logoUrl || undefined,
        statut: isReady ? 'ready' : 'draft',
      });
      setHasChanges(false);

      // Un audit marqué prêt EST le devis : les offres qu'il propose deviennent
      // les lignes de l'opportunité, sans ressaisie. Tant qu'il est en
      // brouillon, on n'écrit rien — un audit qu'on retouche encore ne doit pas
      // faire bouger un montant que quelqu'un consulte par ailleurs.
      if (isReady && opportuniteId) {
        const codes = codesRetenus(offres, selectedIssueKeys);
        // Best-effort et signalé : l'audit est sauvegardé quoi qu'il arrive, et
        // un devis non écrit ne doit pas ressembler à une sauvegarde perdue.
        const res = await authedFetch('/api/audit/devis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunite_id: opportuniteId, codes }),
        }).catch(() => null);

        if (res?.ok) {
          const d = await res.json().catch(() => null);
          toast.success(
            d?.lignes
              ? `Audit sauvegardé · devis mis à jour (${d.lignes} ligne${d.lignes > 1 ? 's' : ''})`
              : 'Audit sauvegardé',
          );
        } else {
          toast.success('Audit sauvegardé');
          toast.warning("Le devis n'a pas pu être mis à jour — les lignes d'offres sont inchangées.");
        }
        return;
      }

      toast.success('Audit sauvegardé');
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        toast.error("Session expirée — veuillez recharger la page");
      } else {
        toast.error('Erreur lors de la sauvegarde');
      }
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Le relevé affichable — jamais recalculé ici.
   *
   * `construireMesures` est la seule porte : elle publie `note_globale` telle
   * qu'elle est en base et les axes tels que la lecture les a publiés. Rejouer
   * une moyenne dans le composant recréerait le troisième barème qu'on vient de
   * supprimer.
   */
  const mesures = useMemo(
    () => (siteAudit ? construireMesures(siteAudit, mediane) : mesuresVides()),
    [siteAudit, mediane],
  );

  /**
   * L'export : la fenêtre s'imprime seule, une fois ses polices arrivées.
   *
   * Le déclenchement se faisait ici, sur un délai fixe d'une seconde. Il est
   * maintenant dans le document lui-même, qui attend `document.fonts.ready` :
   * une seconde suffit d'habitude, et quand elle ne suffit pas le PDF part en
   * police de secours sans que personne ne s'en aperçoive avant le prospect.
   */
  const handleExport = () => {
    const win = window.open('', '_blank');
    if (!win) { toast.error("Impossible d'ouvrir une nouvelle fenêtre"); return; }
    Promise.resolve().then(() => {
      win.document.write(generateAuditHtml(content, mesures, { impression: true }));
      win.document.close();
      win.focus();
    });
  };

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
          {siteUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(siteUrl, '_blank', 'noopener,noreferrer')}
              title={siteUrl}
            >
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Voir le site
            </Button>
          )}
          {googleUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(googleUrl, '_blank', 'noopener,noreferrer')}
              title={googleUrl}
            >
              <MapPin className="h-3.5 w-3.5 mr-1.5" />
              Voir Google
            </Button>
          )}
          <div className="w-px h-5 bg-border mx-1" />
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
                <Page2Editor
                  data={content.page2}
                  onChange={data => updatePage('page2', data)}
                  selectedIssueKeys={selectedIssueKeys}
                  onToggleIssue={toggleIssue}
                  hasDetectedIssues={!!detectedIssueKeys && detectedIssueKeys.length > 0}
                  onApplyDetected={applyDetectedIssues}
                />
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
              {activePage === 7 && (
                <StyleEditor gs={content.global_style || {}} onChange={updateGlobalStyle} />
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT — Aperçu. Il gère lui-même son échelle, sa hauteur et son
            défilement : c'est le seul endroit qui sait ce que le document mesure
            réellement. La hauteur était calculée ici sur SIX feuilles alors que
            le document compact en fait trois, d'où la moitié basse du panneau
            vide en permanence. */}
        <ResizablePanel defaultSize={62} minSize={40}>
          <AuditPreview
            content={debouncedContent}
            activeField={activeField}
            onFieldClick={handleFieldClick}
            mesures={mesures}
            demiPage={activePage <= 6 ? activePage : undefined}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
