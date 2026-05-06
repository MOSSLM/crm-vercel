"use client";

import AppLayout from "@/components/layout/AppLayout";
import { BookOpen, Code2, Layers } from "lucide-react";

export default function ThemesDocsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8 p-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Documentation des thèmes</h1>
            <p className="text-sm text-muted-foreground">Guide pour créer et configurer des thèmes Site Builder</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Structure d'un thème
          </h2>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm text-muted-foreground">
            <p>Chaque thème définit :</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>sections</strong> — les composants visuels disponibles (hero, services, contact…)</li>
              <li><strong>globalVariables</strong> — couleurs, polices, espacements</li>
              <li><strong>enterpriseVariables</strong> — variables dynamiques injectées depuis la fiche entreprise</li>
              <li><strong>pageStructure</strong> — mode single/multi, pages obligatoires, pages personnalisées</li>
              <li><strong>sectionsLibrary</strong> — liste des sectionIds accessibles à l'IA</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            sectionsLibrary — Règle IA
          </h2>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
            <p>
              L'IA de génération de sites est <strong>strictement limitée</strong> aux{" "}
              <code className="bg-muted px-1 rounded text-xs">sectionIds</code> déclarés dans{" "}
              <code className="bg-muted px-1 rounded text-xs">sectionsLibrary</code> du thème actif.
            </p>
            <p>Elle ne peut pas créer de nouvelles sections ni utiliser des types non listés.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            Exemple de configuration
          </h2>
          <pre className="rounded-lg border bg-muted/30 p-4 text-xs overflow-x-auto text-muted-foreground">
{`// src/templates/mon-theme/theme.config.ts
const themeConfig: ThemeConfig = {
  slug: "mon-theme",
  name: "Mon Thème",
  version: "1.0.0",
  sections: [ /* définitions visuelles */ ],
  globalVariables: { colors: { primary: "#1a56db", ... }, ... },
  enterpriseVariables: [ "entreprise.nom", ... ],
  pageStructure: {
    mode: "multi",
    requiredPages: [
      { slug: "/", title: "Accueil" },
      { slug: "/contact", title: "Contact" },
    ],
    allowCustomPages: true,
  },
  sectionsLibrary: {
    sectionIds: ["hero", "services", "contact", "faq"],
  },
};`}
          </pre>
        </section>
      </div>
    </AppLayout>
  );
}
