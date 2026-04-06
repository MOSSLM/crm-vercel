"use client";

import { useMemo, useState } from "react";
import { PhoneCall } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PromptKey = "closing" | "objections";

const WORKING_DAYS = 22;

function formatCurrency(value: number): string {
  return `${value.toLocaleString("fr-FR")}€`;
}

export function ColdCallPlaybookModal() {
  const [calls, setCalls] = useState(20);
  const [pickup, setPickup] = useState(40);
  const [interest, setInterest] = useState(20);
  const [closeRate, setCloseRate] = useState(35);
  const [price, setPrice] = useState(1750);
  const [stock, setStock] = useState(12);
  const [lastCopied, setLastCopied] = useState<PromptKey | null>(null);

  const funnel = useMemo(() => {
    const pickupRate = pickup / 100;
    const interestRate = interest / 100;
    const close = closeRate / 100;

    const decisionMakers = Math.round(calls * pickupRate);
    const interestedPerDay = Number((calls * pickupRate * interestRate).toFixed(1));
    const salesPerMonth = Math.round(calls * pickupRate * interestRate * close * WORKING_DAYS);
    const monthlyRevenue = salesPerMonth * price;

    return {
      decisionMakers,
      interestedPerDay,
      salesPerMonth,
      monthlyRevenue,
    };
  }, [calls, closeRate, interest, pickup, price]);

  const stockState = useMemo(() => {
    if (stock >= 20) {
      return {
        title: "Stock OK — 100% appels.",
        description:
          "Ne produis pas aujourd'hui. Passe directement aux blocs d'appels. Tu es en position de force.",
        tone: "text-emerald-500",
        barTone: "bg-emerald-500",
      };
    }

    if (stock >= 15) {
      return {
        title: "Stock correct — production légère.",
        description:
          "30 min de production le matin (1–2 sites), puis appels toute la journée. Reviens à 20 dans la semaine.",
        tone: "text-amber-500",
        barTone: "bg-amber-500",
      };
    }

    if (stock >= 8) {
      return {
        title: "Stock bas — session de rattrapage.",
        description:
          "Matinée production (3–4 sites) avant d'appeler. Ne commence pas les appels avant d'avoir au moins 12 sites prêts.",
        tone: "text-sky-500",
        barTone: "bg-sky-500",
      };
    }

    return {
      title: "Stock critique — journée production.",
      description:
        "Journée entière sur la production. Objectif : atteindre 15 avant de reprendre les appels. Ne pas appeler dans cet état.",
      tone: "text-rose-500",
      barTone: "bg-rose-500",
    };
  }, [stock]);

  const copyPrompt = async (key: PromptKey, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setLastCopied(key);
      window.setTimeout(() => setLastCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      setLastCopied(null);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <PhoneCall className="h-5 w-5" />
          <span>Playbook appels</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-border/70 p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <PhoneCall className="h-5 w-5 text-primary" />
            Cold call playbook
          </DialogTitle>
          <DialogDescription>
            Funnel, règle de stock, planning hebdo et scripts d'appel dans un espace unique.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="funnel" className="px-4 pb-5 pt-4 sm:px-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 p-1 md:grid-cols-4">
            <TabsTrigger value="funnel">Funnel & math</TabsTrigger>
            <TabsTrigger value="stock">Règle du stock</TabsTrigger>
            <TabsTrigger value="planning">Planning type</TabsTrigger>
            <TabsTrigger value="script">Script d'appel</TabsTrigger>
          </TabsList>

          <TabsContent value="funnel" className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-5 p-4 sm:p-5">
                {[
                  {
                    label: "Appels / jour",
                    value: calls,
                    min: 5,
                    max: 40,
                    step: 1,
                    onChange: (value: number) => setCalls(value),
                    displayValue: `${calls}`,
                  },
                  {
                    label: "Taux décroché",
                    value: pickup,
                    min: 20,
                    max: 70,
                    step: 5,
                    onChange: (value: number) => setPickup(value),
                    displayValue: `${pickup}%`,
                  },
                  {
                    label: "Taux d'intérêt",
                    value: interest,
                    min: 5,
                    max: 40,
                    step: 5,
                    onChange: (value: number) => setInterest(value),
                    displayValue: `${interest}%`,
                  },
                  {
                    label: "Taux de closing",
                    value: closeRate,
                    min: 10,
                    max: 60,
                    step: 5,
                    onChange: (value: number) => setCloseRate(value),
                    displayValue: `${closeRate}%`,
                  },
                  {
                    label: "Prix moyen",
                    value: price,
                    min: 1000,
                    max: 3000,
                    step: 50,
                    onChange: (value: number) => setPrice(value),
                    displayValue: formatCurrency(price),
                  },
                ].map((slider) => (
                  <label key={slider.label} className="grid gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{slider.label}</span>
                      <span className="text-muted-foreground">{slider.displayValue}</span>
                    </div>
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={slider.value}
                      onChange={(event) => slider.onChange(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    />
                  </label>
                ))}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-border/60 bg-muted/40">
                    <CardContent className="space-y-1 p-4">
                      <p className="text-3xl font-semibold">{funnel.decisionMakers}</p>
                      <p className="text-sm text-muted-foreground">Décideurs/jour</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60 bg-muted/40">
                    <CardContent className="space-y-1 p-4">
                      <p className="text-3xl font-semibold text-amber-500">{funnel.interestedPerDay}</p>
                      <p className="text-sm text-muted-foreground">Intéressés/jour</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60 bg-muted/40">
                    <CardContent className="space-y-1 p-4">
                      <p className="text-3xl font-semibold text-emerald-500">{funnel.salesPerMonth}</p>
                      <p className="text-sm text-muted-foreground">Ventes/mois</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60 bg-muted/40">
                    <CardContent className="space-y-1 p-4">
                      <p className="text-3xl font-semibold text-emerald-500">{formatCurrency(funnel.monthlyRevenue)}</p>
                      <p className="text-sm text-muted-foreground">CA/mois</p>
                    </CardContent>
                  </Card>
                </div>

                <p className="text-xs text-muted-foreground">
                  Calcul sur {WORKING_DAYS} jours ouvrés. Les taux sont indicatifs — ajuste selon ta réalité terrain.
                </p>

                <Button
                  variant="outline"
                  className="w-full justify-between sm:w-auto"
                  onClick={() =>
                    copyPrompt(
                      "closing",
                      "Comment améliorer mon taux de closing en démarchage téléphonique pour des sites vitrines ?"
                    )
                  }
                >
                  Améliorer mon taux de closing ↗
                  {lastCopied === "closing" && <Badge variant="secondary">Copié</Badge>}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock" className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                  <h3 className="font-semibold">Stock cible : 20 lead magnets prêts</h3>
                  <p className="text-sm text-muted-foreground">Simule ton stock et vois la règle qui s'applique.</p>
                </div>

                <label className="grid gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Stock actuel</span>
                    <span className="text-muted-foreground">{stock}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={stock}
                    onChange={(event) => setStock(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  />
                </label>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${stockState.barTone}`}
                    style={{ width: `${Math.round((stock / 30) * 100)}%` }}
                  />
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                  <p className={`text-sm font-semibold ${stockState.tone}`}>{stockState.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{stockState.description}</p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pourquoi le stock roulant</p>
              {[
                {
                  title: "Ne jamais appeler sans site prêt",
                  text: "Si le prospect dit oui et que t'as rien, momentum perdu. Le lead magnet est ton argument principal.",
                },
                {
                  title: "La production en bloc, pas au fil de l'eau",
                  text: "Faire 5 sites d'un coup = 2h. Faire 1 site entre deux appels = chaos mental. Protège ta concentration.",
                },
                {
                  title: "Le stock te donne le choix",
                  text: "Avec 20 sites prêts, tu choisis les meilleures opportunités à appeler au lieu d'appeler dans le désordre.",
                },
                {
                  title: "Rythme de production : 2 sites/matin",
                  text: "1h max le matin si le stock est en dessous de 15. Si stock OK, droit aux appels.",
                },
              ].map((rule, index) => (
                <Card key={rule.title} className="border-border/60">
                  <CardContent className="flex gap-3 p-4">
                    <Badge variant="secondary" className="mt-0.5 h-6 min-w-6 justify-center rounded-full px-2">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium">{rule.title}</p>
                      <p className="text-sm text-muted-foreground">{rule.text}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="planning" className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Semaine type</p>
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-sm font-semibold text-muted-foreground">Lundi — Batch de production</p>
                  {[
                    ["8h – 11h", "Production : 6–8 lead magnets d'un coup"],
                    ["11h – 12h30", "Premier bloc d'appels (10 appels)"],
                    ["14h – 16h", "Bloc d'appels (10 appels)"],
                    ["16h – 17h", "CRM, suivi, planification semaine"],
                  ].map(([time, value]) => (
                    <div key={time} className="grid grid-cols-[84px_1fr] gap-2 text-sm">
                      <p className="font-medium text-muted-foreground">{time}</p>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-sm font-semibold text-muted-foreground">Mardi – Vendredi — Journées commerciales</p>
                  {[
                    ["8h – 9h", "Production si stock < 15 (2 sites max)"],
                    ["9h – 12h", "Bloc d'appels principal (12–15 appels)"],
                    ["13h – 14h", "Follow-ups, envoi de liens, réponses mails"],
                    ["14h – 16h", "Bloc d'appels (5–8 appels + rappels)"],
                    ["16h – 17h", "Libre : amélioration CRM, scraping, veille"],
                  ].map(([time, value]) => (
                    <div key={time} className="grid grid-cols-[84px_1fr] gap-2 text-sm">
                      <p className="font-medium text-muted-foreground">{time}</p>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Règles de discipline</p>
                {[
                  ["Appels uniquement 9h–12h et 14h–16h", "Les artisans décrochent mal à 8h et après 17h. Ces créneaux sont les meilleurs."],
                  ["20 appels/jour minimum, sans exception", "Pas d'excuses. 20 appels c'est 2h de boulot max. Le reste de la journée est pour le reste."],
                  ["Le vendredi après-midi = review", "Combien d'appels ? Liens envoyés ? Rappels ? Ajuste la semaine suivante en conséquence."],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-md border border-border/60 p-3">
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="script" className="mt-4 space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Script — Premier contact</p>
                <blockquote className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm leading-6">
                  "Bonjour, c'est [Prénom]. J'ai vu votre entreprise sur Google — j'ai refait votre site web, pas encore publié bien sûr,
                  et j'aimerais vous l'envoyer. Ça prend 30 secondes à regarder. Je peux vous envoyer le lien maintenant ?"
                </blockquote>

                {[
                  [
                    "Si OUI",
                    "Je vous envoie ça tout de suite sur votre téléphone ou par mail. Vous regardez et je vous rappelle dans 20 minutes ?",
                    "Envoie le lien dans la foulée et rappelle à l'heure dite.",
                  ],
                  [
                    "Si \"pas intéressé\" / \"j'ai déjà un site\"",
                    "Je comprends, c'est justement pour ça que je vous appelle — votre site actuel, il date de combien d'années ? Parce que les sites qui ne convertissent pas sur mobile en 2025, ça coûte des clients.",
                    "Ouvre la discussion sur la performance, pas sur le design.",
                  ],
                  [
                    "Si \"je rappelle plus tard\" / \"envoyez un mail\"",
                    "Pas de souci, je vous envoie le lien maintenant et je vous recontacte jeudi matin — ça vous convient ?",
                    "Ne laisse jamais une date vague : fixe un rappel précis.",
                  ],
                ].map(([title, quote, hint]) => (
                  <div key={title} className="space-y-2">
                    <p className="text-sm font-semibold">{title}</p>
                    <blockquote className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm leading-6">"{quote}"</blockquote>
                    <p className="text-xs text-muted-foreground">→ {hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Règles d'or du script</p>
                {[
                  ["Moins de 20 secondes pour poser la valeur", "Tu n'es pas là pour expliquer ton agence. Tu es là pour envoyer un lien."],
                  ["La question fermée à la fin", "\"Je peux vous envoyer le lien maintenant ?\" doit appeler oui/non, pas une réflexion."],
                  ["Le follow-up est sacré", "80% des ventes se font au 2e ou 3e contact. J+1, J+3, J+7 — sans exception."],
                ].map(([title, description], index) => (
                  <div key={title} className="flex gap-3 rounded-md border border-border/60 p-3">
                    <Badge variant="secondary" className="h-6 min-w-6 justify-center rounded-full px-2">
                      {index + 1}
                    </Badge>
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="w-full justify-between sm:w-auto"
                  onClick={() =>
                    copyPrompt(
                      "objections",
                      "Aide-moi à gérer les objections les plus fréquentes lors de démarchage téléphonique pour vendre des refontes de sites vitrine à des artisans."
                    )
                  }
                >
                  Gérer les objections ↗
                  {lastCopied === "objections" && <Badge variant="secondary">Copié</Badge>}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ColdCallPlaybookModal;
