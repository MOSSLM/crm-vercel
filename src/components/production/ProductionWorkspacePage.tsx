import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ProductionWorkspacePageProps = {
  title: string;
  description: string;
};

export function ProductionWorkspacePage({ title, description }: ProductionWorkspacePageProps) {
  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cette page est prête pour la V2.0 et servira de point d&apos;entrée pour ce module.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
