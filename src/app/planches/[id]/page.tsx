"use client";

import React from "react";
import { useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { PlancheCanvas } from "@/components/planches/PlancheCanvas";

export default function PlancheBoardPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  return (
    <AppLayout>
      <div className="h-full min-h-0">{id && <PlancheCanvas boardId={id} />}</div>
    </AppLayout>
  );
}
