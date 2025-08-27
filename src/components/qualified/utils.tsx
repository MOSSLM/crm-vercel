import { Employee } from './types';
import { Company } from '../../types';

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
      (filterBy === 'has-employees' && employees.length > 0);
    
    return matchesSearch && matchesFilter;
  });
};