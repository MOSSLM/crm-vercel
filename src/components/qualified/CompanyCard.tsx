"use client";

import React from 'react';
import { Building, MapPin, Globe, Users, Calendar } from 'lucide-react';
import { getCompanyDisplayName, ensureHttpsUrl } from '../../utils/displayHelpers';
import { Employee, QUALIFIED_COMPANIES_CONSTANTS } from './types';
import { Company } from '../../types';

interface CompanyCardProps {
  company: Company;
  employees: Employee[];
  onContactClick?: (companyId: number) => void;
}

export const CompanyCard: React.FC<CompanyCardProps> = React.memo(({ 
  company, 
  employees, 
  onContactClick 
}) => {
  const displayName = getCompanyDisplayName(company.name, company.canonical_url);

  return (
    <div 
      className="border border-border rounded-lg p-4 cursor-pointer bg-card"
      style={{ 
        transition: 'none',
        transform: 'none',
        animation: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
      onClick={() => onContactClick?.(company.id)}
    >
      <div className="space-y-3">
        {/* Titre simplifié */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium leading-tight break-words">
              {displayName}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
              Qualifiée
            </span>
            {employees.length > 0 && (
              <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
                {employees.length} contacts
              </span>
            )}
          </div>
        </div>
        
        {/* Adresse simplifiée */}
        {company.adresse && (
          <div className="flex items-start gap-2">
            <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground break-words">
              {company.adresse}
            </span>
          </div>
        )}

        {/* Site web simplifié */}
        {company.canonical_url && (
          <div className="flex items-start gap-2">
            <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
            <a 
              href={ensureHttpsUrl(company.canonical_url)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 text-xs break-all"
              onClick={(e) => e.stopPropagation()}
            >
              Site web
            </a>
          </div>
        )}

        {/* Employés simplifiés */}
        {employees.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground mb-1">
              {employees.length} employé{employees.length > 1 ? 's' : ''}
            </div>
            {employees.slice(0, QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST).map((employee) => {
              const name = employee.prenom && employee.nom 
                ? `${employee.prenom} ${employee.nom}`
                : employee.nom || employee.prenom || 'Employé';
              
              return (
                <div key={employee.id} className="text-xs text-muted-foreground">
                  {name}
                  {employee.poste && ` - ${employee.poste}`}
                </div>
              );
            })}
            {employees.length > QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST && (
              <div className="text-xs text-muted-foreground">
                +{employees.length - QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST} autre{employees.length - QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

CompanyCard.displayName = 'CompanyCard';