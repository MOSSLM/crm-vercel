"use client";

import React, { useRef } from 'react';
import { useDrag } from 'react-dnd';
import { useAppData, Opportunity } from '../AppDataContext';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Grip, Calendar, ArrowUp, ArrowDown, Minus, Edit, MessageSquare, DollarSign, Phone, Mail, Linkedin, Globe, AlertCircle } from 'lucide-react';
import { ItemType } from './constants';
import { getCompanyDisplayName } from '../../utils/displayHelpers';

interface OpportunityCardProps {
  opportunity: Opportunity;
  stageColor?: string;
  onView: (opportunity: Opportunity) => void;
  onEdit: (opportunity: Opportunity) => void;
  isReduced?: boolean;
}

/** Card component for displaying an opportunity within the pipeline. */
export const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  stageColor,
  onView,
  onEdit,
  isReduced = false,
}) => {
  const { companies } = useAppData();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: { id: opportunity.id, originalStage: opportunity.stage_id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(ref);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Date inconnue';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const getPriorityIcon = (priority?: string) => {
    switch (priority) {
      case 'haute':
        return <ArrowUp className="h-3 w-3 text-red-500" />;
      case 'moyenne':
        return <Minus className="h-3 w-3 text-yellow-500" />;
      case 'basse':
        return <ArrowDown className="h-3 w-3 text-green-500" />;
      default:
        return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  const associatedCompany = companies.find((c) => c.id === opportunity.entreprise_id);

  const companyDisplayName = getCompanyDisplayName(
    opportunity.companyName || associatedCompany?.name,
    opportunity.companyUrl || associatedCompany?.canonical_url
  );

  const opportunityName = opportunity.name || opportunity.tags || 'Opportunité sans nom';

  const hasPhone = !!(opportunity.telephone || associatedCompany?.telephone);
  const hasEmail = !!opportunity.email;
  const hasLinkedin = !!(opportunity.linkedin_url || associatedCompany?.linkedin_url);
  const hasWebsite = !!(opportunity.companyUrl || associatedCompany?.canonical_url);

  if (isReduced) {
    return (
      <div
        ref={ref}
        className={`mb-2 pipeline-card border rounded-lg transition-all duration-200 border-l-4 ${
          isDragging ? 'opacity-50 transform rotate-2 shadow-lg' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{
          opacity: isDragging ? 0.5 : 1,
          borderLeftColor: stageColor,
        }}
        onClick={() => onView(opportunity)}
      >
        <div className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Grip className="h-3 w-3 text-muted-foreground cursor-grab flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{opportunityName}</div>
                <div className="text-xs text-muted-foreground truncate">{companyDisplayName}</div>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                    {opportunity.type === 'mrr' ? 'MRR' : 'Ponctuel'}
                  </Badge>
                  {hasPhone && <Phone className="h-2 w-2 text-green-600" />}
                  {hasEmail && <Mail className="h-2 w-2 text-blue-600" />}
                  {hasLinkedin && <Linkedin className="h-2 w-2 text-blue-700" />}
                </div>
              </div>
            </div>
            {(opportunity.value || opportunity.montant || opportunity.mrr) && (
              <span className="text-xs text-green-600 font-medium flex-shrink-0 ml-2">
                {opportunity.type === 'mrr' && opportunity.mrr
                  ? `${opportunity.mrr.toLocaleString()}€/mois`
                  : `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`mb-3 pipeline-card border rounded-lg transition-all duration-200 border-l-4 ${
        isDragging ? 'opacity-50 transform rotate-2 shadow-lg' : 'cursor-grab active:cursor-grabbing'
      }`}
      style={{
        opacity: isDragging ? 0.5 : 1,
        borderLeftColor: stageColor,
      }}
      onClick={() => onView(opportunity)}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Grip className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium leading-tight truncate">{opportunityName}</h4>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{companyDisplayName}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {opportunity.type === 'mrr' ? 'MRR' : 'Ponctuel'}
                </Badge>
                {hasPhone && <Phone className="h-3 w-3 text-green-600" />}
                {hasEmail && <Mail className="h-3 w-3 text-blue-600" />}
                {hasLinkedin && <Linkedin className="h-3 w-3 text-blue-700" />}
                {hasWebsite && <Globe className="h-3 w-3 text-gray-600" />}
              </div>
              {(opportunity.value || opportunity.montant || opportunity.mrr) && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600 font-medium">
                    {opportunity.type === 'mrr' && opportunity.mrr
                      ? `${opportunity.mrr.toLocaleString()}€/mois`
                      : `${(opportunity.value || opportunity.montant || 0).toLocaleString()}€`}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">{getPriorityIcon(opportunity.priorite)}</div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Maj le {formatDate(opportunity.updated_at)}
            </div>
          </div>

          {opportunity.opportunityNotes && opportunity.opportunityNotes.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <MessageSquare className="h-3 w-3" />
              {opportunity.opportunityNotes.length} note{opportunity.opportunityNotes.length > 1 ? 's' : ''}
            </div>
          )}

          {opportunity.date_prochain_suivi && (
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <AlertCircle className="h-3 w-3" />
              Suivi : {formatDate(opportunity.date_prochain_suivi)}
            </div>
          )}

          <div className="flex gap-1 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onView(opportunity);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-xs px-2 py-1 h-6"
            >
              Voir
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(opportunity);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-xs px-2 py-1 h-6"
            >
              <Edit className="h-3 w-3 mr-1" />
              Modifier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
