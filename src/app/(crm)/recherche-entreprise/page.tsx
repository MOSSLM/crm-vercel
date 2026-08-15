import AppLayout from '@/components/layout/AppLayout';
import { SectionTabsNav } from '@/components/layout/SectionTabsNav';
import { actionSearchTabs } from '@/components/layout/sectionTabs';
import { NewSearchPage } from '@/components/NewSearchPage';
// Le suivi d'une recherche reprend la grammaire visuelle de la carte du
// territoire — contours, pastilles, taches, infobulle — au lieu de la
// dupliquer. D'où l'import de SA feuille de style, complétée par celle qui
// n'ajoute que la grille de tuiles et son avancement.
import '../carte/carte.css';
import '@/components/gmaps/carte-recherche.css';

export default function RechercheEntreprisePage() {
  return (
    <AppLayout>
      <SectionTabsNav items={actionSearchTabs} />
      <NewSearchPage />
    </AppLayout>
  );
}
