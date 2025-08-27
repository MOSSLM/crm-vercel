import { useState, useEffect } from 'react';
import { companiesApi } from '../utils/companyApi';
import { Company, RevenueBand, EmployeeBand } from '../components/AppDataContext';

/** Hook encapsulating logic for the company detail page. */
export const useCompanyDetail = (
  companyId: number,
  companies: Company[],
  updateCompany: (id: number, updates: any) => Promise<void>
) => {
  const [company, setCompany] = useState<Company | null>(null);
  const [detailedCompany, setDetailedCompany] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    canonical_url: '',
    adresse: '',
    premiers_tags: '',
    lat: 0,
    lng: 0,
    qualifie: false,
    ca_estime_band: 'unknown' as RevenueBand,
    nb_employes_band: 'unknown' as EmployeeBand,
    nb_employes_exact: '',
    linkedin_url: '',
    site_web_canonique: '',
    manually_enriched: false,
  });

  useEffect(() => {
    const foundCompany = companies.find((c) => c.id === companyId);
    if (foundCompany) {
      setCompany(foundCompany);
      setFormData({
        name: foundCompany.name || '',
        canonical_url: foundCompany.canonical_url || '',
        adresse: foundCompany.adresse || '',
        premiers_tags: foundCompany.premiers_tags || '',
        lat: foundCompany.lat || 0,
        lng: foundCompany.lng || 0,
        qualifie: foundCompany.qualifie || false,
        ca_estime_band: (foundCompany.ca_estime_band as RevenueBand) || 'unknown',
        nb_employes_band: (foundCompany.nb_employes_band as EmployeeBand) || 'unknown',
        nb_employes_exact: foundCompany.nb_employes_exact?.toString() || '',
        linkedin_url: foundCompany.linkedin_url || '',
        site_web_canonique: foundCompany.site_web_canonique || '',
        manually_enriched: foundCompany.manually_enriched || false,
      });
      loadDetailedCompanyData(foundCompany.id);
    }
  }, [companyId, companies]);

  const loadDetailedCompanyData = async (id: number) => {
    setLoadingDetails(true);
    try {
      const detailed = await companiesApi.getById(id);
      setDetailedCompany(detailed);
    } catch (error) {
      console.error('Error loading detailed company data:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const save = async () => {
    if (!company) return;
    setIsLoading(true);
    try {
      const updates: any = {
        ...formData,
        nb_employes_exact: formData.nb_employes_exact ? parseInt(formData.nb_employes_exact) : null,
        manually_enriched: formData.manually_enriched,
        enriched_at: formData.manually_enriched ? new Date().toISOString() : null,
        ca_estime_band: formData.ca_estime_band.replace(/-/g, '_'),
        nb_employes_band: formData.nb_employes_band.replace(/-/g, '_'),
      };
      await updateCompany(company.id, updates);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving company:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    company,
    detailedCompany,
    formData,
    setFormData,
    isEditing,
    setIsEditing,
    isLoading,
    loadingDetails,
    loadDetailedCompanyData,
    save,
  };
};
