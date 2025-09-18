import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import CreateCompanyPage from "@/components/CreateCompanyPage";

export default function CreateCompanyRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <CreateCompanyPage />
      </RequireAuth>
    </AppLayout>
  );
}
