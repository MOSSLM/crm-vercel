"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAppData } from './AppDataContext';
import { Company } from '@/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Search,
  ExternalLink,
  MapPin,
  Target,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  Check,
  Phone,
  X,
  Trash2,
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';
import { getCompanyDisplayName, ensureHttpsUrl } from '../utils/displayHelpers';
import { SprintFlowBanner, useSprintFlowState } from './SprintFlowBanner';
import logger from '../utils/logger';
import { normalizeServiceTags } from '../utils/serviceTags';

type UrlFilter = 'all' | 'with-url' | 'without-url';

export const QualificationPage: React.FC = () => {
  const sourceOptions = [
    { value: 'google_search', label: 'Google Search' },
    { value: 'google_maps', label: 'Google Maps' },
  ];

  const {
    companies,
    qualifyCompany,
    unqualifyCompany,
    updateCompany,
    deleteCompany,
    loading,
    isDuplicate,
    blacklistCompany,
    blacklistDomain,
    isCompanyBlacklisted,
    offers,
    selectedQualificationOfferId,
    setSelectedQualificationOfferId
  } = useAppData();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(() => sourceOptions.map((option) => option.value));
  const [showQualified, setShowQualified] = useState(false);
  const [urlFilter, setUrlFilter] = useState<UrlFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showHiddenCompanies, setShowHiddenCompanies] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // 12 items per page
  
  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const { sprintFlow, save } = useSprintFlowState();

  const filteredCompanies = companies.filter(company => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const matchesSearch =
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.adresse && company.adresse.toLowerCase().includes(searchTerm.toLowerCase())) ||
      normalizeServiceTags(company.service_tags, company.premiers_tags)
        .some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSource =
      selectedSources.length === 0 ||
      selectedSources.some((source) => company.sources.includes(source));

    const matchesQualification = showQualified ? company.qualifie : !company.qualifie;

    const hasUrl = Boolean(company.canonical_url?.trim());
    const matchesUrl =
      urlFilter === 'all' ||
      (urlFilter === 'with-url' && hasUrl) ||
      (urlFilter === 'without-url' && !hasUrl);
    
    const hideByDuplicate =
      !showDuplicates &&
      (isDuplicate(company.id) || isCompanyBlacklisted(company));

    const hideByManual =
      !showHiddenCompanies && company.hidden_in_qualification;

    return matchesSearch && matchesSource && matchesQualification && matchesUrl && !hideByDuplicate && !hideByManual;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSources, showQualified, urlFilter, showHiddenCompanies]);

  const toggleSource = (source: string) => {
    setSelectedSources((previous) =>
      previous.includes(source)
        ? previous.filter((value) => value !== source)
        : [...previous, source]
    );
  };

  const sourceFilterLabel =
    selectedSources.length === 0 || selectedSources.length === sourceOptions.length
      ? 'Toutes les sources'
      : `${selectedSources.length} source${selectedSources.length > 1 ? 's' : ''}`;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };


  const handleQualificationToggle = async (company: Company) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    
    try {
      if (company.qualifie) {
        await unqualifyCompany(company.id);
        if (sprintFlow?.companyIds.includes(company.id)) {
          save({
            ...sprintFlow,
            companyIds: sprintFlow.companyIds.filter((companyId) => companyId !== company.id),
          });
        }
        toast.success(`${displayName} déqualifiée`);
      } else {
        await qualifyCompany(company.id);
        if (sprintFlow && sprintFlow.companyIds.length < sprintFlow.targetCount && !sprintFlow.companyIds.includes(company.id)) {
          save({
            ...sprintFlow,
            companyIds: [...sprintFlow.companyIds, company.id],
          });
        }
        toast.success(`${displayName} qualifiée avec succès !`);
      }
    } catch (error) {
      logger.error('Erreur lors de la qualification:', error);
      toast.error('Erreur lors de la modification de la qualification');
    }
  };

  const handleVisitWebsite = (company: Company) => {
    if (company.canonical_url) {
      const url = ensureHttpsUrl(company.canonical_url);
      window.open(url, '_blank', 'noopener,noreferrer');
      
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(`Site web de ${displayName} ouvert`);
    } else {
      toast.error('Aucune URL disponible pour cette entreprise');
    }
  };

  const [companyToBlacklist, setCompanyToBlacklist] = useState<Company | null>(null);
  const [isProcessingBlacklist, setIsProcessingBlacklist] = useState(false);

  const qualificationOffers = offers.filter((offer) => offer.actif && offer.visible_in_qualification);
  const selectedOffer = qualificationOffers.find((offer) => offer.id === selectedQualificationOfferId) ?? null;

  // Tab counts derived from real data (independent of current view filters)
  const queueCount = companies.filter(
    (c) => !c.qualifie && !c.hidden_in_qualification && !isDuplicate(c.id) && !isCompanyBlacklisted(c)
  ).length;
  const qualifiedCount = companies.filter((c) => c.qualifie).length;
  const hiddenCount = companies.filter((c) => !c.qualifie && c.hidden_in_qualification).length;

  // Active tab derived from existing view state
  const activeTab: 'queue' | 'qualified' | 'hidden' = showHiddenCompanies
    ? 'hidden'
    : showQualified
      ? 'qualified'
      : 'queue';

  const selectTab = (tab: 'queue' | 'qualified' | 'hidden') => {
    if (tab === 'queue') {
      setShowQualified(false);
      setShowHiddenCompanies(false);
    } else if (tab === 'qualified') {
      setShowQualified(true);
      setShowHiddenCompanies(false);
    } else {
      setShowHiddenCompanies(true);
      setShowQualified(false);
    }
  };

  const handleBlacklistClick = (company: Company) => {
    setCompanyToBlacklist(company);
  };

  const handleToggleHidden = async (company: Company) => {
    if (company.qualifie) return;
    try {
      await updateCompany(company.id, {
        hidden_in_qualification: !company.hidden_in_qualification,
      });
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(
        company.hidden_in_qualification
          ? `${displayName} réaffichée`
          : `${displayName} masquée`
      );
    } catch (error) {
      logger.error('Erreur lors du masquage:', error);
      toast.error('Erreur lors du masquage de l’entreprise');
    }
  };

  const handleBlacklistExact = async () => {
    if (!companyToBlacklist) return;

    setIsProcessingBlacklist(true);
    try {
      await blacklistCompany(companyToBlacklist.id);
      const displayName = getCompanyDisplayName(
        companyToBlacklist.name,
        companyToBlacklist.canonical_url
      );
      toast.success(`${displayName} black-listée (URL exacte)`);
      setCompanyToBlacklist(null);
    } catch (error) {
      logger.error('Erreur lors du blacklist (URL exacte):', error);
      toast.error('Erreur lors du blacklist de l\'URL exacte');
    } finally {
      setIsProcessingBlacklist(false);
    }
  };

  const handleBlacklistDomain = async () => {
    if (!companyToBlacklist) return;
    if (!companyToBlacklist.canonical_url) {
      toast.error('Impossible de blacklister le domaine : aucune URL disponible');
      return;
    }

    setIsProcessingBlacklist(true);
    try {
      await blacklistDomain(companyToBlacklist.canonical_url);
      const displayName = getCompanyDisplayName(
        companyToBlacklist.name,
        companyToBlacklist.canonical_url
      );
      toast.success(`Domaine black-listé pour ${displayName}`);
      setCompanyToBlacklist(null);
    } catch (error) {
      logger.error('Erreur lors du blacklist du domaine:', error);
      toast.error('Erreur lors du blacklist du domaine');
    } finally {
      setIsProcessingBlacklist(false);
    }
  };

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!companyToDelete) return;

    try {
      await deleteCompany(companyToDelete.id);
      setShowDeleteModal(false);
      setCompanyToDelete(null);
    } catch (error) {
      logger.error('Error deleting company:', error);
    }
  };

  const CompanyCard = ({ company }: { company: Company }) => {
    const displayName = getCompanyDisplayName(company.name, company.canonical_url);
    const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
    const isMaps = company.sources.includes('google_maps');

    return (
      <div
        className="rounded-xl border p-3.5 transition-shadow hover:shadow-sm"
        data-qualified={company.qualifie ? 'true' : 'false'}
        style={{
          background: company.qualifie ? 'rgba(31, 138, 91, 0.04)' : 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium" style={{ letterSpacing: '-0.005em' }}>{displayName}</span>
              {company.telephone && <Phone className="ico-phone ico-xs" />}
            </div>
            {company.canonical_url && (
              <div className="url mt-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.canonical_url}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn icon danger sm"
            onClick={() => handleDeleteClick(company)}
            title="Supprimer l'entreprise"
          >
            <X className="ico-sm" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className={`src-pill ${isMaps ? 'maps' : 'search'}`}>
            {isMaps ? <MapPin className="ico-xs" /> : <Globe className="ico-xs" />}
            {isMaps ? 'Maps' : 'Search'}
          </span>
          <span className="date">{formatDate(company.created_at)}</span>
        </div>

        {company.adresse && (
          <div className="addr mt-2.5" style={{ fontSize: '11.5px', color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
            <MapPin className="ico-xs" style={{ marginTop: '2px', color: 'var(--text-4)' }} />
            <span>{company.adresse}</span>
          </div>
        )}

        {tags.length > 0 && (
          <div className="tags mt-2.5 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="pill">{tag}</span>
            ))}
            {tags.length > 3 && <span className="pill">+{tags.length - 3}</span>}
          </div>
        )}

        <div className="mt-3 flex items-center gap-1.5 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            className="btn outline sm icon"
            onClick={() => handleVisitWebsite(company)}
            disabled={!company.canonical_url}
            title="Visiter le site"
          >
            <ExternalLink className="ico-sm" />
          </button>
          {!company.qualifie && (
            <button
              type="button"
              className="btn outline sm icon"
              onClick={() => handleToggleHidden(company)}
              title={company.hidden_in_qualification ? 'Réafficher' : 'Masquer'}
            >
              {company.hidden_in_qualification ? <Eye className="ico-sm" /> : <EyeOff className="ico-sm" />}
            </button>
          )}
          <button
            type="button"
            className="btn outline sm"
            onClick={() => setSelectedCompany(company)}
            title="Voir détails"
          >
            <Eye className="ico-sm" />
            Voir
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className={`switch ok ${company.qualifie ? 'on' : ''}`}
            onClick={() => { if (!loading) handleQualificationToggle(company); }}
            disabled={loading}
            aria-pressed={company.qualifie}
            title={company.qualifie ? 'Déqualifier' : 'Qualifier'}
          />
          {company.qualifie && <Check className="ok-mark ico-sm" style={{ color: 'var(--ok)' }} />}
        </div>
      </div>
    );
  };

  return (
    <div className="studio-surface flex min-h-full flex-col">
      {/* Tabs strip */}
      <div className="tabs-strip">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === 'queue'}
          onClick={() => selectTab('queue')}
        >
          <List className="ico-sm" />
          File à qualifier <span className="bd">{queueCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === 'qualified'}
          onClick={() => selectTab('qualified')}
        >
          <Check className="ico-sm" />
          Qualifiées <span className="bd">{qualifiedCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={activeTab === 'hidden'}
          onClick={() => selectTab('hidden')}
        >
          <EyeOff className="ico-sm" />
          Masquées <span className="bd">{hiddenCount}</span>
        </button>
        <Link href="/blacklist" role="tab" aria-selected={false} className="tab">
          <Ban className="ico-sm" />
          Blacklist
        </Link>
        <span className="grow" />
      </div>

      <div className="ws-overview">
        {/* Sprint banner — keep existing functional banner */}
        <div className="mb-4">
          <SprintFlowBanner currentStep="opportunities" />
        </div>

        {/* Header */}
        <div className="ws-header" style={{ marginBottom: 14 }}>
          <div>
            <div className="ws-eyebrow">FILE DE QUALIFICATION</div>
            <h1>
              <em>{queueCount} entreprise{queueCount > 1 ? 's' : ''}</em> à qualifier
            </h1>
            <div className="sub">
              Qualifiez les entreprises pour créer automatiquement des opportunités liées à votre offre active.
            </div>
          </div>
        </div>

        {/* Offer picker */}
        <div className="offer-picker">
          <div className="icw"><Target className="ico" /></div>
          <div>
            <div className="lab">OFFRE ACTIVE POUR LA QUALIFICATION</div>
            <div className="ttl">Les opportunités créées seront liées à cette offre</div>
          </div>
          <div className="grow" />
          <Select
            value={selectedQualificationOfferId ?? undefined}
            onValueChange={setSelectedQualificationOfferId}
          >
            <SelectTrigger id="qualification-offer" className="select-big" aria-label="Offre visible en qualification">
              <SelectValue placeholder="Sélectionnez une offre">
                {selectedOffer ? (
                  <>
                    <span>{selectedOffer.nom}</span>
                    <span className="pill">{selectedOffer.billing_period === 'monthly' ? 'MRR' : 'Ponctuel'}</span>
                    {typeof selectedOffer.prix_ht === 'number' && (
                      <span className="price">{selectedOffer.prix_ht.toLocaleString('fr-FR')} € HT</span>
                    )}
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {qualificationOffers.map((offer) => (
                <SelectItem key={offer.id} value={offer.id}>
                  {offer.nom} {typeof offer.prix_ht === 'number' ? `• ${offer.prix_ht.toLocaleString('fr-FR')}€` : ''} {offer.billing_period === 'monthly' ? '• MRR' : '• Ponctuel'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filter bar */}
        <div className="filter-bar">
          <div className="search-w">
            <Search className="ico-sm" />
            <input
              placeholder="Rechercher entreprise, ville, tag…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <details className="relative">
            <summary className="select-w list-none" style={{ listStyle: 'none' }}>
              <span className="lb">Sources :</span>
              <span className="val">{sourceFilterLabel}</span>
              <ChevronDown className="chev ico-xs" />
            </summary>
            <div className="absolute z-20 mt-2 w-56 space-y-2 rounded-md border p-3 shadow-lg" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              {sourceOptions.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(option.value)}
                    onChange={() => toggleSource(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </details>

          <Select value={urlFilter} onValueChange={(value) => setUrlFilter(value as UrlFilter)}>
            <SelectTrigger id="url-filter" className="select-w" aria-label="Filtre URL">
              <span className="lb">URL :</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              <SelectItem value="with-url">Avec URL uniquement</SelectItem>
              <SelectItem value="without-url">Sans URL uniquement</SelectItem>
            </SelectContent>
          </Select>

          <button
            type="button"
            className="toggle-w"
            onClick={() => setShowQualified(!showQualified)}
            aria-pressed={showQualified}
          >
            <span>{showQualified ? 'Qualifiées' : 'Non qualifiées'}</span>
            <span className={`switch sm ${showQualified ? 'on' : ''}`} />
          </button>

          <button
            type="button"
            className="toggle-w"
            onClick={() => setShowDuplicates(!showDuplicates)}
            aria-pressed={showDuplicates}
          >
            <span>Doublons</span>
            <span className={`switch sm ${showDuplicates ? 'on' : ''}`} />
          </button>

          <button
            type="button"
            className="toggle-w"
            onClick={() => setShowHiddenCompanies(!showHiddenCompanies)}
            aria-pressed={showHiddenCompanies}
          >
            <span>Masquées</span>
            <span className={`switch sm ${showHiddenCompanies ? 'on' : ''}`} />
          </button>

          <span className="grow" />

          <div className="seg">
            <button
              type="button"
              className="s icon"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
              title="Grille"
            >
              <LayoutGrid className="ico-sm" />
            </button>
            <button
              type="button"
              className="s icon"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              title="Liste"
            >
              <List className="ico-sm" />
            </button>
          </div>
        </div>

        {/* Liste / Grille des entreprises */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedCompanies.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>
        ) : (
          <div className="dtable">
            <div className="dtable-head">
              <div></div>
              <div>Entreprise</div>
              <div>Source</div>
              <div>Adresse</div>
              <div>Tags</div>
              <div>Date</div>
              <div>Actions</div>
              <div style={{ textAlign: 'center' }}>Qualification</div>
              <div></div>
            </div>
            {paginatedCompanies.map((company) => {
              const displayName = getCompanyDisplayName(company.name, company.canonical_url);
              const tags = normalizeServiceTags(company.service_tags, company.premiers_tags);
              const isMaps = company.sources.includes('google_maps');

              return (
                <div
                  key={company.id}
                  className="dtable-row"
                  data-qualified={company.qualifie ? 'true' : 'false'}
                >
                  <div className="chk" aria-hidden="true" />
                  <div className="ent">
                    <div className="nm">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                      {company.telephone && <Phone className="ico-phone ico-xs" />}
                    </div>
                    {company.canonical_url && <div className="url">{company.canonical_url}</div>}
                  </div>
                  <div>
                    <div className={`src-pill ${isMaps ? 'maps' : 'search'}`}>
                      {isMaps ? <MapPin className="ico-xs" /> : <Globe className="ico-xs" />}
                      {isMaps ? 'Maps' : 'Search'}
                    </div>
                  </div>
                  <div className="addr">
                    {company.adresse ? (
                      <>
                        <MapPin className="ico-xs" />
                        <span>{company.adresse}</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-4)' }}>—</span>
                    )}
                  </div>
                  <div className="tags">
                    {tags.slice(0, 2).map((tag, index) => (
                      <span key={index} className="pill">{tag}</span>
                    ))}
                    {tags.length > 2 && <span className="pill">+{tags.length - 2}</span>}
                  </div>
                  <div className="date">{formatDate(company.created_at)}</div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleVisitWebsite(company)}
                      disabled={!company.canonical_url}
                      title="Visiter le site"
                    >
                      <ExternalLink className="ico-sm" />
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleToggleHidden(company)}
                      disabled={company.qualifie}
                      title={company.hidden_in_qualification ? 'Réafficher' : 'Masquer'}
                    >
                      {company.hidden_in_qualification ? <Eye className="ico-sm" /> : <EyeOff className="ico-sm" />}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSelectedCompany(company)}
                      title="Voir détails"
                    >
                      <Eye className="ico-sm" />
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => handleBlacklistClick(company)}
                      title="Blacklister"
                    >
                      <Ban className="ico-sm" />
                    </button>
                  </div>
                  <div className="qualif-cell">
                    <button
                      type="button"
                      className={`switch ok ${company.qualifie ? 'on' : ''}`}
                      onClick={() => { if (!loading) handleQualificationToggle(company); }}
                      disabled={loading}
                      aria-pressed={company.qualifie}
                      title={company.qualifie ? 'Déqualifier' : 'Qualifier'}
                    />
                    {company.qualifie && <Check className="ok-mark ico-sm" />}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn icon danger"
                      onClick={() => handleDeleteClick(company)}
                      title="Supprimer"
                    >
                      <X className="ico-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              type="button"
              className={`pg-btn ${currentPage === 1 ? 'disabled' : ''}`}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Page précédente"
            >
              <ChevronLeft className="ico-sm" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className="pg-btn"
                aria-current={currentPage === pageNum ? 'page' : undefined}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              className={`pg-btn ${currentPage === totalPages ? 'disabled' : ''}`}
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Page suivante"
            >
              <ChevronRight className="ico-sm" />
            </button>

            <span className="pg-info">
              Page {currentPage} / {totalPages} · {filteredCompanies.length} entreprise{filteredCompanies.length > 1 ? 's' : ''} au total
            </span>
          </div>
        )}

        {filteredCompanies.length === 0 && (
          <div className="dtable">
            <div className="py-12 text-center">
              <Target className="mx-auto mb-4" style={{ width: 40, height: 40, color: 'var(--text-4)' }} />
              <h3 className="mb-2 font-medium">Aucune entreprise trouvée</h3>
              <p style={{ color: 'var(--text-3)', fontSize: '12.5px' }}>
                {searchTerm || urlFilter !== 'all' || selectedSources.length !== sourceOptions.length || showQualified
                  ? "Modifiez vos filtres pour voir plus d'entreprises"
                  : 'Lancez une recherche pour découvrir des entreprises'}
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={!!companyToBlacklist}
        onOpenChange={(open) => {
          if (!open) {
            setCompanyToBlacklist(null);
            setIsProcessingBlacklist(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Blacklister une entreprise
            </DialogTitle>
            <DialogDescription>
              Choisissez si vous souhaitez blacklister uniquement cette URL ou tout le domaine associé.
            </DialogDescription>
          </DialogHeader>

          {companyToBlacklist && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="font-medium">
                {getCompanyDisplayName(companyToBlacklist.name, companyToBlacklist.canonical_url)}
              </div>
              <div className="text-muted-foreground break-words">
                {companyToBlacklist.canonical_url || 'Aucune URL disponible'}
              </div>
            </div>
          )}

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>URL exacte :</strong> seule cette fiche d'entreprise sera retirée de la qualification.
            </p>
            <p>
              <strong>Domaine complet :</strong> toutes les entreprises partageant ce domaine seront blacklistées.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setCompanyToBlacklist(null);
                setIsProcessingBlacklist(false);
              }}
            >
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleBlacklistExact} disabled={isProcessingBlacklist}>
              Blacklister l'URL exacte
            </Button>
            <Button
              variant="destructive"
              onClick={handleBlacklistDomain}
              disabled={isProcessingBlacklist || !companyToBlacklist?.canonical_url}
            >
              Blacklister le domaine
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de détail */}
      <Dialog open={!!selectedCompany} onOpenChange={() => setSelectedCompany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCompany ? getCompanyDisplayName(selectedCompany.name, selectedCompany.canonical_url) : ''}
            </DialogTitle>
            <DialogDescription>Détails de l'entreprise</DialogDescription>
          </DialogHeader>

          {selectedCompany && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Statut de qualification</label>
                  <div className="mt-1">
                    <Badge variant={selectedCompany.qualifie ? 'default' : 'secondary'}>
                      {selectedCompany.qualifie ? 'Qualifiée' : 'En attente'}
                    </Badge>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Source</label>
                  <div className="mt-1">
                    <Badge variant="outline">
                      {selectedCompany.sources.includes('google_maps') ? 'Google Maps' : 'Google Search'}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedCompany.canonical_url && (
                <div>
                  <label className="text-sm font-medium">Site web</label>
                  <div className="mt-1">
                    <a 
                      href={ensureHttpsUrl(selectedCompany.canonical_url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {selectedCompany.canonical_url}
                    </a>
                  </div>
                </div>
              )}

              {selectedCompany.adresse && (
                <div>
                  <label className="text-sm font-medium">Adresse</label>
                  <div className="mt-1 flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                    <span className="text-sm">{selectedCompany.adresse}</span>
                  </div>
                </div>
              )}

              {/* Contact information section */}
              {selectedCompany.telephone && (
                <div>
                  <label className="text-sm font-medium">Informations de contact</label>
                  <div className="mt-2 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">{selectedCompany.telephone}</span>
                  </div>
                </div>
              )}

              {selectedCompany.premiers_tags && (
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCompany.premiers_tags.split(',').map(t => t.trim()).map((tag, index) => (
                      <Badge key={index} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Créée le</label>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatDate(selectedCompany.created_at)}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Mise à jour le</label>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatDate(selectedCompany.updated_at)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={() => handleVisitWebsite(selectedCompany)}
                  disabled={!selectedCompany.canonical_url}
                  className="flex-1"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Visiter le site
                </Button>
                <Button 
                  variant={selectedCompany.qualifie ? "destructive" : "default"}
                  onClick={() => {
                    handleQualificationToggle(selectedCompany);
                    setSelectedCompany(null);
                  }}
                  className="flex-1"
                >
                  {selectedCompany.qualifie ? 'Déqualifier' : 'Qualifier'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmation de suppression */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Supprimer l'entreprise
            </DialogTitle>
            <DialogDescription>
              {companyToDelete && (
                <>
                  Êtes-vous sûr de vouloir supprimer <strong>{getCompanyDisplayName(companyToDelete.name, companyToDelete.canonical_url)}</strong> ?
                  <br /><br />
                  Cette action supprimera également :
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Toutes les données brutes associées</li>
                    <li>Tous les contacts liés à cette entreprise</li>
                    <li>Toutes les opportunités en cours</li>
                  </ul>
                  <br />
                  <strong>Cette action est irréversible.</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
