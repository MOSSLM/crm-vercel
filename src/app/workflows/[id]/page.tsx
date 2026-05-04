import AppLayout from "@/components/layout/AppLayout";
import { WorkflowEditor } from "@/components/WorkflowEditor";

export default async function EditWorkflowRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppLayout>
      <WorkflowEditor workflowId={id} />
    </AppLayout>
  );
}
