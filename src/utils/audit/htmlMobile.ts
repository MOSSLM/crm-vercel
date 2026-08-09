import type { AuditContent, AuditProblem, AuditSolution, AuditLivrable, AuditGlobalStyle } from "@/types";
import type { AuditLu } from "@/lib/audit-site/lecture";
import { esc, logoSvg, getServices, calcTotal, fmtEur, makeGrainSvgUrl } from "./htmlShared";

/**
 * Le rendu « mobile / WhatsApp » de l'audit — écrans verticaux, une idée par
 * écran.
 *
 * PORTAGE de `07 Audit/audit-mobile.js` du kit d'identité, dont l'en-tête dit
 * lui-même : « mêmes variables que l'éditeur (page1…page6), découpées en écrans
 * verticaux ». Le kit consommait déjà exactement la forme d'`AuditContent`
 * (`src/lib/audit/default-content.ts`), et ses helpers se déclaraient
 * « portables tels quels dans `src/utils/audit/` ». Il n'y avait donc rien à
 * concevoir : ce fichier reprend `buildScreens()` et branche les helpers réels
 * de `htmlShared.ts` au lieu de les redéfinir.
 *
 * CONSÉQUENCE ARCHITECTURALE, qui est le vrai gain : le PDF A4 et le rapport web
 * lisent le MÊME `audits.content`. Un audit retouché dans l'éditeur change des
 * deux côtés, sans synchronisation. Les notes mesurées ne sont pas un second
 * document mais des écrans INSÉRÉS dans cette séquence — le rédactionnel et la
 * mesure ne peuvent donc pas se contredire.
 *
 * Le découpage automatique des listes est conservé : ajouter une carte dans
 * l'éditeur ajoute un écran, sans toucher à ce fichier.
 */

/** Un écran de la séquence. `auto` = hauteur libre plutôt que plein écran. */
interface Ecran {
  label: string;
  dark?: boolean;
  auto?: boolean;
  inner: string;
}

const ICON = {
  alert: `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#3A7BD5" stroke-width="1"/><line x1="7" y1="4.5" x2="7" y2="7.5" stroke="#3A7BD5" stroke-width="1.1" stroke-linecap="round"/><circle cx="7" cy="9.5" r=".5" fill="#3A7BD5"/></svg>`,
  check: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="#3A7BD5" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const TON = { ok: "#1F8A5B", moyen: "#C8881F", probleme: "#B5322F" } as const;

/** Ce qu'on montre en plus du document : les mesures. */
export interface RapportMesures {
  audit: AuditLu | null;
  /** Capture du site actuel (l'« avant »). */
  captureActuelle?: string | null;
  /** Capture du démo (l'« après »). */
  captureDemo?: string | null;
  /** Note du démo, pour la comparaison. */
  noteDemo?: number | null;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function grain(gs: AuditGlobalStyle | undefined): string {
  const o = gs?.grain_opacity ?? 0.045;
  return `<div class="grain" style="opacity:${o};background-image:${makeGrainSvgUrl(gs?.grain_base_frequency, gs?.grain_color)}"></div>`;
}

function head(eyebrow: string | undefined, title: string | undefined, em: string | undefined, intro?: string): string {
  return `<div><div class="m-eyebrow">${esc(eyebrow ?? "")}</div><div class="m-title">${esc(title ?? "")}${em ? ` <em>${esc(em)}</em>` : ""}</div>${intro ? `<div class="m-intro">${esc(intro)}</div>` : ""}</div>`;
}

function brand(dark: boolean, label: string): string {
  return `<div class="m-top"><div class="m-brand${dark ? "" : " ink"}">${logoSvg(16, dark ? "#B5D0F0" : "#3A7BD5")}<span>SAMA</span></div><span class="m-eyebrow">${esc(label)}</span></div>`;
}

/**
 * Carte « problème », enrichie de la mesure qui la justifie.
 *
 * C'est le point de jonction entre le rédactionnel et l'analyse : la carte vient
 * du catalogue (texte figé, relu, vendeur), la ligne de mesure vient de
 * `entreprises_audit_site`. Sans elle, la carte est une affirmation ; avec elle,
 * c'est un constat.
 */
function carteProbleme(p: AuditProblem, preuve?: string | null): string {
  return `<div class="m-card"><div class="m-card-head"><div class="alert-icon">${ICON.alert}</div><div class="m-card-title">${esc(p.title)}</div></div><div class="m-card-desc">${esc(p.desc)}</div>${
    preuve ? `<div class="m-preuve probleme" style="margin-top:10px"><span class="m-preuve-lib">Mesuré sur votre site</span><span class="m-preuve-val">${esc(preuve)}</span></div>` : ""
  }</div>`;
}

function carteSolution(s: AuditSolution): string {
  return `<div class="m-sol"><div class="m-sol-top"><div class="m-sol-num">${esc(s.num)}</div><div class="m-sol-name">${esc(s.name)}</div></div><div class="m-card-desc">${esc(s.desc)}</div><div class="m-tag">${esc(s.tag)}</div></div>`;
}

function carteLivrable(l: AuditLivrable): string {
  return `<div class="m-liv"><div class="m-liv-head"><div class="m-liv-title">${esc(l.title)}</div><div class="check-badge">${ICON.check}</div></div><div class="m-liv-items">${l.items.map((i) => `<div class="m-liv-item">${esc(i)}</div>`).join("")}</div></div>`;
}

function mockup(url: string, shot: string | null | undefined): string {
  const d = domainOf(url);
  return `<div class="m-shot"><div class="mockup-chrome"><div class="mockup-dots"><i style="background:rgba(255,100,100,.5)"></i><i style="background:rgba(255,200,0,.5)"></i><i style="background:rgba(100,200,100,.5)"></i></div><div class="mockup-url">${esc(d)}</div></div><div class="mockup-screen"><div class="mockup-skeleton"><div class="sk-hero"></div><div class="sk-line" style="width:92%"></div><div class="sk-line" style="width:74%"></div><div class="sk-btn"></div></div>${
    shot ? `<img src="${esc(shot)}" alt="Aperçu du site" loading="lazy">` : ""
  }</div></div>`;
}

const NOM_AXE: Record<string, string> = {
  vitesse: "Vitesse",
  seo: "Référencement",
  mobile: "Mobile",
  conversion: "Contact & confiance",
};

function tonDeNote(n: number): string {
  return n >= 70 ? TON.ok : n >= 45 ? TON.moyen : TON.probleme;
}

/** Anneau de note globale. Conique en CSS : aucun script, aucune image. */
function anneau(note: number, libelle: string | null): string {
  const couleur = tonDeNote(note);
  const deg = Math.round((note / 100) * 360);
  return `<div class="m-ring" style="background:conic-gradient(${couleur} ${deg}deg, rgba(181,208,240,.18) ${deg}deg)"><div class="m-ring-in"><div class="m-ring-val">${note}</div><div class="m-ring-max">sur 100</div></div></div>${
    libelle ? `<div class="m-ring-label">${esc(libelle)}</div>` : ""
  }`;
}

/**
 * Écrans de notes, insérés juste après la couverture.
 *
 * `audit.axes` ne contient QUE les axes publiables : `lireAudit` a déjà retiré
 * ceux en confiance faible, et leurs preuves non mesurées. Ce fichier n'a donc
 * aucune décision à prendre — c'est voulu, la règle ne doit vivre qu'à un
 * endroit.
 */
function ecransNotes(m: RapportMesures, nomClient: string): Ecran[] {
  const a = m.audit;
  if (!a || a.note_globale == null || a.axes.length === 0) return [];

  const ecrans: Ecran[] = [];

  ecrans.push({
    dark: true,
    label: "Note globale",
    inner: `
      ${brand(true, "Analyse de votre site")}
      <div class="m-body" style="justify-content:center">
        <div class="m-title" style="font-size:27px;text-align:center;margin-bottom:26px">L'état actuel de<br><em>${esc(nomClient)}</em></div>
        ${anneau(a.note_globale, a.libelle)}
        ${a.url_analysee ? `<div class="m-note" style="margin-top:22px">${esc(domainOf(a.url_analysee))}${a.analyse_le ? ` · analysé le ${dateFr(a.analyse_le)}` : ""}</div>` : ""}
      </div>`,
  });

  ecrans.push({
    label: "Le détail",
    auto: true,
    inner: `
      ${brand(false, "Le détail")}
      <div class="m-title" style="font-size:26px">Ce que nous avons <em>mesuré</em></div>
      <div class="m-body">
        ${a.axes.map(axe).join("")}
      </div>`,
  });

  return ecrans;
}

function axe(a: AuditLu["axes"][number]): string {
  const couleur = tonDeNote(a.note);
  // Trois preuves suffisent : au-delà, c'est un rapport technique, et le
  // prospect décroche avant d'arriver au bouton.
  const preuves = a.preuves.slice(0, 3);
  return `<div class="m-axe">
    <div class="m-axe-head"><div class="m-axe-name">${esc(NOM_AXE[a.id] ?? a.id)}</div><div class="m-axe-note" style="color:${couleur}">${a.note}<span style="font-size:13px;opacity:.5">/100</span></div></div>
    <div class="m-axe-bar"><div class="m-axe-fill" style="width:${a.note}%;background:${couleur}"></div></div>
    <div class="m-preuves">${preuves
      .map(
        (p) =>
          `<div class="m-preuve ${p.verdict}"><span class="m-preuve-lib">${esc(p.libelle)}</span><span class="m-preuve-val">${esc(p.valeur ?? "")}</span>${
            p.seuil ? `<span class="m-preuve-seuil">seuil ${esc(p.seuil)}</span>` : ""
          }</div>`,
      )
      .join("")}</div>
  </div>`;
}

/**
 * L'écran avant / après.
 *
 * C'est celui qui vend : la même mesure, avec les mêmes seuils, appliquée au
 * site actuel et au démo qu'on a construit. Rien à argumenter — les deux
 * chiffres sortent du même analyseur, et les deux captures sont prises par la
 * même chaîne.
 */
function ecranAvantApres(m: RapportMesures, demoUrl: string): Ecran | null {
  const noteAvant = m.audit?.note_globale ?? null;
  const noteApres = m.noteDemo ?? null;
  if (!m.captureActuelle && !m.captureDemo) return null;

  const colonne = (nom: string, note: number | null, shot: string | null | undefined, vide: string) => `
    <div class="m-vs-col">
      <div class="m-vs-label"><span class="m-vs-name">${esc(nom)}</span>${
        note != null ? `<span class="m-vs-note" style="color:${tonDeNote(note)}">${note}<span style="font-size:12px;opacity:.5">/100</span></span>` : ""
      }</div>
      <div class="m-vs-shot">${shot ? `<img src="${esc(shot)}" alt="" loading="lazy">` : `<div class="m-vs-vide">${esc(vide)}</div>`}</div>
    </div>`;

  return {
    dark: true,
    label: "Avant / après",
    auto: true,
    inner: `
      ${brand(true, "Comparaison")}
      <div class="m-title" style="font-size:26px">Votre site aujourd'hui,<br>et <em>demain</em></div>
      <div class="m-intro">La même analyse, les mêmes critères, appliqués aux deux.</div>
      <div class="m-body">
        <div class="m-vs">
          ${colonne("Aujourd'hui", noteAvant, m.captureActuelle, "Site injoignable")}
          ${colonne("Votre nouveau site", noteApres, m.captureDemo, "Aperçu en préparation")}
        </div>
        <a class="m-btn" href="${esc(demoUrl)}" target="_blank" rel="noopener">Ouvrir mon nouveau site <b>→</b></a>
      </div>`,
  };
}

/** Mesure courte qui justifie une carte problème, par clé de catalogue. */
function preuvePourIssue(cle: string, a: AuditLu | null): string | null {
  if (!a) return null;
  switch (cle) {
    case "slow_site":
      return a.chargement_ms != null
        ? `${(a.chargement_ms / 1000).toFixed(1).replace(".", ",")} s pour afficher la page`
        : null;
    case "no_site_or_unreachable":
      return a.url_analysee ? `${domainOf(a.url_analysee)} ne répond pas` : "aucune adresse de site";
    default: {
      // Les autres clés se justifient par la preuve de l'axe correspondant.
      const parCle: Record<string, string> = {
        outdated_or_not_mobile: "viewport",
        phone_not_clickable: "tel",
        form_not_accessible: "formulaire",
        weak_cta: "cta",
        no_reviews_on_site: "avis",
      };
      const cible = parCle[cle];
      if (!cible) return null;
      for (const ax of a.axes) {
        const p = ax.preuves.find((x) => x.cle === cible);
        if (p?.valeur) return `${p.libelle.toLowerCase()} : ${p.valeur}`;
      }
      return null;
    }
  }
}

function dateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// La séquence
// ---------------------------------------------------------------------------

export function buildScreens(c: AuditContent, m: RapportMesures = { audit: null }): Ecran[] {
  const s: Ecran[] = [];
  const { page1: p1, page2: p2, page3: p3, page4: p4, page5: p5, page6: p6 } = c;
  const nomClient = p1.client_name || "votre entreprise";

  /* 1 · Couverture */
  s.push({
    dark: true,
    label: "Couverture",
    inner: `
    <div class="m-top"><div class="m-brand">${logoSvg(20, "#B5D0F0")}<span>SAMA</span></div><span class="m-date">${esc(p1.date)}</span></div>
    <div class="m-body" style="justify-content:center;gap:0">
      <div class="m-eyebrow">${esc(p1.eyebrow)}</div>
      <div class="m-title" style="font-size:40px">${esc(p1.title_line1)}<br>${esc(p1.title_line2)}<br><em>${esc(p1.title_line3)}</em></div>
      <div class="m-intro">${esc(p1.subtitle)}</div>
      <div class="m-client" style="margin-top:28px"><div class="m-client-label">Préparé pour</div><div class="m-client-name">${esc(nomClient)}</div><div class="m-client-meta">${esc(p1.client_meta || "")}</div></div>
      <div class="m-scroll">Faites défiler<b>↓</b></div>
    </div>`,
  });

  /* 2 · Les notes mesurées, tout de suite après la couverture */
  s.push(...ecransNotes(m, nomClient));

  /* 3 · Avant / après — l'écran qui vend */
  if (p1.demo_url) {
    const vs = ecranAvantApres(m, p1.demo_url);
    if (vs) s.push(vs);
  }

  /* 4 · Site démo — le crochet */
  if (p1.demo_url) {
    s.push({
      label: "Site démo",
      auto: true,
      inner: `
      ${brand(false, "Déjà en ligne")}
      <div class="m-body" style="gap:16px">
        <div><div class="m-title" style="font-size:29px">Votre site démo est <em>prêt</em></div><div class="m-intro" style="margin-top:9px">Nous l'avons construit avant même de vous appeler. Regardez-le, puis lisez la suite.</div></div>
        ${mockup(p1.demo_url, m.captureDemo)}
        <a class="m-btn" href="${esc(p1.demo_url)}" target="_blank" rel="noopener">Ouvrir mon site démo <b>→</b></a>
        <div class="m-note">${esc(domainOf(p1.demo_url))} · aucune inscription, aucun engagement</div>
      </div>`,
    });
  }

  /* 5 · Contexte — 2 cartes sur l'écran d'intro, puis 3 par écran */
  const probs = p2.problems ?? [];
  const preuveDe = (p: AuditProblem) => (p.key ? preuvePourIssue(p.key, m.audit) : null);
  s.push({
    label: "Contexte",
    auto: true,
    inner: `
    ${head(p2.section_label, p2.section_title, p2.section_title_em, p2.section_intro)}
    <div class="m-count">${probs.length} point${probs.length > 1 ? "s" : ""} relevé${probs.length > 1 ? "s" : ""} sur votre site actuel</div>
    <div class="m-body">${probs.slice(0, 2).map((p) => carteProbleme(p, preuveDe(p))).join("")}</div>`,
  });
  chunk(probs.slice(2), 3).forEach((grp) =>
    s.push({
      label: "Contexte (suite)",
      auto: true,
      inner: `
      ${brand(false, p2.section_label ?? "")}
      <div class="m-body" style="justify-content:center">${grp.map((p) => carteProbleme(p, preuveDe(p))).join("")}</div>`,
    }),
  );

  /* Citation */
  if (p2.quote) {
    s.push({
      dark: true,
      label: "Citation",
      inner: `
      ${brand(true, "Le contexte")}
      <div class="m-body" style="justify-content:center">
        <div class="m-quote">«&#8239;${esc(p2.quote)}&#8239;»</div>
        <div class="m-quote-src">${esc(p2.quote_source)}</div>
      </div>`,
    });
  }

  /* Solutions */
  const sols = p3.solutions ?? [];
  s.push({
    label: "Solution",
    auto: true,
    inner: `
    ${head(p3.section_label, p3.section_title, p3.section_title_em, p3.section_intro)}
    <div class="m-body">${sols.slice(0, 2).map(carteSolution).join("")}</div>`,
  });
  chunk(sols.slice(2), 3).forEach((grp) =>
    s.push({
      label: "Solution (suite)",
      auto: true,
      inner: `
      ${brand(false, p3.section_label ?? "")}
      <div class="m-body" style="justify-content:center">${grp.map(carteSolution).join("")}</div>`,
    }),
  );

  /* Livrables */
  const livs = p4.livrables ?? [];
  s.push({
    label: "Livrables",
    auto: true,
    inner: `
    ${head(p4.section_label, p4.section_title, p4.section_title_em, p4.section_subtitle)}
    <div class="m-body">${livs.slice(0, 2).map(carteLivrable).join("")}</div>`,
  });
  chunk(livs.slice(2), 2).forEach((grp) =>
    s.push({
      label: "Livrables (suite)",
      auto: true,
      inner: `
      ${brand(false, p4.section_label ?? "")}
      <div class="m-body" style="justify-content:center">${grp.map(carteLivrable).join("")}</div>`,
    }),
  );

  /* Investissement */
  const services = getServices(p5).filter((x) => x.enabled);
  const tot = calcTotal(getServices(p5));
  s.push({
    dark: true,
    label: "Investissement",
    auto: true,
    inner: `
    ${brand(true, p5.section_label ?? "")}
    <div class="m-body" style="gap:0">
      <div class="m-title" style="font-size:27px;font-style:italic;margin-top:4px">${esc(p5.pricing_subtitle || "Investissement")}</div>
      <div style="margin-top:18px">
        ${services
          .map(
            (x) =>
              `<div class="m-price-row"><div><div class="m-price-label">${esc(x.label)}</div>${x.sub_label ? `<div class="m-price-sub">${esc(x.sub_label)}</div>` : ""}</div><div class="m-price-amount">${x.from ? "<small>dès </small>" : ""}${fmtEur(x.amount)}${x.is_mrr ? "<small>/mois</small>" : ""}</div></div>`,
          )
          .join("")}
        ${!p5.hide_total ? `<div class="m-price-total"><div class="m-price-total-label">${tot.hasMrr ? "Total (an 1)" : "Total"}</div><div class="m-price-total-amount">${fmtEur(tot.total)}</div></div>` : ""}
        ${p5.price_note ? `<div class="m-price-note">${esc(p5.price_note)}</div>` : ""}
        ${
          p5.secondary_card
            ? `<div class="m-alt-dark">${p5.secondary_card.subtitle ? `<div class="m-alt-sub">${esc(p5.secondary_card.subtitle)}</div>` : ""}<div class="m-alt-title">${esc(p5.secondary_card.title)}</div>${p5.secondary_card.description ? `<div class="m-alt-desc">${esc(p5.secondary_card.description)}</div>` : ""}<div class="m-alt-price">${p5.secondary_card.from ? '<span class="m-alt-from">À partir de</span>' : "<span></span>"}<span class="m-alt-amount">${fmtEur(p5.secondary_card.amount)}</span></div></div>`
            : ""
        }
      </div>
    </div>`,
  });

  /* Services additionnels */
  const addl = p5.additional_services ?? [];
  if (addl.length) {
    s.push({
      label: "Services additionnels",
      auto: true,
      inner: `
      ${brand(false, p5.addl_section_title || "Options")}
      <div class="m-body" style="justify-content:center">
        ${addl
          .map(
            (x) =>
              `<div class="m-alt"><div class="m-alt-title" style="font-style:normal;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500">${esc(x.label)}</div>${x.description ? `<div class="m-alt-desc">${esc(x.description)}</div>` : ""}<div class="m-alt-price"><span></span><span class="m-alt-amount">${fmtEur(x.amount)}${x.is_mrr ? '<span style="font-size:13px;color:rgba(11,29,58,.5)">/mois</span>' : ""}</span></div></div>`,
          )
          .join("")}
      </div>`,
    });
  }

  /* Prochaines étapes */
  s.push({
    label: "Prochaines étapes",
    auto: true,
    inner: `
    ${head(p6.section_label, `${p6.section_title ?? ""} ${p6.section_title_line2 ?? ""}`.trim(), p6.section_title_em, p6.section_subtitle)}
    <div class="m-body" style="padding-top:14px">${(p6.next_steps ?? [])
      .map(
        (x, i) =>
          `<div class="m-step"><div class="m-step-num">${i + 1}</div><div><div class="m-step-title">${esc(x.title)}</div><div class="m-step-desc">${esc(x.desc)}</div></div></div>`,
      )
      .join("")}</div>`,
  });

  /* Méthode — court, factuel, avant le contact */
  if (m.audit) {
    s.push({
      label: "Méthode",
      auto: true,
      inner: `
      ${brand(false, "Transparence")}
      <div class="m-title" style="font-size:24px">Comment nous avons <em>mesuré</em></div>
      <div class="m-body">
        <div class="m-methode">
          Analyse <b>automatisée</b> de la page d'accueil de votre site${m.audit.url_analysee ? ` (${esc(domainOf(m.audit.url_analysee))})` : ""}${m.audit.analyse_le ? `, le ${esc(dateFr(m.audit.analyse_le))}` : ""}.
          Nous mesurons le temps de réponse du serveur, le temps de réception de la page, son poids,
          la présence des balises de référencement, l'adaptation au mobile et les moyens de vous contacter.
          <br><br>
          Nous <b>ne mesurons pas</b> le rendu visuel après exécution des scripts, ni l'accessibilité réelle :
          cela demande un vrai navigateur. Un critère que nous n'avons pas pu mesurer de façon fiable
          n'est pas affiché plutôt que d'être supposé.
          <br><br>
          Ces chiffres sont reproductibles : la même analyse tourne sur votre site actuel et sur le site
          que nous vous proposons, avec les mêmes seuils.
        </div>
      </div>`,
    });
  }

  /* Contact */
  s.push({
    dark: true,
    label: "Contact",
    inner: `
    ${brand(true, "Pour démarrer")}
    <div class="m-body" style="justify-content:center;gap:0">
      <div class="m-title" style="font-size:34px">${esc(p6.cta_title)}</div>
      <div class="m-intro">${esc(p6.cta_sub)}</div>
      <div class="m-actions" style="margin-top:26px">
        ${p6.contact_phone ? `<a class="m-btn" href="tel:${esc(String(p6.contact_phone).replace(/\s/g, ""))}">Appeler ${esc(p6.contact_phone)}</a>` : ""}
        ${p6.contact_email ? `<a class="m-btn m-btn-ghost" href="mailto:${esc(p6.contact_email)}">${esc(p6.contact_email)}</a>` : ""}
        ${p1.demo_url ? `<a class="m-btn m-btn-ghost" href="${esc(p1.demo_url)}" target="_blank" rel="noopener">Revoir mon site démo →</a>` : ""}
      </div>
      <div class="m-sign">${logoSvg(18, "#3A7BD5")}<div class="m-sign-text">SAMA · Agence digitale indépendante${p6.contact_website ? `<br>${esc(p6.contact_website)}` : ""}</div></div>
    </div>`,
  });

  return s;
}

/** La séquence complète en HTML, prête à être injectée dans la page. */
export function renderAuditMobile(c: AuditContent, m: RapportMesures = { audit: null }): string {
  const ecrans = buildScreens(c, m);
  const total = ecrans.length;
  const nom = c.page1.client_name || "Audit";

  return `<div class="doc">${ecrans
    .map(
      (o, i) =>
        `<div class="screen${o.dark ? " dark" : ""}${o.auto ? " auto" : ""}">${
          o.dark ? `<div class="m-sky"></div>${grain(c.global_style)}` : ""
        }<div class="m-in">${o.inner}
<div class="m-foot"><span>${esc(nom)}</span><b>${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</b></div></div></div>`,
    )
    .join("")}</div>`;
}
