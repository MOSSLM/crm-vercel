import AppLayout from "@/components/layout/AppLayout";
import { CarteTerritoire } from "@/components/carte/CarteTerritoire";
import "./carte.css";

export default function CarteRoute() {
  return (
    <AppLayout>
      <CarteTerritoire />
    </AppLayout>
  );
}
