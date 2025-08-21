"use client";

import React, { useState, useEffect } from 'react';
import { useAppData } from './AppDataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Target, 
  TrendingUp, 
  Award, 
  Calendar, 
  Edit,
  CheckCircle,
  AlertCircle,
  Trophy,
  Zap,
  Star,
  Flame,
  Clock,
  Phone,
  Users,
  Building,
  DollarSign,
  FileText,
  Handshake,
  Repeat,
  MagnetIcon,
  CalendarDays,
  CalendarRange,
  Activity,
  Banknote
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

export const ObjectivesPage: React.FC = () => {
  const { 
    currentObjectives, 
    weeklyObjectives,
    annualObjectives,
    updateObjectives,
    updateWeeklyObjectives,
    updateAnnualObjectives,
    opportunities,
    companies,
    contacts, 
    totalCompanies,
    totalQualifiedCompanies,
    achievements,
    pipelineStages,
    getTotalRelances, 
    getTotalAppels, 
    getTotalRdv, 
    getTotalDevis, 
    getTotalSignatures, 
    getTotalAcomptes
  } = useAppData();

  const [isEditingObjectives, setIsEditingObjectives] = useState(false);
  const [editedMonthlyObjectives, setEditedMonthlyObjectives] = useState(currentObjectives || {});
  const [editedWeeklyObjectives, setEditedWeeklyObjectives] = useState(weeklyObjectives || {});
  const [editedAnnualObjectives, setEditedAnnualObjectives] = useState(annualObjectives || {});
  const [activeTab, setActiveTab] = useState('monthly');
  const [editModalTab, setEditModalTab] = useState('monthly');

  // Update edited objectives when context objectives change
  useEffect(() => {
    setEditedMonthlyObjectives(currentObjectives || {});
  }, [currentObjectives]);

  useEffect(() => {
    setEditedWeeklyObjectives(weeklyObjectives || {});
  }, [weeklyObjectives]);

  useEffect(() => {
    setEditedAnnualObjectives(annualObjectives || {});
  }, [annualObjectives]);

  // Calcul des statistiques actuelles avec la nouvelle logique

  const currentStats = {
    leadsFound: totalCompanies,
    leadsQualified: totalQualifiedCompanies,
    calls: getTotalAppels(),
    meetings: getTotalRdv(),
    quotes: getTotalDevis(),
    signatures: getTotalSignatures(),
    deposits: getTotalAcomptes(),
    leadMagnets: opportunities.filter(opp => opp.leadMagnet || opp.lead_magnet).length,
    relances: getTotalRelances(),
    revenue: opportunities
      .filter(opp => {
        // Check if opportunity has reached signature or deposit stage
        const stageReachedSignature = pipelineStages.some(stage => 
          stage.id === opp.stage_id && 
          (stage.nom.toLowerCase().includes('signature') || stage.nom.toLowerCase().includes('acompte'))
        );
        return stageReachedSignature;
      })
      .reduce((sum, opp) => sum + (opp.value || opp.montant || 0), 0)
  };

  const objectiveItems = [
    {
      key: 'leadsFound' as const,
      label: 'Leads trouvés',
      icon: Building,
      color: 'text-blue-600',
      current: currentStats.leadsFound,
      unit: ''
    },
    {
      key: 'leadsQualified' as const,
      label: 'Leads qualifiés',
      icon: CheckCircle,
      color: 'text-green-600',
      current: currentStats.leadsQualified,
      unit: ''
    },
    {
      key: 'calls' as const,
      label: 'Appels effectués',
      icon: Phone,
      color: 'text-purple-600',
      current: currentStats.calls,
      unit: ''
    },
    {
      key: 'meetings' as const,
      label: 'RDV obtenus',
      icon: Calendar,
      color: 'text-orange-600',
      current: currentStats.meetings,
      unit: ''
    },
    {
      key: 'quotes' as const,
      label: 'Devis envoyés',
      icon: FileText,
      color: 'text-indigo-600',
      current: currentStats.quotes,
      unit: ''
    },
    {
      key: 'signatures' as const,
      label: 'Signatures',
      icon: Handshake,
      color: 'text-red-600',
      current: currentStats.signatures,
      unit: ''
    },
    {
      key: 'deposits' as const,
      label: 'Acomptes',
      icon: Banknote,
      color: 'text-emerald-600',
      current: currentStats.deposits,
      unit: ''
    },
    {
      key: 'leadMagnets' as const,
      label: 'Lead Magnets',
      icon: MagnetIcon,
      color: 'text-pink-600',
      current: currentStats.leadMagnets,
      unit: ''
    },
    {
      key: 'relances' as const,
      label: 'Relances totales',
      icon: Repeat,
      color: 'text-yellow-600',
      current: currentStats.relances,
      unit: ''
    },
    {
      key: 'revenue' as const,
      label: 'Chiffre d\'affaires',
      icon: DollarSign,
      color: 'text-green-700',
      current: currentStats.revenue,
      unit: '€'
    }
  ];

  const getCurrentObjectives = () => {
    switch (activeTab) {
      case 'weekly':
        return weeklyObjectives || {};
      case 'annual':
        return annualObjectives || {};
      default:
        return currentObjectives || {};
    }
  };

  const getObjectivesWithStats = () => {
    const objectives = getCurrentObjectives();
    return objectiveItems.map(item => {
      const target = (objectives?.[item.key] as number) || 0;
      return {
        ...item,
        target,
        percentage: target > 0 ? (item.current / target) * 100 : 0
      };
    });
  };

  const handleSaveObjectives = () => {
    switch (editModalTab) {
      case 'weekly':
        updateWeeklyObjectives(editedWeeklyObjectives);
        toast.success('Objectifs hebdomadaires mis à jour !');
        break;
      case 'annual':
        updateAnnualObjectives(editedAnnualObjectives);
        toast.success('Objectifs annuels mis à jour !');
        break;
      default:
        updateObjectives(editedMonthlyObjectives);
        toast.success('Objectifs mensuels mis à jour !');
    }
    setIsEditingObjectives(false);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 100) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (percentage >= 75) return <Target className="h-4 w-4 text-yellow-600" />;
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === '€') {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
    }
    return value.toString();
  };

  const objectivesWithStats = getObjectivesWithStats();
  const overallProgress = Math.round(
    objectivesWithStats.reduce((sum, item) => sum + Math.min(item.percentage, 100), 0) / objectivesWithStats.length
  );
  const completedObjectives = objectivesWithStats.filter(item => item.current >= item.target).length;

  // Achievements récents
  const recentAchievements = achievements
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const getAchievementIcon = (type: string) => {
    switch (type) {
      case 'signature': return <Handshake className="h-5 w-5 text-red-600" />;
      case 'deposit': return <Banknote className="h-5 w-5 text-emerald-600" />;
      case 'lead_magnet': return <MagnetIcon className="h-5 w-5 text-pink-600" />;
      case 'qualified': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'meeting': return <Calendar className="h-5 w-5 text-orange-600" />;
      case 'monthly_goal': return <Trophy className="h-5 w-5 text-yellow-600" />;
      default: return <Star className="h-5 w-5 text-blue-600" />;
    }
  };

  const getPeriodLabel = (tab: string) => {
    switch (tab) {
      case 'weekly':
        return 'cette semaine';
      case 'annual':
        return 'cette année';
      default:
        return 'ce mois';
    }
  };

  const getPeriodIcon = (tab: string) => {
    switch (tab) {
      case 'weekly':
        return CalendarDays;
      case 'annual':
        return CalendarRange;
      default:
        return Calendar;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Objectifs & Performance</h1>
          <p className="text-muted-foreground">
            Suivez vos objectifs et célébrez vos réussites sur différentes périodes
          </p>
        </div>
        
        <Dialog open={isEditingObjectives} onOpenChange={setIsEditingObjectives}>
          <DialogTrigger asChild>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Modifier les objectifs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Modifier les objectifs</DialogTitle>
              <DialogDescription>
                Définissez vos objectifs par période (hebdomadaire, mensuelle, annuelle)
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={editModalTab} onValueChange={setEditModalTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="weekly">
                  Hebdomadaire
                </TabsTrigger>
                <TabsTrigger value="monthly">
                  Mensuelle
                </TabsTrigger>
                <TabsTrigger value="annual">
                  Annuelle
                </TabsTrigger>
              </TabsList>

              <div className="max-h-[50vh] overflow-y-auto">
                <TabsContent value="weekly" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {objectiveItems.map((item) => (
                      <div key={item.key} className="space-y-2">
                        <Label htmlFor={`weekly-${item.key}`} className="flex items-center gap-2">
                          {React.createElement(item.icon, { className: `h-4 w-4 ${item.color}` })}
                          {item.label}
                        </Label>
                        <Input
                          id={`weekly-${item.key}`}
                          type="number"
                          value={editedWeeklyObjectives[item.key] || 0}
                          onChange={(e) => setEditedWeeklyObjectives(prev => ({
                            ...prev,
                            [item.key]: parseInt(e.target.value) || 0
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="monthly" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {objectiveItems.map((item) => (
                      <div key={item.key} className="space-y-2">
                        <Label htmlFor={`monthly-${item.key}`} className="flex items-center gap-2">
                          {React.createElement(item.icon, { className: `h-4 w-4 ${item.color}` })}
                          {item.label}
                        </Label>
                        <Input
                          id={`monthly-${item.key}`}
                          type="number"
                          value={editedMonthlyObjectives[item.key] || 0}
                          onChange={(e) => setEditedMonthlyObjectives(prev => ({
                            ...prev,
                            [item.key]: parseInt(e.target.value) || 0
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="annual" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {objectiveItems.map((item) => (
                      <div key={item.key} className="space-y-2">
                        <Label htmlFor={`annual-${item.key}`} className="flex items-center gap-2">
                          {React.createElement(item.icon, { className: `h-4 w-4 ${item.color}` })}
                          {item.label}
                        </Label>
                        <Input
                          id={`annual-${item.key}`}
                          type="number"
                          value={editedAnnualObjectives[item.key] || 0}
                          onChange={(e) => setEditedAnnualObjectives(prev => ({
                            ...prev,
                            [item.key]: parseInt(e.target.value) || 0
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
            
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleSaveObjectives}>Sauvegarder</Button>
              <Button variant="outline" onClick={() => setIsEditingObjectives(false)}>
                Annuler
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sélecteur de période */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span className="font-medium">Vue des objectifs :</span>
            </div>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">
                  Hebdomadaire
                </SelectItem>
                <SelectItem value="monthly">
                  Mensuelle
                </SelectItem>
                <SelectItem value="annual">
                  Annuelle
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="objectives">Objectifs détaillés</TabsTrigger>
          <TabsTrigger value="achievements">Réussites</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Résumé global */}
          <div className="grid gap-6 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Progression globale</CardTitle>
                {React.createElement(getPeriodIcon(activeTab), { className: "h-4 w-4 text-muted-foreground" })}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallProgress}%</div>
                <Progress value={overallProgress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Moyenne {getPeriodLabel(activeTab)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Objectifs atteints</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completedObjectives}</div>
                <p className="text-xs text-muted-foreground">
                  Sur {objectiveItems.length} objectifs {getPeriodLabel(activeTab)}
                </p>
                <Progress value={(completedObjectives / objectiveItems.length) * 100} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Réussites totales</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{achievements.length}</div>
                <p className="text-xs text-muted-foreground">
                  Accomplissements débloqués
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm">Période actuelle</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">
                  {activeTab === 'weekly' && weeklyObjectives?.periode && `Semaine ${weeklyObjectives.periode.split('-W')[1]}`}
                  {activeTab === 'monthly' && new Date().toLocaleDateString('fr-FR', { month: 'long' })}
                  {activeTab === 'annual' && new Date().getFullYear()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeTab === 'weekly' && new Date().getFullYear()}
                  {activeTab === 'monthly' && new Date().getFullYear()}
                  {activeTab === 'annual' && 'Objectifs annuels'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top 3 objectifs */}
          <Card>
            <CardHeader>
              <CardTitle>Top 3 Performances {getPeriodLabel(activeTab)}</CardTitle>
              <CardDescription>Vos meilleurs résultats pour la période sélectionnée</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {objectivesWithStats
                  .sort((a, b) => b.percentage - a.percentage)
                  .slice(0, 3)
                  .map((item, index) => (
                    <div key={item.key} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          index === 0 ? 'bg-yellow-100' : 
                          index === 1 ? 'bg-gray-100' : 'bg-orange-100'
                        }`}>
                          {index === 0 && <Trophy className="h-5 w-5 text-yellow-600" />}
                          {index === 1 && <Award className="h-5 w-5 text-gray-600" />}
                          {index === 2 && <Star className="h-5 w-5 text-orange-600" />}
                        </div>
                        {React.createElement(item.icon, { className: `h-5 w-5 ${item.color}` })}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatValue(item.current, item.unit)} / {formatValue(item.target, item.unit)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${item.percentage >= 100 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {Math.round(item.percentage)}%
                        </p>
                        <Badge variant={item.percentage >= 100 ? "default" : "secondary"} className="mt-1">
                          {item.percentage >= 100 ? 'Atteint' : 'En cours'}
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="objectives" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {objectivesWithStats.map((item) => (
              <Card key={item.key} className={item.percentage >= 100 ? 'border-green-200 bg-green-50' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">{item.label}</CardTitle>
                  {React.createElement(item.icon, { className: `h-4 w-4 ${item.color}` })}
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2">
                    <div className="text-2xl font-bold">
                      {formatValue(item.current, item.unit)}
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      / {formatValue(item.target, item.unit)}
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progression {getPeriodLabel(activeTab)}</span>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(item.percentage)}
                        <span>{Math.round(item.percentage)}%</span>
                      </div>
                    </div>
                    <Progress 
                      value={Math.min(item.percentage, 100)} 
                      className="h-2"
                    />
                    
                    {item.percentage >= 100 && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        <span>Objectif atteint ! 🎉</span>
                      </div>
                    )}
                    
                    {item.percentage < 100 && (
                      <div className="text-xs text-muted-foreground">
                        Reste {item.target - item.current} {item.unit} à atteindre {getPeriodLabel(activeTab)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Réussites récentes</CardTitle>
                <CardDescription>Vos derniers accomplissements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentAchievements.length > 0 ? (
                    recentAchievements.map((achievement) => (
                      <div key={achievement.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="p-2 bg-muted rounded-full">
                          {getAchievementIcon(achievement.type)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{achievement.title}</p>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                          {achievement.companyName && (
                            <Badge variant="outline" className="mt-1">
                              {achievement.companyName}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(achievement.date).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucune réussite pour le moment</p>
                      <p className="text-sm">Continuez vos efforts !</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prochains défis</CardTitle>
                <CardDescription>Objectifs {getPeriodLabel(activeTab)} à atteindre</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {objectivesWithStats
                    .filter(item => item.current < item.target)
                    .sort((a, b) => b.percentage - a.percentage)
                    .slice(0, 5)
                    .map((item) => {
                      const remaining = item.target - item.current;
                      return (
                        <div key={item.key} className="flex items-center gap-3 p-3 border rounded-lg">
                          {React.createElement(item.icon, { className: `h-4 w-4 ${item.color}` })}
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.label}</p>
                            <p className="text-xs text-muted-foreground">
                              Plus que {remaining} {item.unit} ({Math.round(item.percentage)}% atteint)
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              {formatValue(item.current, item.unit)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              /{formatValue(item.target, item.unit)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};