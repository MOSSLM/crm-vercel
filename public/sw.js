/*
 * Le service worker du CRM — et ce qu'il ne fait PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE MET RIEN EN CACHE. C'EST UNE DÉCISION, PAS UN OUBLI.
 * ─────────────────────────────────────────────────────────────────────────────
 * Un service worker qui intercepte les navigations peut servir une version
 * périmée d'un écran, et surtout la servir LONGTEMPS : tant qu'on n'a pas
 * compris d'où vient l'écran fantôme, on cherche le bogue dans le code affiché,
 * qui n'est pas celui qui tourne. Ce piège a un coût sans commune mesure avec le
 * gain — les assets `/_next/static` sont déjà immuables et cachés par en-têtes
 * HTTP, il n'y a rien à gagner à les recopier ici.
 *
 * Le gestionnaire `fetch` existe donc, mais n'appelle JAMAIS `respondWith`.
 * Sans lui, Chrome refuse d'installer l'application ; avec lui mais vide, le
 * navigateur fait exactement ce qu'il ferait sans service worker. C'est le seul
 * réglage qui rend l'app installable sans changer une seule requête.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE PEUT PAS ATTEINDRE LES SITES DES CLIENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le CRM vit sur `app.{SITE_DOMAIN}` ; les sites publiés vivent sur
 * `{label}.{SITE_DOMAIN}` ou sur le domaine propre du client. Ce sont des
 * ORIGINES différentes, et la portée d'un service worker s'arrête à son origine.
 * Ce fichier est bien servi sur tous les hôtes (le middleware laisse passer tout
 * chemin contenant un point), mais un fichier n'est un service worker que si une
 * page l'enregistre — et seule la coque CRM l'enregistre. La garantie vient de
 * l'architecture des domaines, pas de la prudence de ce code ; celui-ci est
 * inoffensif de surcroît.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT VRAIMENT : RECEVOIR LES NOTIFICATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * La table `notifications` existait depuis des mois et n'était lue que par un
 * panneau qu'il fallait ouvrir soi-même. Un service worker est le seul moyen,
 * sur le web, de recevoir quelque chose quand l'onglet est fermé — c'est la
 * raison d'être de ce fichier.
 */

/* eslint-disable no-undef */

// Prendre la main tout de suite plutôt qu'au prochain démarrage : un service
// worker qui n'attend rien n'a aucune raison de faire patienter sa mise à jour.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Volontairement vide — voir l'en-tête. Ne jamais y ajouter `respondWith`.
self.addEventListener("fetch", () => {});

/**
 * Une poussée arrive. Le corps est du JSON produit par `lib/push/envoyer.ts`,
 * mais on ne le suppose pas : un `push` sans données ou mal formé doit quand
 * même afficher quelque chose. Une notification muette est pire qu'une
 * notification vague — le navigateur reproche visiblement à l'application de ne
 * pas avoir affiché ce pour quoi elle a été réveillée.
 */
self.addEventListener("push", (event) => {
  let charge = {};
  try {
    charge = event.data ? event.data.json() : {};
  } catch {
    charge = { corps: event.data ? event.data.text() : "" };
  }

  const titre = charge.titre || "Sama CRM";
  const options = {
    body: charge.corps || "",
    icon: "/pwa/icone-192.png",
    badge: "/pwa/icone-maskable-192.png",
    lang: "fr",
    timestamp: Date.now(),
    // `tag` fait qu'une seconde notification du même sujet REMPLACE la
    // première au lieu de s'empiler. Sans lui, une séquence qui rebondit dix
    // fois pose dix bannières et on n'en lit aucune.
    tag: charge.groupe || undefined,
    renotify: Boolean(charge.groupe),
    data: { url: charge.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(titre, options));
});

/**
 * Un clic doit RÉUTILISER l'onglet déjà ouvert quand il y en a un. Ouvrir une
 * fenêtre à chaque notification laisse le commercial avec six onglets du même
 * CRM, dont cinq portent un état périmé.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        // Même origine : on navigue dans l'onglet existant.
        if ("focus" in fenetre) {
          if ("navigate" in fenetre && new URL(fenetre.url).origin === self.location.origin) {
            return fenetre.navigate(cible).then((f) => (f ? f.focus() : undefined));
          }
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(cible);
    }),
  );
});

/**
 * L'abonnement peut être révoqué par le navigateur — après une longue absence,
 * un changement de clé serveur, un nettoyage de stockage. Sans ce gestionnaire,
 * l'abonnement meurt en silence : le CRM continue de pousser vers une adresse
 * morte et personne ne reçoit plus rien, sans qu'aucune erreur ne remonte.
 *
 * On se réabonne avec la MÊME clé publique que celle de l'abonnement expiré
 * (`oldSubscription.options.applicationServerKey`) : le service worker n'a pas
 * accès aux variables d'environnement, et rejouer la clé évite d'avoir à les
 * lui transmettre.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const ancien = event.oldSubscription;
  const cle = ancien && ancien.options && ancien.options.applicationServerKey;
  if (!cle) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: cle })
      .then((abonnement) =>
        fetch("/api/push/abonnement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Pas de jeton d'authentification ici : le service worker n'a pas de
          // session. La route accepte donc un renouvellement identifié par
          // l'ancien endpoint, qu'elle seule connaît déjà.
          body: JSON.stringify({
            abonnement: abonnement.toJSON(),
            remplace: ancien.endpoint,
          }),
        }),
      )
      .catch(() => {
        /* Rien à faire de plus : la prochaine ouverture du CRM réabonnera. */
      }),
  );
});
