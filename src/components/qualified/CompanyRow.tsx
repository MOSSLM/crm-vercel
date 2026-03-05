"use client";

import React from 'react';
import { Building, MapPin, Globe, Users, Mail, Phone, CheckCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { getCompanyDisplayName } from '../../utils/displayHelpers';
import { Employee, QUALIFIED_COMPANIES_CONSTANTS } from './types';
import { Company } from '../../types';
import { normalizeServiceTags } from '../../utils/serviceTags';

interface CompanyRowProps {
  company: Company;
  employees: Employee[];
  onContactClick?: (companyId: number) => void;
  onEmployeeClick: (employee: Employee, e: React.MouseEvent) => void;
}

export const CompanyRow: React.FC<CompanyRowProps> = React.memo(({ 
  company, 
  employees, 
  onContactClick, 
  onEmployeeClick 
}) => {
  const displayName = getCompanyDisplayName(company.name, company.canonical_url);
  const serviceTags = normalizeServiceTags(company.service_tags, company.premiers_tags);

  return (
    <div 
      className="flex items-center justify-between p-4 border rounded-lg cursor-pointer bg-card"
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
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
          <Building className="h-5 w-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{displayName}</span>
            <Badge variant="default" className="text-xs flex-shrink-0">
              <CheckCircle className="h-3 w-3 mr-1" />
              Qualifiée
            </Badge>
            {employees.length > 0 && (
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                <Users className="h-3 w-3 mr-1" />
                {employees.length}
              </Badge>
            )}
          </div>
          
          {company.adresse && (
            <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{company.adresse}</span>
            </div>
          )}
          
          {employees.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {employees.slice(0, QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST).map((employee, index) => {
                const name = employee.prenom && employee.nom 
                  ? `${employee.prenom} ${employee.nom}`
                  : employee.nom || employee.prenom || 'Employé';
                return (
                  <span 
                    key={employee.id}
                    className="cursor-pointer simple-hover"
                    onClick={(e) => onEmployeeClick(employee, e)}
                  >
                    {name}
                    {employee.poste && ` (${employee.poste})`}
                    {index < Math.min(employees.length - 1, 1) && ', '}
                  </span>
                );
              })}
              {employees.length > QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST && ` +${employees.length - QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST} autre${employees.length - QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_EMPLOYEES_LIST > 1 ? 's' : ''}`}
            </div>
          )}

          {serviceTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {serviceTags.slice(0, QUALIFIED_COMPANIES_CONSTANTS.MAX_VISIBLE_TAGS).map((tag: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex gap-2">
            {employees.some(emp => emp.email) && <Mail className="h-4 w-4 text-green-600" />}
            {employees.some(emp => emp.tel) && <Phone className="h-4 w-4 text-blue-600" />}
            {company.canonical_url && <Globe className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </div>
      
      <div className="text-right flex-shrink-0">
        <div className="text-sm">
          <div>{employees.length} contact{employees.length > 1 ? 's' : ''}</div>
        </div>
        {company.updated_at && (
          <div className="text-xs text-muted-foreground">
            {new Date(company.updated_at).toLocaleDateString('fr-FR')}
          </div>
        )}
      </div>
    </div>
  );
});

CompanyRow.displayName = 'CompanyRow';
