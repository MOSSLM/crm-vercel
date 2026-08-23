"use client";

import React from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Globe, Loader2, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authedFetch } from "@/utils/authedFetch";
import { SITE_DOMAIN } from "@/lib/site-domain";
import {
  formatPlanTexte,
  parsePlanTexte,
  verifierPlan,
  type DiagnosticRedirection,
  type RegleRedirection,
} from "@/lib/site-builder/redirections";

/**
 * « Mise en ligne » : passer d'une démo à un vrai site.
 *
 * Les trois gestes de la bascule tiennent ici parce qu'ils tiennent ENSEMBLE :
 * rattacher le domaine sans plan de redirection perd l'ancienneté des vieilles
 * URLs, et poser un plan sans vérifier le DNS revient à corriger un site que
 * personne n'atteint. Les séparer en trois écrans revenait à en oublier un.
 *
 * Ce que le dialogue ne fait PAS : publier. La publication reste le bouton
 * « Publier » de la barre du haut, parce qu'elle fige le contenu — et qu'on
 * rattache souvent un domaine des semaines après la dernière retouche.
 */

interface EnregistrementDns {
  type: string;
  nom: string;
  valeur: string;
  pourquoi: string;
}
interface ConstatDns {
  nom: string;
  valeurs: string[];
  conforme: boolean;
  indetermine: boolean;
  absent: boolean;
}
interface EtatDomaine {
  domaine: string | null;
  sousDomaine: string | null;
  publie: boolean;
  /** La barre d'achat de la démo est-elle encore affichée aux visiteurs ? */
  barreDachat: boolean;
  enregistrements: EnregistrementDns[];
  dns: { apex: ConstatDns; www: ConstatDns | null; pret: boolean } | null;
}
interface Proposition {
  de: string;
  vers: string;
  score: number;
  titre?: string;
}

export function MiseEnLigneDialog({
  open,
  siteId,
  onClose,
}: {
  open: boolean;
  siteId: string;
  onClose: () => void;
}) {
  const [etat, setEtat] = React.useState<EtatDomaine | null>(null);
  const [saisieDomaine, setSaisieDomaine] = React.useState("");
  const [busy, setBusy] = React.useState<null | "domaine" | "dns" | "plan" | "import">(null);

  const [plan, setPlan] = React.useState("");
  const [cheminsServis, setCheminsServis] = React.useState<string[]>([]);
  const [enLigne, setEnLigne] = React.useState(false);
  const [ancienSite, setAncienSite] = React.useState("");
  const [orphelins, setOrphelins] = React.useState<string[]>([]);

  const charger = React.useCallback(async () => {
    const [d, r] = await Promise.all([
      authedFetch(`/api/site-builder/sites/${siteId}/domaine`).then((x) => (x.ok ? x.json() : null)),
      authedFetch(`/api/site-builder/sites/${siteId}/redirections`).then((x) => (x.ok ? x.json() : null)),
    ]);
    if (d) {
      setEtat(d as EtatDomaine);
      setSaisieDomaine((d as EtatDomaine).domaine ?? "");
    }
    if (r) {
      setPlan(formatPlanTexte((r.regles ?? []) as RegleRedirection[]));
      setCheminsServis((r.cheminsServis ?? []) as string[]);
      setEnLigne(((r.reglesPubliees ?? []) as RegleRedirection[]).length > 0);
    }
  }, [siteId]);

  React.useEffect(() => {
    if (!open) return;
    setOrphelins([]);
    charger().catch(() => toast.error("Chargement impossible"));
  }, [open, charger]);

  /**
   * Retirer la barre d'achat de la démo.
   *
   * Elle propose au visiteur d'acheter le site — celui que le client vient de
   * payer. Le webhook Stripe l'éteint après un paiement EN LIGNE ; après un
   * virement ou une facture, personne ne l'éteint, et elle s'affiche sur le
   * domaine du client. C'est l'oubli le plus visible de la bascule, et le seul
   * que le client remarque avant nous.
   */
  const retirerBarre = async () => {
    setBusy("domaine");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paywall_enabled: false }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      toast.success("Barre d'achat retirée");
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de retirer la barre");
    } finally {
      setBusy(null);
    }
  };

  /* ── Domaine ─────────────────────────────────────────────── */

  const rattacher = async () => {
    setBusy("domaine");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/domaine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domaine: saisieDomaine }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      toast.success(`Domaine rattaché : ${body.domaine}`);
      if (body.avertissement) toast.warning(body.avertissement, { duration: 8000 });
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rattachement impossible");
    } finally {
      setBusy(null);
    }
  };

  const detacher = async () => {
    if (!window.confirm(`Détacher ${etat?.domaine} ? Le site restera servi sur son sous-domaine.`)) return;
    setBusy("domaine");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/domaine`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      toast.success("Domaine détaché");
      setSaisieDomaine("");
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Détachement impossible");
    } finally {
      setBusy(null);
    }
  };

  const verifierDns = async () => {
    setBusy("dns");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/domaine?dns=1`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Échec");
      setEtat(body as EtatDomaine);
      const dns = (body as EtatDomaine).dns;
      if (dns?.pret) toast.success("Le DNS pointe bien chez nous, apex et www.");
      else toast.warning("Le DNS n'est pas (encore) complet — voir le détail.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lecture DNS impossible");
    } finally {
      setBusy(null);
    }
  };

  /* ── Plan de redirection ─────────────────────────────────── */

  const { regles, erreurs } = React.useMemo(() => parsePlanTexte(plan), [plan]);
  const diagnostics: DiagnosticRedirection[] = React.useMemo(
    () => verifierPlan(regles, cheminsServis),
    [regles, cheminsServis],
  );
  const bloquantes = diagnostics.filter((d) => d.gravite === "erreur");

  const enregistrerPlan = async () => {
    setBusy("plan");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/redirections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regles }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      setEnLigne(Boolean(body.enLigne));
      toast.success(
        body.enLigne
          ? `${regles.length} redirection(s) actives — inutile de republier.`
          : `${regles.length} redirection(s) enregistrées. Elles s'appliqueront à la publication.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(null);
    }
  };

  const importerDepuisAncien = async () => {
    setBusy("import");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/redirections/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domaineAncien: ancienSite }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      const props = (body.propositions ?? []) as Proposition[];
      // On AJOUTE aux règles existantes sans écraser : une ligne écrite à la
      // main vaut mieux qu'une proposition, et c'est elle qui doit survivre.
      const dejaLa = new Set(regles.map((r) => r.de.toLowerCase()));
      const ajouts = props.filter((p) => !dejaLa.has(p.de.toLowerCase()));
      setPlan((prev) => [prev.trim(), ...ajouts.map((p) => `${p.de} → ${p.vers}`)].filter(Boolean).join("\n"));
      setOrphelins((body.orphelins ?? []) as string[]);
      toast.success(
        `${ajouts.length} proposition(s) depuis ${body.urlsLues} URL(s) lues` +
          (body.incomplet ? " — sans sitemap, la liste est partielle." : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lecture de l'ancien site impossible");
    } finally {
      setBusy(null);
    }
  };

  const adresseSousDomaine = etat?.sousDomaine ? `https://${etat.sousDomaine}.${SITE_DOMAIN}` : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Mise en ligne — domaine et redirections
          </DialogTitle>
        </DialogHeader>

        {!etat ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <div className="space-y-6">
            {etat.barreDachat ? (
              <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <b>La barre d&apos;achat de la démo est encore affichée.</b> Elle propose au
                  visiteur d&apos;acheter le site que le client vient de payer. Elle ne s&apos;éteint
                  toute seule qu&apos;après un paiement Stripe — pas après un virement ni une facture.
                </div>
                <Button size="sm" variant="outline" onClick={retirerBarre} disabled={busy !== null}>
                  Retirer
                </Button>
              </div>
            ) : null}

            {/* ── Adresses ─────────────────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Adresses</h3>
              <div className="rounded border border-gray-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">Sous-domaine de démo</span>
                  {adresseSousDomaine ? (
                    <a href={adresseSousDomaine} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {etat.sousDomaine}.{SITE_DOMAIN}
                    </a>
                  ) : (
                    <span className="text-gray-400">pas encore publié</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  Le sous-domaine reste servi après le rattachement du domaine : les liens de démo
                  déjà envoyés continuent de fonctionner. Il est marqué <code>noindex</code> et
                  renvoie vers le domaine du client par la balise canonique, donc il ne concurrence
                  jamais son référencement.
                </p>
              </div>
            </section>

            {/* ── Domaine du client ───────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Domaine du client</h3>
              <div className="flex gap-2">
                <Input
                  value={saisieDomaine}
                  onChange={(e) => setSaisieDomaine(e.target.value)}
                  placeholder="plomberie-dupont.fr"
                  className="font-mono text-sm"
                />
                <Button onClick={rattacher} disabled={busy !== null || !saisieDomaine.trim()}>
                  {busy === "domaine" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {etat.domaine ? "Mettre à jour" : "Rattacher"}
                </Button>
                {etat.domaine ? (
                  <Button variant="outline" onClick={detacher} disabled={busy !== null} title="Détacher le domaine (offboarding)">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {etat.domaine ? (
                <div className="rounded border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      À poser chez le registrar du client (OVH, Gandi, IONOS…)
                    </span>
                    <Button size="sm" variant="outline" onClick={verifierDns} disabled={busy !== null}>
                      {busy === "dns" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Vérifier le DNS
                    </Button>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {etat.enregistrements.map((r) => (
                        <tr key={`${r.type}-${r.nom}`} className="border-t border-gray-100">
                          <td className="py-1.5 pr-2 font-mono font-semibold">{r.type}</td>
                          <td className="py-1.5 pr-2 font-mono">{r.nom}</td>
                          <td className="py-1.5 pr-2 font-mono text-blue-700">{r.valeur}</td>
                          <td className="py-1.5 text-gray-500">{r.pourquoi}</td>
                          <td className="py-1.5 pl-1">
                            <button
                              type="button"
                              title="Copier la valeur"
                              onClick={() => { navigator.clipboard?.writeText(r.valeur); toast.success("Copié"); }}
                              className="text-gray-400 hover:text-gray-700"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {etat.dns ? (
                    <div className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs">
                      {[etat.dns.apex, etat.dns.www].filter((c): c is ConstatDns => c !== null).map((c) => (
                        <div key={c.nom} className="flex items-start gap-2">
                          {c.conforme ? (
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                          )}
                          <span className="font-mono">{c.nom}</span>
                          <span className="text-gray-500">
                            {c.indetermine
                              ? "verdict impossible (aucun résolveur n'a répondu)"
                              : c.absent
                                ? "ce nom n'existe pas dans la zone"
                                : c.valeurs.length > 0
                                  ? `→ ${c.valeurs.join(", ")}`
                                  : "aucun enregistrement"}
                          </span>
                        </div>
                      ))}
                      <p className="pt-1 text-gray-400">
                        Le DNS met de quelques minutes à 24 h à se propager. Le domaine doit aussi
                        être ajouté côté hébergeur (Vercel → Settings → Domains) pour que le
                        certificat soit émis.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* ── Plan de redirection ─────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Plan de redirection
                </h3>
                {enLigne ? (
                  <span className="text-[11px] text-green-700">actif sur le site en ligne</span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                Une règle par ligne : <code>ancienne-url → /nouvelle-page</code>. Les URLs de
                l&apos;ancien site gardent ainsi leur ancienneté au lieu de rendre 404. Une règle ne
                masque jamais une page qui existe. Ajoute <code>!</code> en fin de ligne pour une
                redirection temporaire.
              </p>

              <div className="flex gap-2">
                <Input
                  value={ancienSite}
                  onChange={(e) => setAncienSite(e.target.value)}
                  placeholder="ancien-site-du-client.fr"
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={importerDepuisAncien}
                  disabled={busy !== null || !ancienSite.trim()}
                  title="Lit le sitemap de l'ancien site et propose un rapprochement page à page. À faire AVANT la bascule du DNS."
                >
                  {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Proposer depuis l&apos;ancien site
                </Button>
              </div>

              <Textarea
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={"/nos-services.html → /services\n/blog/* → /actualites/*\n/?page_id=12 → /contact"}
                className="font-mono text-xs"
              />

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {regles.length} règle(s) · {cheminsServis.length} page(s) servie(s)
                </span>
                <Button onClick={enregistrerPlan} disabled={busy !== null || bloquantes.length > 0}>
                  {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Enregistrer le plan
                </Button>
              </div>

              {erreurs.length > 0 || diagnostics.length > 0 ? (
                <ul className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2 text-[11px]">
                  {erreurs.map((e) => (
                    <li key={e} className="text-amber-700">{e}</li>
                  ))}
                  {diagnostics.map((d, i) => (
                    <li key={`${d.index}-${i}`} className={d.gravite === "erreur" ? "text-red-700" : "text-amber-700"}>
                      {d.index >= 0 ? `Ligne ${d.index + 1} : ` : ""}
                      {d.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {orphelins.length > 0 ? (
                <details className="rounded border border-gray-200 p-2 text-[11px]">
                  <summary className="cursor-pointer text-gray-600">
                    {orphelins.length} URL(s) de l&apos;ancien site sans cible évidente — à traiter à la main
                  </summary>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto font-mono text-gray-500">
                    {orphelins.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
