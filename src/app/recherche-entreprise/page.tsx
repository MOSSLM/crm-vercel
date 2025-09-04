"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AppLayout from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  location: z.string().min(1),
  businessTypes: z.string().min(1),
  tileStep: z.coerce.number().int().min(1),
  useSearch: z.boolean().optional().default(false),
  useMaps: z.boolean().optional().default(false),
  pagesCount: z.coerce.number().int().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export default function RechercheEntreprisePage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      location: "",
      businessTypes: "",
      tileStep: 1,
      useSearch: false,
      useMaps: false,
      pagesCount: 1,
    },
  });

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (jobId && status !== "done") {
      interval = setInterval(async () => {
        const res = await fetch(`/api/gmaps/job/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          if (data.status === "done") {
            clearInterval(interval);
            await fetch(`/api/gmaps/scale-down`, { method: "POST" });
          }
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, status]);

  const onSubmit = async (values: FormValues) => {
    const res = await fetch("/api/gmaps/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (res.ok) {
      const data = await res.json();
      setJobId(data.jobId);
      setStatus(data.status);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto p-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" {...form.register("location")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessTypes">Business Types</Label>
            <Input id="businessTypes" {...form.register("businessTypes")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tileStep">Tile Step</Label>
            <Input
              id="tileStep"
              type="number"
              {...form.register("tileStep", { valueAsNumber: true })}
            />
          </div>
          <Controller
            control={form.control}
            name="useSearch"
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useSearch"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="useSearch">Use Search</Label>
              </div>
            )}
          />
          <Controller
            control={form.control}
            name="useMaps"
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useMaps"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="useMaps">Use Maps</Label>
              </div>
            )}
          />
          <div className="space-y-2">
            <Label htmlFor="pagesCount">Pages Count</Label>
            <Input
              id="pagesCount"
              type="number"
              {...form.register("pagesCount", { valueAsNumber: true })}
            />
          </div>
          <Button type="submit">Lancer</Button>
        </form>
        {jobId && (
          <div className="mt-4 space-y-2 text-center">
            <p>Statut: {status}</p>
            {status === "done" && (
              <div className="space-x-4">
                <a
                  href={`/api/gmaps/results/${jobId}?format=csv`}
                  className="underline"
                >
                  Télécharger CSV
                </a>
                <a
                  href={`/api/gmaps/results/${jobId}?format=json`}
                  className="underline"
                >
                  Télécharger JSON
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
