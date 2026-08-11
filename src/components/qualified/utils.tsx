import { Employee } from './types';
import { Company } from '../../types';
import { collecterCanaux } from '../../lib/prospects/canal';

export const calculateMetrics = (
  qualifiedCompanies: Company[],
  companyEmployees: Record<number, Employee[]>
) => {
  const stats = {
    withEmailCount: 0,
    withPhoneCount: 0,
    withBothCount: 0,
    withEmployeesCount: 0
  };

  qualifiedCompanies.forEach(c => {
    const employees = companyEmployees[c.id] || [];
    const hasEmail = employees.some(emp => emp.email);
    const hasPhone = employees.some(emp => emp.tel);
    
    if (hasEmail) stats.withEmailCount++;
    if (hasPhone) stats.withPhoneCount++;
    if (hasEmail && hasPhone) stats.withBothCount++;
    if (employees.length > 0) stats.withEmployeesCount++;
  });

  return stats;
};

export const filterCompanies = (
  qualifiedCompanies: Company[],
  companyEmployees: Record<number, Employee[]>,
  searchTerm: string,
  filterBy: string,
  getCompanyDisplayName: (name: string, url: string) => string
) => {
  return qualifiedCompanies.filter(company => {
    const displayName = getCompanyDisplayName(
      company.name ?? '',
      company.canonical_url ?? ''
    );
    const employees = companyEmployees[company.id] || [];
    
    const matchesSearch = !searchTerm || 
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.adresse && company.adresse.toLowerCase().includes(searchTerm.toLowerCase())) ||
      employees.some(emp => 
        (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.tel && emp.tel.includes(searchTerm)) ||
        (emp.nom && emp.nom.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.prenom && emp.prenom.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    
    const matchesFilter =
      filterBy === 'all' ||
      (filterBy === 'has-email' && employees.some(emp => emp.email)) ||
      (filterBy === 'has-phone' && employees.some(emp => emp.tel)) ||
      (filterBy === 'has-both' && employees.some(emp => emp.email && emp.tel)) ||
      (filterBy === 'has-employees' && employees.length > 0) ||
      (CANAL_FILTERS.has(filterBy) && matchesCanalFilter(company, employees, filterBy));

    return matchesSearch && matchesFilter;
  });
};

/**
 * Les filtres qui interrogent le CANAL joignable plutôt que la simple présence
 * d'un champ. « Avec téléphone » ne distingue pas un standard d'un portable —
 * or c'est cette distinction, et elle seule, qui décide de la séquence.
 */
const CANAL_FILTERS = new Set([
  'canal-mobile-sans-email',
  'canal-email-fixe',
  'canal-email-mobile',
  'canal-injoignable',
]);

function matchesCanalFilter(company: Company, employees: Employee[], filterBy: string): boolean {
  // Le prospect ENTIER : un gérant peut porter le seul mobile de l'entreprise,
  // et sans lui la fiche serait classée « fixe seul » à tort.
  const { canaux } = collecterCanaux({
    entrepriseEmail: company.email ?? null,
    entrepriseTelephones: [company.telephone ?? null],
    contacts: employees.map(e => ({ email: e.email, tel: e.tel })),
  });

  switch (filterBy) {
    case 'canal-mobile-sans-email':
      return canaux.has('mobile') && !canaux.has('email');
    case 'canal-email-fixe':
      return canaux.has('email') && canaux.has('fixe') && !canaux.has('mobile');
    case 'canal-email-mobile':
      return canaux.has('email') && canaux.has('mobile');
    case 'canal-injoignable':
      return canaux.size === 0;
    default:
      return true;
  }
}