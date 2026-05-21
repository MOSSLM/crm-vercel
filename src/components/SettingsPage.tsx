"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
  RotateCcw,
  Palette,
  User, 
  Settings, 
  Bell, 
  Shield, 
  Download, 
  Upload, 
  Trash2, 
  Eye, 
  EyeOff,
  Camera,
  MapPin,
  Moon,
  Sun,
  Smartphone,
  Mail,
  Phone,
  Building,
  BarChart3,
  BookOpen,
  Target,
  Sparkles
} from 'lucide-react';
import { useTheme } from './ThemeContext';
import { THEME_PRESETS, ThemePreset } from './themePresets';
import { EnrichmentTagsSettings } from './settings/EnrichmentTagsSettings';

export const SettingsPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const {
    theme,
    setTheme,
    resolvedTheme,
    themePreset,
    setThemePreset,
    customThemeColors,
    setCustomThemeColor,
    resetCustomThemeColors,
  } = useTheme();
  const [notifications, setNotifications] = useState({
    newSearchComplete: true,
    qualificationUpdates: true,
    pipelineChanges: true,
    weeklyReports: false,
    monthlyReports: true
  });

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
  };

  const colorPickerFields = [
    { key: '--background', label: 'Fond principal' },
    { key: '--card', label: 'Fond cartes' },
    { key: '--accent', label: 'Accent UI' },
    { key: '--primary', label: 'Couleur primaire' },
    { key: '--chart-1', label: 'Chart 1' },
    { key: '--chart-2', label: 'Chart 2' },
    { key: '--chart-3', label: 'Chart 3' },
    { key: '--chart-4', label: 'Chart 4' },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 md:px-6 md:py-6">
      <div>
        <h1>Paramètres</h1>
        <p className="text-muted-foreground">
          Gérez votre profil, vos préférences et la configuration de l'application
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accès rapides paramètres</CardTitle>
          <CardDescription>
            Ces pages restent disponibles depuis les paramètres pour garder la navigation principale plus légère.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button asChild variant="outline" className="h-auto justify-start p-4">
            <Link href="/docs/themes" className="flex w-full items-start gap-3">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="space-y-1 text-left">
                <span className="block font-medium">Docs thèmes</span>
                <span className="block text-xs text-muted-foreground">Documentation des thèmes.</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start p-4">
            <Link href="/results" className="flex w-full items-start gap-3">
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="space-y-1 text-left">
                <span className="block font-medium">Results</span>
                <span className="block text-xs text-muted-foreground">Historique des résultats.</span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start p-4">
            <Link href="/objectifs" className="flex w-full items-start gap-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="space-y-1 text-left">
                <span className="block font-medium">Objectifs</span>
                <span className="block text-xs text-muted-foreground">Suivi des objectifs.</span>
              </span>
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 md:grid-cols-6">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profil
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Préférences
          </TabsTrigger>
          <TabsTrigger value="enrichment" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Enrichissement
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Données
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
              <CardDescription>
                Mettez à jour vos informations de profil
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="w-20 h-20">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-lg">JD</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Changer la photo
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Formats acceptés: JPG, PNG (max 2MB)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" defaultValue="Jean" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" defaultValue="Dupont" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" className="pl-10" defaultValue="jean.dupont@exemple.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" type="tel" className="pl-10" defaultValue="+33 1 23 45 67 89" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Entreprise</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="company" className="pl-10" defaultValue="Ma Société SAS" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Localisation</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="location" className="pl-10" defaultValue="Paris, France" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Biographie</Label>
                <Textarea 
                  id="bio" 
                  rows={3}
                  placeholder="Décrivez votre activité professionnelle..."
                  defaultValue="Expert en développement commercial et prospection B2B. Spécialisé dans l'acquisition de nouveaux clients et la gestion de pipeline de ventes."
                />
              </div>

              <Button className="w-full">Sauvegarder les modifications</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Préférences de recherche</CardTitle>
              <CardDescription>
                Définissez vos paramètres par défaut pour les nouvelles recherches
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Activer Google Maps par défaut</Label>
                  <div className="text-sm text-muted-foreground">
                    Google Maps sera automatiquement sélectionné dans les nouvelles recherches
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Activer Google Search par défaut</Label>
                  <div className="text-sm text-muted-foreground">
                    La recherche Google sera automatiquement activée
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="space-y-2">
                <Label>Précision par défaut</Label>
                <Select defaultValue="Moyenne">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Basique">Basique</SelectItem>
                    <SelectItem value="Moyenne">Moyenne</SelectItem>
                    <SelectItem value="Élevée">Élevée</SelectItem>
                    <SelectItem value="Maximale">Maximale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nombre maximum de résultats par recherche</Label>
                <Select defaultValue="100">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 entreprises</SelectItem>
                    <SelectItem value="100">100 entreprises</SelectItem>
                    <SelectItem value="200">200 entreprises</SelectItem>
                    <SelectItem value="500">500 entreprises</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interface et affichage</CardTitle>
              <CardDescription>
                Personnalisez l'apparence de l'application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    {resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    Mode sombre
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Basculer vers un thème sombre pour réduire la fatigue oculaire
                  </div>
                </div>
                <Switch
                  checked={resolvedTheme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              </div>

              <div className="space-y-2">
                <Label>Mode de thème</Label>
                <Select value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Clair</SelectItem>
                    <SelectItem value="dark">Sombre</SelectItem>
                    <SelectItem value="system">Système</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Gestionnaire de thèmes visuels</Label>
                <p className="text-sm text-muted-foreground">
                  Chaque preset change les couleurs d'interface, les couleurs de graphiques, le radius et le style de bordure.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setThemePreset(preset.id as ThemePreset)}
                      className={`rounded-lg border p-3 text-left transition hover:shadow-sm ${
                        themePreset === preset.id
                          ? 'border-primary bg-accent/40'
                          : 'border-border bg-card/60 hover:bg-accent/25'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-medium">{preset.name}</span>
                        {themePreset === preset.id ? <Badge>Actif</Badge> : null}
                      </div>
                      <p className="mb-3 text-sm text-muted-foreground">{preset.description}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.cssVars['--chart-1'] ?? '#3b82f6' }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.cssVars['--chart-2'] ?? '#ef4444' }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.cssVars['--chart-3'] ?? '#10b981' }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.cssVars['--chart-4'] ?? '#f59e0b' }} />
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.cssVars['--chart-5'] ?? '#8b5cf6' }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>



              <Separator />

              <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-2"><Palette className="h-4 w-4" /> Personnalisation avancée</Label>
                  <Button type="button" variant="outline" size="sm" onClick={resetCustomThemeColors} className="gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ajustez les couleurs du thème en direct avec des color pickers (bonnes pratiques shadcn: contraste et cohérence).
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {colorPickerFields.map((field) => (
                    <div key={field.key} className="rounded-lg border border-border/70 bg-background/70 p-2">
                      <Label htmlFor={`picker-${field.key}`} className="mb-2 block text-xs">{field.label}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`picker-${field.key}`}
                          type="color"
                          value={customThemeColors[field.key] ?? '#ffffff'}
                          onChange={(e) => setCustomThemeColor(field.key, e.target.value)}
                          className="h-9 w-12 cursor-pointer p-1"
                        />
                        <Input
                          value={customThemeColors[field.key] ?? ''}
                          onChange={(e) => setCustomThemeColor(field.key, e.target.value)}
                          placeholder="#ffffff"
                          className="h-9"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>


              <div className="space-y-2">
                <Label>Vue par défaut des résultats</Label>
                <Select defaultValue="cards">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cards">Cartes</SelectItem>
                    <SelectItem value="list">Liste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Éléments par page</Label>
                <Select defaultValue="20">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 éléments</SelectItem>
                    <SelectItem value="20">20 éléments</SelectItem>
                    <SelectItem value="50">50 éléments</SelectItem>
                    <SelectItem value="100">100 éléments</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Animations réduites</Label>
                  <div className="text-sm text-muted-foreground">
                    Réduire les animations pour améliorer les performances
                  </div>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline et CRM</CardTitle>
              <CardDescription>
                Configurez vos préférences pour le pipeline de ventes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Valeur par défaut des opportunités</Label>
                <Input type="number" defaultValue="2500" placeholder="Montant en euros" />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-qualification intelligente</Label>
                  <div className="text-sm text-muted-foreground">
                    Pré-qualifier automatiquement les entreprises selon vos critères
                  </div>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Rappels automatiques</Label>
                  <div className="text-sm text-muted-foreground">
                    Créer des rappels pour les suivis de prospects
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrichment" className="space-y-6">
          <EnrichmentTagsSettings />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notifications par email</CardTitle>
              <CardDescription>
                Choisissez les notifications que vous souhaitez recevoir
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Nouvelles recherches terminées</Label>
                  <div className="text-sm text-muted-foreground">
                    Être notifié quand une recherche est complétée
                  </div>
                </div>
                <Switch 
                  checked={notifications.newSearchComplete}
                  onCheckedChange={(value) => handleNotificationChange('newSearchComplete', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Mises à jour de qualification</Label>
                  <div className="text-sm text-muted-foreground">
                    Être notifié des changements de statut des prospects
                  </div>
                </div>
                <Switch 
                  checked={notifications.qualificationUpdates}
                  onCheckedChange={(value) => handleNotificationChange('qualificationUpdates', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Changements de pipeline</Label>
                  <div className="text-sm text-muted-foreground">
                    Être notifié quand une opportunité change d'étape
                  </div>
                </div>
                <Switch 
                  checked={notifications.pipelineChanges}
                  onCheckedChange={(value) => handleNotificationChange('pipelineChanges', value)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Rapports hebdomadaires</Label>
                  <div className="text-sm text-muted-foreground">
                    Recevoir un résumé de votre activité chaque semaine
                  </div>
                </div>
                <Switch 
                  checked={notifications.weeklyReports}
                  onCheckedChange={(value) => handleNotificationChange('weeklyReports', value)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Rapports mensuels</Label>
                  <div className="text-sm text-muted-foreground">
                    Recevoir un bilan détaillé chaque mois
                  </div>
                </div>
                <Switch 
                  checked={notifications.monthlyReports}
                  onCheckedChange={(value) => handleNotificationChange('monthlyReports', value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications push</CardTitle>
              <CardDescription>
                Gérez les notifications dans l'application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  Les notifications push ne sont actuellement pas activées pour cette application. 
                  Vous pouvez utiliser les notifications par email en attendant.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-0.5">
                  <Label>Notifications desktop</Label>
                  <div className="text-sm text-muted-foreground">
                    Afficher des notifications sur votre bureau
                  </div>
                </div>
                <Switch disabled />
              </div>

              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-0.5">
                  <Label>Sons de notification</Label>
                  <div className="text-sm text-muted-foreground">
                    Jouer un son lors des notifications importantes
                  </div>
                </div>
                <Switch disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sécurité du compte</CardTitle>
              <CardDescription>
                Gérez la sécurité et l'accès à votre compte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                <div className="relative">
                  <Input 
                    id="currentPassword" 
                    type={showPassword ? "text" : "password"}
                    placeholder="Entrez votre mot de passe actuel"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <Input 
                  id="newPassword" 
                  type="password"
                  placeholder="Entrez votre nouveau mot de passe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
                <Input 
                  id="confirmPassword" 
                  type="password"
                  placeholder="Confirmez votre nouveau mot de passe"
                />
              </div>

              <Button className="w-full">Changer le mot de passe</Button>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Authentification à deux facteurs</Label>
                    <div className="text-sm text-muted-foreground">
                      Ajouter une couche de sécurité supplémentaire
                    </div>
                  </div>
                  <Badge variant="outline">Bientôt disponible</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Sessions actives</Label>
                    <div className="text-sm text-muted-foreground">
                      Gérer les appareils connectés à votre compte
                    </div>
                  </div>
                  <Button variant="outline" disabled>
                    Voir les sessions
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Confidentialité</CardTitle>
              <CardDescription>
                Contrôlez la confidentialité de vos données
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Analyse d'utilisation</Label>
                  <div className="text-sm text-muted-foreground">
                    Aider à améliorer l'application en partageant des données d'usage anonymes
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Partage automatique de données</Label>
                  <div className="text-sm text-muted-foreground">
                    Synchroniser vos données avec des services tiers autorisés
                  </div>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export de données</CardTitle>
              <CardDescription>
                Téléchargez vos données dans différents formats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exporter les recherches (CSV)
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exporter les entreprises (Excel)
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exporter les contacts (vCard)
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Exporter le pipeline (JSON)
                </Button>
              </div>

              <Separator />

              <Button className="w-full flex items-center gap-2">
                <Download className="h-4 w-4" />
                Exporter toutes les données (Archive ZIP)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import de données</CardTitle>
              <CardDescription>
                Importez des données depuis d'autres sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Upload className="h-4 w-4" />
                <AlertDescription>
                  L'import de données sera bientôt disponible. En attendant, vous pouvez nous contacter 
                  pour une migration assistée depuis d'autres outils CRM.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-50">
                <Button variant="outline" disabled className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Importer contacts (CSV)
                </Button>
                <Button variant="outline" disabled className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Importer entreprises (Excel)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sauvegarde automatique</CardTitle>
              <CardDescription>
                Configurez les sauvegardes de sécurité
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Sauvegarde automatique</Label>
                  <div className="text-sm text-muted-foreground">
                    Créer automatiquement des sauvegardes de vos données
                  </div>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="space-y-2">
                <Label>Fréquence des sauvegardes</Label>
                <Select defaultValue="weekly">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Quotidienne</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dernière sauvegarde</Label>
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  23 janvier 2025 à 14:30 (il y a 2 heures)
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Zone de danger</CardTitle>
              <CardDescription>
                Actions irréversibles - procédez avec prudence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Trash2 className="h-4 w-4" />
                <AlertDescription>
                  Les actions ci-dessous sont irréversibles. Assurez-vous d'avoir une sauvegarde 
                  de vos données importantes avant de procéder.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button variant="outline" className="w-full text-orange-600 border-orange-600 hover:bg-orange-50">
                  Supprimer toutes les recherches
                </Button>
                
                <Button variant="outline" className="w-full text-orange-600 border-orange-600 hover:bg-orange-50">
                  Réinitialiser le pipeline
                </Button>
                
                <Button variant="destructive" className="w-full">
                  Supprimer définitivement le compte
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
