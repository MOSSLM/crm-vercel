"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/components/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export type ProfileFormProps = {
  /** If true, sets `onboarded_at = now()` on submit and calls onComplete. */
  finalizeOnboarding?: boolean;
  onComplete?: () => void;
  submitLabel?: string;
};

const TEAM_SIZES = ["1", "2-10", "11-50", "50+"] as const;

export function ProfileForm({ finalizeOnboarding, onComplete, submitLabel }: ProfileFormProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("prenom, nom, entreprise, role_in_company, team_size, website")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrenom(data.prenom ?? "");
          setNom(data.nom ?? "");
          setEntreprise(data.entreprise ?? "");
          setRoleInCompany(data.role_in_company ?? "");
          setTeamSize(data.team_size ?? "");
          setWebsite(data.website ?? "");
        }
        setLoading(false);
      });
  }, [user, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErr(null);
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      prenom: prenom.trim() || null,
      nom: nom.trim() || null,
      entreprise: entreprise.trim() || null,
      role_in_company: roleInCompany.trim() || null,
      team_size: teamSize || null,
      website: website.trim() || null,
      full_name: `${prenom.trim()} ${nom.trim()}`.trim() || null,
    };
    if (finalizeOnboarding) {
      payload.onboarded_at = new Date().toISOString();
    }

    const { error } = await supabase.from("user_profiles").update(payload).eq("id", user.id);
    setSubmitting(false);

    if (error) {
      setErr(error.message);
      return;
    }

    toast.success(finalizeOnboarding ? "Profil complété !" : "Profil mis à jour");
    onComplete?.();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="prenom">Prénom</Label>
          <Input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entreprise">Entreprise</Label>
        <Input
          id="entreprise"
          value={entreprise}
          onChange={(e) => setEntreprise(e.target.value)}
          placeholder="Nom de votre société"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="role_in_company">Votre rôle dans l&apos;entreprise</Label>
        <Input
          id="role_in_company"
          value={roleInCompany}
          onChange={(e) => setRoleInCompany(e.target.value)}
          placeholder="Ex : Gérant, Directeur commercial…"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Nombre de personnes dans l&apos;entreprise</Label>
        <RadioGroup value={teamSize} onValueChange={setTeamSize} className="flex flex-wrap gap-4">
          {TEAM_SIZES.map((size) => (
            <div key={size} className="flex items-center space-x-2">
              <RadioGroupItem value={size} id={`team-${size}`} />
              <Label htmlFor={`team-${size}`} className="font-normal">
                {size}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="website">Site web actuel (optionnel)</Label>
        <Input
          id="website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://votre-site.fr"
        />
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Enregistrement…" : (submitLabel ?? "Enregistrer")}
      </Button>
    </form>
  );
}
