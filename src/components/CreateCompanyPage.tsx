"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppData } from "@/components/AppDataContext";

interface CreateCompanyFormState {
  name: string;
  website: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  linkedin: string;
  tags: string;
  isQualified: boolean;
}

const initialFormState: CreateCompanyFormState = {
  name: "",
  website: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
  phone: "",
  linkedin: "",
  tags: "",
  isQualified: false,
};

export function CreateCompanyPage() {
  const { addCompany } = useAppData();
  const router = useRouter();
  const [formState, setFormState] = useState<CreateCompanyFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = <K extends keyof CreateCompanyFormState>(field: K, value: CreateCompanyFormState[K]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.name.trim()) {
      toast.error("Veuillez saisir le nom de l'entreprise");
      return;
    }

    setIsSubmitting(true);

    try {
      await addCompany({
        name: formState.name.trim(),
        canonical_url: formState.website.trim() || undefined,
        adresse: formState.address.trim() || undefined,
        ville: formState.city.trim() || undefined,
        code_postal: formState.postalCode.trim() || undefined,
        pays: formState.country.trim() || undefined,
        telephone: formState.phone.trim() || undefined,
        linkedin_url: formState.linkedin.trim() || undefined,
        premiers_tags: formState.tags.trim() || undefined,
        sources: ["manual"],
        qualifie: formState.isQualified,
        manually_enriched: true,
      });

      setFormState(initialFormState);
      router.push("/companies");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Créer une entreprise</CardTitle>
          <CardDescription>
            Renseignez les informations principales pour ajouter une nouvelle entreprise à votre CRM.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company-name">Nom de l'entreprise *</Label>
                <Input
                  id="company-name"
                  value={formState.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Ex: Boulangerie Dupont"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-website">Site web</Label>
                <Input
                  id="company-website"
                  type="url"
                  value={formState.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  placeholder="https://exemple.com"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-address">Adresse</Label>
              <Textarea
                id="company-address"
                value={formState.address}
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="Numéro et rue"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="company-city">Ville</Label>
                <Input
                  id="company-city"
                  value={formState.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  placeholder="Paris"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-postal-code">Code postal</Label>
                <Input
                  id="company-postal-code"
                  value={formState.postalCode}
                  onChange={(event) => updateField("postalCode", event.target.value)}
                  placeholder="75001"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-country">Pays</Label>
                <Input
                  id="company-country"
                  value={formState.country}
                  onChange={(event) => updateField("country", event.target.value)}
                  placeholder="France"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-phone">Téléphone</Label>
              <Input
                id="company-phone"
                value={formState.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="01 23 45 67 89"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company-linkedin">Profil LinkedIn</Label>
                <Input
                  id="company-linkedin"
                  type="url"
                  value={formState.linkedin}
                  onChange={(event) => updateField("linkedin", event.target.value)}
                  placeholder="https://www.linkedin.com/company/"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-tags">Tags</Label>
                <Input
                  id="company-tags"
                  value={formState.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  placeholder="restaurant, premium"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="company-qualified"
                  checked={formState.isQualified}
                  onCheckedChange={(checked) => updateField("isQualified", checked === true)}
                  disabled={isSubmitting}
                />
                Entreprise qualifiée
              </label>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Création en cours..." : "Créer l'entreprise"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default CreateCompanyPage;
