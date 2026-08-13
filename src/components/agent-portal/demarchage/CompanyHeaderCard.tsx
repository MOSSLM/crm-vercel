"use client";

import { Building2, MapPin, Users, Banknote, TrendingUp, TrendingDown, Mail, Linkedin, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClickToCallButton } from "@/components/telephony/ClickToCallButton";
import { formatEuros } from "@/lib/donnees-publiques/fiche";
import { trancheEffectifLabel } from "@/lib/donnees-publiques/effectif";
import type { CompanyBundle } from "./types";

/** Une "tuile" de fait — icône dédiée, rendue seulement si la valeur existe. */
function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted" style={tone ? { color: tone } : undefined}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold" style={tone ? { color: tone } : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

export function CompanyHeaderCard({ company, loading }: { company: CompanyBundle | null; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Chargement de la fiche…</CardContent>
      </Card>
    );
  }
  if (!company) return null;

  const { entreprise, donneesPubliques, contacts } = company;
  const effectif = trancheEffectifLabel(donneesPubliques?.tranche_effectif_code ?? null);
  const ca = donneesPubliques?.chiffre_affaires ?? null;
  const resultat = donneesPubliques?.resultat_net ?? null;
  const exercice = donneesPubliques?.exercice_annee ?? null;
  const adresse = [entreprise.adresse, entreprise.code_postal, entreprise.ville].filter(Boolean).join(", ");

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="truncate text-xl font-semibold">
            {entreprise.name || donneesPubliques?.denomination || "Sans nom"}
          </h1>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {effectif && <Tile icon={<Users className="h-4 w-4" />} label="Effectif" value={effectif} />}
          {ca != null && <Tile icon={<Banknote className="h-4 w-4" />} label={`CA${exercice ? ` ${exercice}` : ""}`} value={formatEuros(ca)} />}
          {resultat != null && (
            <Tile
              icon={resultat < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              label={`Résultat${exercice ? ` ${exercice}` : ""}`}
              value={formatEuros(resultat)}
              tone={resultat < 0 ? "var(--danger)" : "var(--ok)"}
            />
          )}
          {adresse && <Tile icon={<MapPin className="h-4 w-4" />} label="Adresse" value={adresse} />}
        </div>

        {contacts.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            {contacts.map((c) => {
              const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact";
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {name}
                      {c.is_decision_maker && (
                        <Badge variant="secondary" className="text-[10px]">
                          Décideur
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 text-xs text-muted-foreground">
                      {c.role_title && <span>{c.role_title}</span>}
                      {c.tel && <span>{c.tel}</span>}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:underline">
                          <Mail className="h-3 w-3" />
                          {c.email}
                        </a>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
                          <Linkedin className="h-3 w-3" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                  {c.tel && (
                    <ClickToCallButton to={c.tel} contactId={c.id} entrepriseId={entreprise.id} size="icon" variant="ghost" label="Appeler" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
