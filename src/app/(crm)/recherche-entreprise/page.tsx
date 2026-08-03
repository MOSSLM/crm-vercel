import AppLayout from '@/components/layout/AppLayout';
import { SectionTabsNav } from '@/components/layout/SectionTabsNav';
import { actionSearchTabs } from '@/components/layout/sectionTabs';
import { NewSearchPage } from '@/components/NewSearchPage';

export default function RechercheEntreprisePage() {
  return (
    <AppLayout>
      <SectionTabsNav items={actionSearchTabs} />
      <NewSearchPage />
    </AppLayout>
  );
}
