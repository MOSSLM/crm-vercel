/**
 * Les domaines que le bot sait reconnaître, en dur — la SEMENCE, pas la vérité.
 *
 * La vérité vit dans `url_blacklist`, en base : c'est elle que `dossier-web.mjs`
 * lit, et c'est elle qu'il complète quand il découvre un annuaire de plus. Ce
 * fichier ne sert qu'à deux choses : le versement initial (`semer-domaines.mjs`)
 * et le repli quand la base est injoignable.
 *
 * Ne pas y ajouter un domaine à la main : le poser en base suffit, et il y
 * restera. Ce fichier-ci n'a pas vocation à grandir.
 */
export const DOMAINES_CONNUS = {
  annuaire: [
    "118000.fr", "118712.fr", "adresse-horaire.fr", "annuaire-entreprises.data.gouv.fr",
    "annuaire-horaire.fr", "annuaire.komparo.fr", "argile.ai", "artisanat.fr",
    "aunisatlantique.fr", "b-reputation.com", "bilansgratuits.fr", "bilik.fr",
    "clubtravaux.com", "corporama.com", "creerentreprise.fr", "cylex-locale.fr", "cylex.fr",
    "data.gouv.fr", "dirigeant.fr", "econrjpourtous.fr", "eldo.com", "entreprises.lefigaro.fr",
    "europages.fr", "fattuto.com", "foursquare.com", "france-artisan.fr", "guide-artisan.fr",
    "hellowatt.fr", "hoodspot.fr", "horaire-ouverture.fr", "horairesdouverture24.fr",
    "indexa.fr", "infobel.com", "infogreffe.fr", "justacote.com", "kompass.com",
    "le-site-de.com", "leparisien.fr", "les-energies-renouvelables.eu",
    "les-entreprises-locales.com", "lesbonsartisans.fr", "lexpace.com",
    "maison-architecture.com", "manageo.fr", "mappy.com", "meilleur-artisan.com",
    "nomads-travel.fr", "opendatasoft.com", "opendi.fr", "pagesjaunes.fr", "pagespro.com",
    "pappers.fr", "petitesannonces.fr", "prodestravaux.com", "score3.fr",
    "shopping-horaires.fr", "societe-annuaire.fr", "societe.com", "solvabilite-entreprise.fr",
    "starofservice.com", "toutendroit.com", "toutsurmesfinances.com", "trouver-ouvert.fr",
    "trustpilot.com", "verif.com", "villepratique.fr", "wikiwand.com", "yelp.com", "yelp.fr",
  ],
  apporteur: [
    "3devis.com", "camif-habitat.fr", "devis-travaux.org", "habitatpresto.com", "hellopro.fr",
    "houzz.fr", "izi-by-edf.fr", "leboncoin.fr", "monequerre.fr", "ooreka.fr", "quotatis.fr",
    "rendezvousdestravaux.com", "travaux.com", "travauxlib.com",
  ],
  social: [
    "facebook.com", "instagram.com", "linkedin.com", "pinterest.com", "pinterest.fr",
    "snapchat.com", "tiktok.com", "twitter.com", "x.com", "youtube.com",
  ],
  hebergeur: [
    "blogspot.com", "business.site", "chez.com", "e-monsite.com", "free.fr", "jimdo.com",
    "jimdosite.com", "monsite.com", "over-blog.com", "pagesperso-orange.fr", "site-solocal.com",
    "sites.google.com", "solocalnetwork.fr", "wanadoo.fr", "webnode.fr", "wixsite.com",
    "wordpress.com",
  ],
  moteur: [
    "bing.com", "duckduckgo.com", "goo.gl", "google.com", "google.fr", "maps.google.com",
    "qwant.com", "wikipedia.org", "wikiwand.com",
  ],
  certificateur: [
    "atlantic.fr", "confort.mitsubishielectric.fr", "daikin.fr", "effy.fr",
    "electriciencertifie.legrand.fr", "engie.fr", "hellio.com", "izi-by-edf.fr", "legrand.fr",
    "mitsubishielectric.fr", "qualibat.com", "qualit-enr.org", "rge.hellio.com",
    "saunierduval.fr",
  ],
  reseau: [
    "axenergie.eu", "cclhome.fr", "extra.fr", "groupepalissot.fr", "hip-services.fr",
    "innovatis-groupe.fr", "mestre.fr", "ouvertures.com",
  ],
  plateforme: [
    "artisan-du-batiment.com", "artizo.fr", "chauffagiste-viessmann.fr", "kiwiik.com",
    "monsiteartisan.fr", "simplebo.fr", "solocal.com",
  ],
};
