import AppLayout from "@/components/layout/AppLayout";
import { PhoneCenter } from "@/components/telephone/PhoneCenter";

export default function TelephoneRoute() {
  return (
    <AppLayout>
      <PhoneCenter scope="admin" />
    </AppLayout>
  );
}
