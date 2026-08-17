/**
 * La vraie première page Google, lue dans un vrai navigateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN NAVIGATEUR ET PAS UNE REQUÊTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérifié le 17/08, avant d'en arriver là :
 *   · google.com/search en HTTP simple → 200, 92 ko, ZÉRO résultat. C'est une
 *     coquille JavaScript ; sans moteur de rendu il n'y a rien à lire.
 *   · html.duckduckgo.com → marche, puis coupe au bout de deux requêtes.
 *   · lite.duckduckgo.com → « Select all squares containing a duck ». Non.
 *   · mojeek.com → répond très bien, mais son index ne connaît pas les artisans
 *     français : « 0 résultat » sur le cas témoin.
 *
 * Un navigateur avec un profil qui persiste résout les trois : il exécute le
 * JavaScript, il garde ses cookies d'une session à l'autre, et Google le traite
 * comme un habitué plutôt que comme un robot de passage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : LA VÉRIFICATION HUMAINE EST HUMAINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Si Google demande un CAPTCHA, ce script NE LE RÉSOUT PAS. Il ouvre la fenêtre,
 * le dit en clair dans la console, et attend que quelqu'un s'en occupe. C'est
 * aussi pour ça que la fenêtre est VISIBLE par défaut : un CAPTCHA dans un
 * navigateur invisible est un blocage sans issue.
 *
 * Le profil vit dans `.prospection/chrome-profil` — pas dans le Chrome de tous
 * les jours, qui serait verrouillé pendant toute la durée du lot. Conséquence :
 * la bannière de consentement Google apparaît UNE fois, au premier lancement.
 * L'accepter est un geste humain, sur un écran visible, pas une case qu'un
 * script coche.
 *
 * Le rythme (`pause`) n'est pas de la politesse décorative : c'est ce qui
 * décide si le lot va au bout ou s'arrête au trentième.
 */

import path from "node:path";

/** Le sélecteur des résultats change tous les six mois ; la structure, non. */
const EXTRACTION = () => {
  const vus = new Set();
  const resultats = [];

  for (const h3 of document.querySelectorAll("#search h3, #rso h3")) {
    const lien = h3.closest("a[href]");
    if (!lien) continue;
    const url = lien.href;
    if (!/^https?:/.test(url)) continue;
    if (/^https?:\/\/(www\.)?google\.[a-z.]+\//.test(url)) continue;
    if (vus.has(url)) continue;
    vus.add(url);

    // Le bloc du résultat : on remonte jusqu'à trouver un conteneur qui porte
    // nettement plus de texte que le titre — c'est là que vit l'extrait.
    const titre = (h3.innerText || "").trim();
    let bloc = lien;
    for (let i = 0; i < 6 && bloc.parentElement; i++) {
      bloc = bloc.parentElement;
      if ((bloc.innerText || "").length > titre.length + 60) break;
    }
    const lignes = (bloc.innerText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const extrait = lignes
      .filter((l) => l !== titre && l.length > 40)
      .join(" ")
      .slice(0, 500);

    resultats.push({ url, titre, extrait });
  }

  // Le panneau de droite : « Site Web » de la fiche Google Business. C'est la
  // même information que l'API Places, mais gratuite et vue telle que le
  // prospect la voit.
  const officiel = document.querySelector(
    'a[data-attrid="visit_official_site"], #rhs a[data-attrid*="website"], .kno-ecr-pt a[href^="http"]',
  );

  return { resultats, siteFichePanneau: officiel ? officiel.href : null };
};

/**
 * Ouvre le navigateur une fois pour tout le lot.
 *
 * Relancer Chromium à chaque requête coûterait deux secondes par entreprise et,
 * surtout, repartirait d'un profil froid : c'est le meilleur moyen de se faire
 * prendre pour un robot à la dixième recherche.
 */
export async function ouvrirMoteurPlaywright({ racine, sansFenetre = false, attenteHumaine = 0 }) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "playwright n'est pas installé.\n" +
        "  npm i -D playwright && npx playwright install chromium",
    );
  }

  const profil = path.join(racine, "chrome-profil");
  const contexte = await chromium.launchPersistentContext(profil, {
    headless: sansFenetre,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = contexte.pages()[0] ?? (await contexte.newPage());

  /**
   * Le mur de Google, et ce qu'on en fait — c'est-à-dire RIEN, par défaut.
   *
   * La première version appelait un humain et attendait. Essayée en vrai le
   * 17/08, sur le lot de la cohorte B : « le captcha était infini, j'ai galéré à
   * le faire, je finissais d'en faire un et ça m'en faisait un autre ». C'est le
   * comportement normal du `/sorry/` de Google face à un navigateur piloté — il
   * ne valide jamais, il réémet. Demander à quelqu'un de le résoudre, c'est lui
   * demander de perdre son après-midi sur une porte qui ne s'ouvre pas.
   *
   * Donc : on n'insiste pas. La fiche est marquée « moteur bloqué », le lot
   * continue, et trois refus d'affilée arrêtent proprement la campagne. Ce n'est
   * pas grave : la recherche web ne sert qu'à la minorité de fiches dont la
   * fiche Google est muette — sur la cohorte B, l'écrasante majorité était déjà
   * réglée par l'API Places sans qu'aucun moteur soit interrogé.
   *
   * `--attendre-humain` rétablit l'ancienne attente, pour qui veut vraiment
   * pousser une fiche précise.
   */
  const attendreLHumain = async (quoi) => {
    if (!attenteHumaine) {
      console.warn(`  ⤫  ${quoi} — fiche passée, on n'insiste pas.`);
      return false;
    }
    if (sansFenetre) {
      console.warn(`  ⤫  ${quoi} — fenêtre masquée, fiche passée.`);
      return false;
    }
    console.warn(
      `\n  ⏸  ${quoi}\n` +
        `     La fenêtre Chromium est ouverte. Attention : le CAPTCHA de Google\n` +
        `     se réémet souvent à l'infini face à un navigateur piloté — inutile\n` +
        `     d'insister s'il revient deux fois. Ctrl-C arrête proprement.\n` +
        `     (abandon automatique dans ${Math.round(attenteHumaine / 1000)} s)\n`,
    );
    const limite = Date.now() + attenteHumaine;
    while (Date.now() < limite) {
      await page.waitForTimeout(3000);
      const u = page.url();
      if (!u.includes("/sorry/") && !u.includes("consent.google.com")) {
        console.warn("  ▶  Reprise.\n");
        return true;
      }
    }
    return false;
  };

  return {
    nom: "google_playwright",

    async chercher(requete) {
      const url = `https://www.google.com/search?q=${encodeURIComponent(requete)}&hl=fr&gl=fr&num=10`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Consentement puis CAPTCHA : deux murs différents, même réponse — on
      // appelle un humain, on ne passe pas au travers.
      if (page.url().includes("consent.google.com")) {
        if (!(await attendreLHumain("Google demande d'accepter ses conditions"))) {
          return { moteur: "google_playwright", requete, html: "", resultats: [], bloque: true, detail: "consentement non donné" };
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      }
      if (page.url().includes("/sorry/")) {
        if (!(await attendreLHumain("Google demande une vérification (CAPTCHA)"))) {
          return { moteur: "google_playwright", requete, html: "", resultats: [], bloque: true, detail: "CAPTCHA non résolu" };
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      }

      // `#search` peut ne jamais venir sur une requête sans le moindre résultat :
      // on n'échoue pas là-dessus, on laisse l'extraction rendre une liste vide.
      await page.waitForSelector("#search, #rso, #botstuff", { timeout: 15000 }).catch(() => {});

      const { resultats, siteFichePanneau } = await page.evaluate(EXTRACTION);
      const html = await page.content();

      return {
        moteur: "google_playwright",
        requete,
        html,
        siteFichePanneau,
        resultats: resultats.slice(0, 10).map((r, i) => ({ rang: i + 1, ...r })),
        // Zéro résultat n'est pas forcément un blocage — certaines raisons
        // sociales n'existent nulle part sur le web. Le blocage, c'est le mur
        // explicite, traité plus haut.
        bloque: false,
      };
    },

    async fermer() {
      await contexte.close().catch(() => {});
    },
  };
}
