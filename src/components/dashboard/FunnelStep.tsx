import React from 'react';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ArrowDown } from 'lucide-react';
import { FunnelStepData } from './types';

interface FunnelStepProps {
  step: FunnelStepData;
  index: number;
  isLast: boolean;
  totalCompanies: number;
  funnelSteps: FunnelStepData[];
}

export const FunnelStep: React.FC<FunnelStepProps> = ({ 
  step, 
  index, 
  isLast, 
  totalCompanies, 
  funnelSteps 
}) => {
  const maxWidth = 450;
  const stepWidth = Math.max(100, (step.percentage / 100) * maxWidth);
  const prevStep = index > 0 ? funnelSteps[index - 1] : null;
  const conversionRate = prevStep ? ((step.value / prevStep.value) * 100) : 100;
  
  return (
    <TooltipProvider>
      <div className="relative w-full">
        {/* Container centré et ultra-compact */}
        <div className="flex flex-col items-center py-2 md:py-3">
          
          {/* Barre de l'entonnoir avec titre intégré */}
          <div className="flex flex-col items-center w-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative flex justify-center w-full cursor-help">
                  <div 
                    className={`h-16 md:h-20 ${step.color} rounded-xl md:rounded-2xl shadow-xl relative transition-all duration-500 ease-out hover:shadow-2xl hover:scale-105 w-full max-w-xs md:max-w-none`}
                    style={{ width: `min(${stepWidth}px, 90vw)`, minWidth: '120px' }}
                  >
                    {/* Effet de brillance subtil */}
                    <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-b from-white/30 to-transparent rounded-t-xl md:rounded-t-2xl"></div>
                    
                    {/* Contenu de la barre avec titre et icône */}
                    <div className="flex flex-col items-center justify-center h-full text-white p-1 md:p-2">
                      <div className="flex items-center gap-1 md:gap-2 mb-1">
                        <step.icon className="h-3 w-3 md:h-4 md:w-4" />
                        <h3 className="text-xs md:text-sm font-semibold text-center leading-tight">{step.name}</h3>
                      </div>
                      <div className="text-center">
                        <div className="text-lg md:text-2xl font-bold">{step.value}</div>
                        <div className="text-xs opacity-90">{step.percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-center">
                  <p className="font-medium">{step.name}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  <div className="mt-1 text-xs">
                    <span className="font-medium">{step.value}</span> sur {totalCompanies} ({step.percentage.toFixed(1)}%)
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
            
            {/* Badge de conversion sous la barre */}
            {prevStep && (
              <div className="mt-1 md:mt-2">
                <Badge 
                  variant={conversionRate >= 20 ? "default" : conversionRate >= 10 ? "secondary" : "destructive"}
                  className="text-xs px-2 md:px-3 py-1"
                >
                  {conversionRate.toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Flèche de connexion minimaliste */}
        {!isLast && (
          <div className="flex justify-center py-1">
            <ArrowDown className="h-3 w-3 md:h-4 md:w-4 text-gray-400" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};