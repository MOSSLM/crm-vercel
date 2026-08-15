# Ne pas compter nos propres visites

## Le problème

Deux personnes démarchent depuis le CRM. Avant d'envoyer un lien, elles ouvrent
la démo du prospect pour vérifier qu'elle est belle. Parfois deux fois, parfois
depuis le téléphone, parfois le lendemain.

Google Analytics ne sait pas faire la différence entre elles et le prospect. Il
voit simplement des visites sur `plomberie-durand.samadigitalstudio.fr`. Le
radar les lit, `scoreIntent` (`src/lib/analytics-radar/intent.ts`) y voit un
retour, un deuxième appareil, des pages clés ouvertes — et remonte la fiche en
« 🔥 à rappeler aujourd'hui ». Le commercial décroche et dit « je vois que vous
êtes repassé sur votre site » à quelqu'un qui n'a jamais cliqué.

Le même trafic part ensuite dans l'export BigQuery (qui alimente « Parcours
détaillés ») et dans Clarity. Un seul geste le crée, quatre outils le répètent.

## Le principe

**On ne filtre pas après coup : on n'émet pas.**

Tout le parc est mesuré depuis un seul endroit — `PublicAnalytics`
(`src/components/analytics/PublicAnalytics.tsx`), le composant du layout
`(public)` qui pose le tag GA4 et le tag Clarity sur les sites publiés, les
aperçus de brouillon et les rapports d'audit. Une page qui ne charge pas ces
deux scripts est invisible **partout à la fois** : GA4, l'export BigQuery qui en
découle, Clarity, et donc le radar et les scores d'intention.

Un filtre posé plus loin (dans la route du radar, par exemple) aurait dû être
recopié dans chaque lecture, et aurait de toute façon laissé les visites dans
les outils tiers.

## Les trois couches

### 1. Les liens du CRM (automatique, rien à faire)

Tous les boutons « Ouvrir » du CRM habillent l'adresse avec `?sama_interne=1`
(`lienNonMesure`, dans `src/lib/analytics/trafic-interne.ts`) : démarchage,
fiche entreprise, kanban des démos, dialogue de partage, panneau lead magnets,
liste des séquences (démo et rapport d'audit).

L'agent n'a rien à retenir : ouvrir une démo depuis le CRM ne compte jamais, y
compris sur un poste neuf ou en navigation privée.

**Ce qui n'est jamais habillé, et ne doit jamais l'être :** l'URL copiée, celle
collée dans un message WhatsApp ou un e-mail, et celle des cartes OpenGraph.
Ces adresses-là partent chez le prospect, et c'est précisément sa visite qu'on
veut mesurer. En cas de doute : si le lien est *cliqué* par nous, il est
habillé ; s'il est *envoyé*, il reste nu.

### 2. Le cookie (automatique, deux ans)

La première visite paramétrée pose un cookie `sama_interne=1` sur
`.samadigitalstudio.fr`, donc valable pour **tous** les sous-domaines : les 300
démos, les aperçus de brouillon, `rapport.`, et le CRM lui-même.

Il couvre ce que le paramètre ne peut pas couvrir : le favori, l'historique, le
bouton « précédent », le lien recollé à la main dans le téléphone.

Un interrupteur le règle aussi à la main, avec l'état affiché :

- agents : **Espace agent › Paramètres › « Ne pas compter mes visites »**
- admin : **Réglages › Préférences › « Ne pas compter mes visites »**

À faire **une fois par appareil** (ordinateur, téléphone) et à refaire après un
nettoyage des cookies. `?sama_interne=0` sur n'importe quelle URL du parc
efface le marquage — utile sur un poste partagé.

### 3. La règle IP (à faire à la main, dans les consoles)

Les deux couches ci-dessus suivent la *personne*. La règle IP suit le *bureau* :
elle rattrape le navigateur qui n'aurait ni paramètre ni cookie.

**GA4** — deux écrans, et le second est celui qu'on oublie :

1. Admin › Flux de données › le flux web › Paramètres de balise supplémentaires
   › **Définir le trafic interne** › créer une règle avec l'IP publique du
   bureau. Elle marque les hits `traffic_type = internal` ; à ce stade **rien
   n'est encore exclu**.
2. Admin › Paramètres des données › **Filtres de données** › le filtre
   « Internal Traffic » › passer son état de *Test* à **Actif**.

Un filtre actif exclut à l'*ingestion* : les hits n'entrent ni dans les
rapports, ni dans l'export BigQuery. C'est ce qui protège aussi les « Parcours
détaillés ».

**Clarity** — Settings › Project setup › **IP blocking** : ajouter la même IP.

⚠️ À ne faire que si l'IP du bureau est fixe. Avec une IP dynamique (fibre grand
public, 4G, télétravail), la règle rate sa cible et donne un faux sentiment de
sécurité : les couches 1 et 2 restent alors les seules qui tiennent.

## Ce que ça ne fait pas

**Effacer le passé.** Les visites déjà envoyées restent dans GA4 et dans
l'export BigQuery. Aucun outil ne permet de les retirer rétroactivement, et le
filtre de données de GA4 n'agit que sur ce qui arrive après son activation.

Concrètement : les scores d'intention actuels restent gonflés par l'historique.
Ils redeviennent justes au fur et à mesure que la fenêtre du radar avance —
quelques jours pour « 24 h » et « 7 j », un mois pour « 30 j ».

**Distinguer laquelle des deux personnes a visité.** L'exclusion est binaire :
mesuré ou pas. Savoir *qui* de l'équipe a ouvert quoi demanderait un identifiant
par agent dans le tag, c'est-à-dire mesurer nos propres gens — l'inverse de ce
qu'on cherche ici.

## Vérifier que ça marche

1. Ouvrir une démo depuis le bouton « Ouvrir » du démarchage.
2. Dans GA4 › Rapports › **Temps réel**, vérifier que la visite n'apparaît pas
   (compter ~30 s de latence avant de conclure).
3. Dans le CRM, l'interrupteur « Ne pas compter mes visites » doit maintenant
   afficher *Ce navigateur n'est pas compté* — c'est le cookie posé à l'étape 1.

Contre-épreuve, pour être sûr de ne pas avoir cassé la mesure : ouvrir la même
démo en navigation privée **sans** passer par le CRM. Elle doit apparaître dans
le temps réel. Si elle n'apparaît pas, le problème est ailleurs (variables
`NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_CLARITY_PROJECT_ID`, bloqueur de
publicités).
