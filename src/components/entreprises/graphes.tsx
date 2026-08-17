"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

/**
 * Les graphes de l'explorateur — et ils ne se contentent pas de montrer : on
 * clique une part pour filtrer dessus. Une répartition qu'on ne peut pas
 * cliquer oblige à retrouver la même case à cocher ailleurs dans l'écran.
 *
 * UNE COULEUR A UN SENS. Le gris est réservé à « on ne sait pas » — palier
 * inconnu, effectif non renseigné, aucune démo. L'ambre marque ce qui vaut de
 * l'argent pour nous (site absent, aucun avis) : ce sont les prospects, pas des
 * anomalies. Le reste suit l'ordre de la palette, stable d'un graphe à l'autre.
 */

const PALETTE = ["#2F7AE0", "#10B981", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16", "#F97316"];
const GRIS = "#94A3B8";
const AMBRE = "#F59E0B";
const ROUGE = "#EF4444";

/** Les clés dont la couleur ne dépend pas de leur rang mais de leur sens. */
const COULEURS_FIXES: Record<string, string> = {
  inconnu: GRIS,
  inconnue: GRIS,
  aucune: GRIS,
  aucun: GRIS,
  absent: AMBRE,
  echec: ROUGE,
  non: GRIS,
  sans: GRIS,
  jamais: GRIS,
  non_qualifiee: GRIS,
};

export function couleurPour(cle: string, rang: number): string {
  return COULEURS_FIXES[cle] ?? PALETTE[rang % PALETTE.length];
}

export type Part = { cle: string; libelle: string; n: number };

/** Formate un entier à la française : 60 447 et non 60447. */
export const nombre = (n: number) => n.toLocaleString("fr-FR");

function InfoBulle({
  actif,
  charge,
  total,
}: {
  actif?: boolean;
  charge?: { payload?: Part }[];
  total: number;
}) {
  if (!actif || !charge?.length) return null;
  const p = charge[0]?.payload;
  if (!p) return null;
  const part = total > 0 ? Math.round((p.n / total) * 1000) / 10 : 0;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-popover-foreground">{p.libelle}</div>
      <div className="text-muted-foreground">
        {nombre(p.n)} · {part.toString().replace(".", ",")} %
      </div>
    </div>
  );
}

type PropsGraphe = {
  titre: string;
  /** La phrase qui dit comment lire le graphe, quand elle n'est pas évidente. */
  aide?: string;
  parts: Part[];
  /** Les clés déjà retenues en filtre — mises en avant, les autres estompées. */
  actifs?: string[];
  onCliquer?: (cle: string) => void;
};

/**
 * L'anneau : pour les dimensions à peu de valeurs (état du site, démo, CA…),
 * où la question est « quelle proportion ».
 */
export function Anneau({ titre, aide, parts, actifs = [], onCliquer }: PropsGraphe) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  const rienDeSelectionne = actifs.length === 0;

  if (total === 0) {
    return (
      <CadreGraphe titre={titre} aide={aide}>
        <p className="py-8 text-center text-xs text-muted-foreground">Aucune entreprise.</p>
      </CadreGraphe>
    );
  }

  return (
    <CadreGraphe titre={titre} aide={aide}>
      <div className="flex items-center gap-3">
        <div className="h-[132px] w-[132px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={parts}
                dataKey="n"
                nameKey="libelle"
                innerRadius={38}
                outerRadius={62}
                paddingAngle={1.5}
                stroke="none"
                isAnimationActive={false}
                onClick={(d: unknown) => {
                  const part = d as { payload?: Part };
                  if (part?.payload) onCliquer?.(part.payload.cle);
                }}
              >
                {parts.map((p, i) => (
                  <Cell
                    key={p.cle}
                    fill={couleurPour(p.cle, i)}
                    fillOpacity={rienDeSelectionne || actifs.includes(p.cle) ? 1 : 0.25}
                    className={onCliquer ? "cursor-pointer outline-none" : undefined}
                  />
                ))}
              </Pie>
              <Tooltip
                content={(props) => (
                  <InfoBulle
                    actif={props.active}
                    charge={props.payload as { payload?: Part }[]}
                    total={total}
                  />
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <Legende parts={parts} total={total} actifs={actifs} onCliquer={onCliquer} />
      </div>
    </CadreGraphe>
  );
}

/**
 * Les barres : pour les dimensions à beaucoup de valeurs (départements,
 * villes), où la question est « lesquelles arrivent en tête ».
 */
export function Barres({ titre, aide, parts, actifs = [], onCliquer }: PropsGraphe) {
  const total = parts.reduce((s, p) => s + p.n, 0);

  if (parts.length === 0) {
    return (
      <CadreGraphe titre={titre} aide={aide}>
        <p className="py-8 text-center text-xs text-muted-foreground">Aucune entreprise.</p>
      </CadreGraphe>
    );
  }

  return (
    <CadreGraphe titre={titre} aide={aide}>
      <div style={{ height: Math.max(120, parts.length * 22) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={parts} layout="vertical" margin={{ top: 0, right: 34, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="libelle"
              width={104}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
              content={(props) => (
                <InfoBulle
                  actif={props.active}
                  charge={props.payload as { payload?: Part }[]}
                  total={total}
                />
              )}
            />
            <Bar
              dataKey="n"
              radius={[0, 3, 3, 0]}
              isAnimationActive={false}
              onClick={(d: unknown) => {
                const part = d as { payload?: Part };
                if (part?.payload) onCliquer?.(part.payload.cle);
              }}
            >
              {/* Une seule couleur : ici les valeurs sont de même nature (des
                  départements, des villes), c'est leur LONGUEUR qui les
                  distingue. Une couleur par barre ferait croire à des
                  catégories différentes. */}
              {parts.map((p) => (
                <Cell
                  key={p.cle}
                  fill={PALETTE[0]}
                  fillOpacity={actifs.length === 0 || actifs.includes(p.cle) ? 1 : 0.25}
                  className={onCliquer ? "cursor-pointer outline-none" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CadreGraphe>
  );
}

function Legende({
  parts,
  total,
  actifs,
  onCliquer,
}: {
  parts: Part[];
  total: number;
  actifs: string[];
  onCliquer?: (cle: string) => void;
}) {
  return (
    <ul className="min-w-0 flex-1 space-y-1">
      {parts.map((p, i) => {
        const part = total > 0 ? Math.round((p.n / total) * 100) : 0;
        const retenu = actifs.includes(p.cle);
        return (
          <li key={p.cle}>
            <button
              type="button"
              disabled={!onCliquer}
              onClick={() => onCliquer?.(p.cle)}
              aria-pressed={retenu}
              className={[
                "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] transition-colors",
                onCliquer ? "hover:bg-muted" : "cursor-default",
                retenu ? "bg-muted font-medium" : "",
              ].join(" ")}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: couleurPour(p.cle, i) }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{p.libelle}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {nombre(p.n)}
              </span>
              <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground/70">
                {part}%
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CadreGraphe({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold tracking-tight text-foreground">{titre}</h3>
      {aide ? <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{aide}</p> : null}
      {children}
    </div>
  );
}
