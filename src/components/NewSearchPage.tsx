import React, { useState } from 'react';
import { useAppData } from './AppDataContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';

export const NewSearchPage: React.FC = () => {
  const { addSearchResult } = useAppData();
  const [formData, setFormData] = useState({
    keyword: '',
    location: '',
    precision: '',
    useMaps: false,
    useGoogle: false
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.keyword || !formData.location || !formData.precision) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (!formData.useMaps && !formData.useGoogle) {
      toast.error('Veuillez sélectionner au moins une source (Maps ou Google)');
      return;
    }

    setIsLoading(true);

    // Simulation de la recherche
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Génération de résultats simulés - avec les noms de colonnes corrects
    const mockResults = {
      keyword: formData.keyword,
      location: formData.location,
      precision: formData.precision,
      source_maps: formData.useMaps,
      source_google: formData.useGoogle,
      status: 'completed' as const,
      nb_trouves: Math.floor(Math.random() * 300) + 50,
      nb_qualifies: Math.floor(Math.random() * 100) + 20
    };

    addSearchResult(mockResults);
    setIsLoading(false);
    
    toast.success(`Recherche terminée ! ${mockResults.nb_trouves} entreprises trouvées`);
    
    // Reset du formulaire
    setFormData({
      keyword: '',
      location: '',
      precision: '',
      useMaps: false,
      useGoogle: false
    });
  };

  return (
    <div className="relative min-h-screen">
      {/* Carte en arrière-plan - Simulation avec un dégradé */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-green-100 via-blue-50 to-blue-100"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 50%)
          `
        }}
      >
        {/* Grille simulant une carte */}
        <div className="absolute inset-0 opacity-10">
          <div className="h-full w-full" style={{
            backgroundImage: `
              linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px'
          }}></div>
        </div>
      </div>

      {/* Overlay pour assurer la lisibilité */}
      <div className="absolute inset-0 bg-black/5"></div>

      {/* Formulaire centré */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg backdrop-blur-sm bg-white/95">
          <CardHeader className="text-center">
            <CardTitle>Nouvelle Recherche</CardTitle>
            <CardDescription>
              Configurez votre recherche d'entreprises
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="keyword">Mot-clé *</Label>
                <Input
                  id="keyword"
                  placeholder="ex: Restaurant, Pharmacie..."
                  value={formData.keyword}
                  onChange={(e) => setFormData(prev => ({ ...prev, keyword: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Lieu *</Label>
                <Input
                  id="location"
                  placeholder="ex: Paris, Lyon, Marseille..."
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precision">Précision *</Label>
                <Select 
                  value={formData.precision} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, precision: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez la précision" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Basique">Basique</SelectItem>
                    <SelectItem value="Moyenne">Moyenne</SelectItem>
                    <SelectItem value="Élevée">Élevée</SelectItem>
                    <SelectItem value="Maximale">Maximale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Sources de données</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="maps"
                      checked={formData.useMaps}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, useMaps: checked as boolean }))
                      }
                    />
                    <Label htmlFor="maps" className="text-sm font-normal">
                      Google Maps
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="google"
                      checked={formData.useGoogle}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, useGoogle: checked as boolean }))
                      }
                    />
                    <Label htmlFor="google" className="text-sm font-normal">
                      Recherche Google
                    </Label>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? 'Recherche en cours...' : 'Lancer la recherche'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};