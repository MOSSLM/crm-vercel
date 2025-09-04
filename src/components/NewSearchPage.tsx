"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { toast } from "sonner";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/utils/supabase/client";

const tileSteps = ["0.005", "0.01", "0.02", "0.05", "0.1"] as const;

declare global {
  interface Window {
    google?: any;
  }
}

const formSchema = z
  .object({
    keyword: z.string().min(1),
    location: z.string().min(1),
    tileStep: z.enum(tileSteps),
    useMaps: z.boolean(),
    useSearch: z.boolean(),
    pagesCount: z.number().int().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.useSearch && !data.pagesCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pagesCount"],
        message: "Requis quand la recherche Google est activée",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export const NewSearchPage: React.FC = () => {
  const supabase = createClient();
  const locationRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<
    | { found: number; saved: number; pages: number }
    | null
  >(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      keyword: "",
      location: "",
      tileStep: "0.1",
      useMaps: false,
      useSearch: false,
    },
  });

  const useSearch = watch("useSearch");

  useEffect(() => {
    const load = async () => {
      if (typeof window === "undefined") return;
      if (window.google && window.google.maps && window.google.maps.places) {
        init();
        return;
      }
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=fr`;
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    };
    const init = () => {
      if (!locationRef.current || !window.google?.maps?.places) return;
      const autocomplete = new window.google.maps.places.Autocomplete(
        locationRef.current,
        { types: ["(cities)"] }
      );
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const value = place.formatted_address || place.name || "";
        setValue("location", value);
      });
    };
    load();
  }, [setValue]);

  useEffect(() => {
    if (!jobId || status === "done") return;
    const poll = setInterval(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers: HeadersInit = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        const res = await fetch(`/api/gmaps/job/${jobId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          if (data.status === "done") {
            setStats({
              found: data.found ?? 0,
              saved: data.saved ?? 0,
              pages: data.pages ?? 0,
            });
            toast.success("Recherche terminée");
            await fetch(`/api/gmaps/scale-down`, {
              method: "POST",
              headers,
            });
            clearInterval(poll);
          }
        }
      } catch {
        toast.error("Erreur lors du suivi de la recherche");
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [jobId, status, supabase]);

  const onSubmit = async (values: FormValues) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      };
      toast.info("Recherche lancée");
      const res = await fetch("/api/gmaps/crawl", {
        method: "POST",
        headers,
        body: JSON.stringify({
          keyword: values.keyword,
          location: values.location,
          tileStep: parseFloat(values.tileStep),
          useMaps: values.useMaps,
          useSearch: values.useSearch,
          pagesCount: values.pagesCount,
        }),
      });
      if (!res.ok) throw new Error("crawl failed");
      const data = await res.json();
      setJobId(data.jobId);
      setStatus(data.status);
    } catch (err) {
      toast.error("Erreur lors du lancement");
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800">
          <CardHeader className="text-center">
            <CardTitle>Nouvelle Recherche</CardTitle>
            <CardDescription>
              Configurez votre recherche d'entreprises
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="keyword" className="text-gray-700 dark:text-gray-200">
                  Mot-clé
                </Label>
                <Controller
                  control={control}
                  name="keyword"
                  render={({ field }) => (
                    <Input
                      id="keyword"
                      {...field}
                      className="dark:bg-gray-900 dark:text-gray-100"
                      placeholder="ex: Restaurant, Pharmacie..."
                    />
                  )}
                />
                {errors.keyword && (
                  <p className="text-sm text-red-500">{errors.keyword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="text-gray-700 dark:text-gray-200">
                  Lieu
                </Label>
                <Controller
                  control={control}
                  name="location"
                  render={({ field }) => (
                    <Input
                      id="location"
                      ref={locationRef}
                      {...field}
                      className="dark:bg-gray-900 dark:text-gray-100"
                      placeholder="ex: Paris, Lyon..."
                    />
                  )}
                />
                {errors.location && (
                  <p className="text-sm text-red-500">{errors.location.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tileStep" className="text-gray-700 dark:text-gray-200">
                  Précision
                </Label>
                <Controller
                  control={control}
                  name="tileStep"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="dark:bg-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Sélectionnez la précision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.1">Basique</SelectItem>
                        <SelectItem value="0.05">Moyenne</SelectItem>
                        <SelectItem value="0.02">Élevée</SelectItem>
                        <SelectItem value="0.01">Maximale</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-200">
                  Sources
                </Label>
                <div className="flex items-center justify-between">
                  <span>Google Maps</span>
                  <Controller
                    control={control}
                    name="useMaps"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Recherche Google</span>
                  <Controller
                    control={control}
                    name="useSearch"
                    render={({ field }) => (
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
              </div>

              {useSearch && (
                <div className="space-y-2">
                  <Label
                    htmlFor="pagesCount"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Nombre de pages
                  </Label>
                  <Controller
                    control={control}
                    name="pagesCount"
                    render={({ field }) => (
                      <Input
                        id="pagesCount"
                        type="number"
                        {...field}
                        className="dark:bg-gray-900 dark:text-gray-100"
                      />
                    )}
                  />
                  {errors.pagesCount && (
                    <p className="text-sm text-red-500">
                      {errors.pagesCount.message}
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={!!jobId && status !== "done"}>
                Lancer la recherche
              </Button>
            </form>

            {jobId && (
              <div className="mt-4 space-y-4 text-center">
                <p>Statut: {status}</p>
                {status === "done" && (
                  <div className="space-y-4">
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
                    {stats && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Valeur</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Entreprises trouvées</TableCell>
                            <TableCell>{stats.found}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Entreprises sauvegardées</TableCell>
                            <TableCell>{stats.saved}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Pages explorées</TableCell>
                            <TableCell>{stats.pages}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
