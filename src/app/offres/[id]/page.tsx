import AppLayout from '@/components/layout/AppLayout';
import { OfferDetailPage } from '@/components/OfferDetailPage';

export default async function OfferDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AppLayout>
      <OfferDetailPage offerId={id} />
    </AppLayout>
  );
}
