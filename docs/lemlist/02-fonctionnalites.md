# lemlist — l'inventaire des fonctionnalités, par domaine

> Le regroupement des notes brutes. Ici, **rien que ce que lemlist fait** — la
> correspondance avec notre CRM est dans [`03-architecture.md`](03-architecture.md).
> La colonne « Pour nous » ne dit pas si c'est fait, elle dit si ça **nous sert** :
> ⬤ indispensable · ◐ utile · ○ inutile ou hors marché.

---

## A. Trouver les leads

| Fonction | Détail | Pour nous |
| --- | --- | --- |
| Base de leads | 650 M+ personnes (450 M+ selon le centre d'aide), filtres par IA | ○ — base mondiale B2B ; nos artisans français n'y sont pas, et nous avons déjà 60 445 fiches |
| Prospection par compte | cibler l'entreprise puis ses contacts | ◐ |
| Email Finder & Verifier | 5 crédits/adresse, « 80% of leads' emails » | ⬤ — nous avons le vérificateur, pas le chercheur |
| Phone Number Finder | 20 crédits/numéro, cascade multi-fournisseurs | ◐ — nos numéros viennent de Maps et de l'ADEME |
| Enrichissement LinkedIn | illimité, via l'extension | ○ — cible peu présente |
| Export LinkedIn / CSV | illimité | ◐ |
| Contacts illimités | pas de plafond de fiches | ⬤ |
| Scoring de leads | note d'engagement | ◐ — à ne pas inventer sans mesure derrière |
| Gestion centralisée des contacts | fiche unique, champs personnalisés | ⬤ |

## B. Signaux d'intention

| Signal | Coût | Pour nous |
| --- | --- | --- |
| L'entreprise a visité notre site | 20 crédits | ⬤ — nous avons GA4 et les vues de plaquette |
| Recrutement / changement de poste | dès 100 crédits | ○ |
| Levée de fonds | 100 crédits | ○ |
| Changement de pile technique | — | ⬤ — c'est notre détection de technologie |
| Engagement LinkedIn | dès 400 crédits | ○ |
| Contact qui change de poste | — | ○ |

**Mécanique** : une **veille** (« watchlist ») = un type de signal + des critères.
Détection continue sur l'ICP, notification dans l'app, puis un agent transforme le
signal en campagne personnalisée avec séquence suggérée.

> Nos signaux à nous, qui n'ont pas d'équivalent chez eux : RGE qui expire sous 90 jours,
> note d'audit qui chute, concurrent détecté sur un prospect, plaquette ouverte,
> rapport public consulté.

## C. Séquences et campagnes

| Fonction | Détail |
| --- | --- |
| **Campagne = 4 onglets** | Sequence · Lead list · Launch · Performance |
| Types d'étape | e-mail, LinkedIn (6 actions), appel, SMS, WhatsApp, tâche manuelle, appel API, délai |
| **Conditions** | 13, avec branches Oui/Non — voir [`04-modele-de-donnees.md`](04-modele-de-donnees.md) |
| Temporisation | *Within X jours* (fenêtre) ou *Wait until* (indéfini) |
| Délais | **comptés en jours d'envoi, pas en jours calendaires** ; au moins 1 jour avant une condition |
| Étapes manuelles | n'importe quelle étape se convertit en tâche |
| Réordonner / supprimer / sauter | y compris pour un seul lead |
| Fil de discussion | garder les relances dans le même fil (objet vide) |
| Modifier une campagne active | avec règles selon l'avancement des leads |
| Multi-threading | plusieurs contacts d'une entreprise ; **pause des autres dès qu'un répond** |
| Lancement automatique / arrêt automatique | — |
| **Reverse launch** | faire **reculer** un lead dans la séquence |
| Pause / reprise d'un lead | individuelle |
| Aperçu d'étape · revue de campagne | avant lancement |
| Campagnes partagées | entre coéquipiers |
| Tests A/B | variantes de séquence et de message |
| Bibliothèque de modèles | « 37k+ lemlisters », duplication |

## D. Personnalisation et rédaction

| Fonction | Détail | Pour nous |
| --- | --- | --- |
| Variables personnalisées | issues du CSV, du CRM ou de l'enrichissement | ⬤ — nous les avons |
| **Syntaxe Liquid** | texte conditionnel, valeurs de repli | ⬤ — nous ne l'avons pas |
| Texte et **images personnalisés** | prénom, logo, capture incrustés dans une image | ⬤ — et nous avons mieux : la capture du site réel |
| Pages d'atterrissage personnalisées | une page par lead | ⬤ — c'est notre plaquette à jeton |
| Icebreakers par IA | à partir de la bio LinkedIn | ◐ |
| Notes vocales LinkedIn personnalisées par IA | clonage de voix | ○ |
| Réponses générées par IA | dans l'inbox | ◐ |
| Aperçu par lead | avant lancement, modifiable pour un lead précis | ⬤ |
| Modèles de messages | bibliothèque | ⬤ |

## E. Délivrabilité

| Fonction | Détail |
| --- | --- |
| **lemwarm** | chauffe des boîtes, inclus dans toutes les offres |
| Rotation des boîtes | répartir le volume automatiquement |
| Plafonds **par boîte** | et gestion des limites d'envoi |
| Algorithme d'envoi intelligent | espacement naturel, fuseau horaire du destinataire |
| Domaine de suivi personnalisé | — |
| IP tournantes | — |
| Test DNS (SPF, DKIM, DMARC) | — |
| Test de placement | boîte de réception ou spam |
| Deliverability Boost | contrôle du texte, de la configuration et des signaux **avant** envoi |
| Vérification de la liste | avant l'entrée en campagne |
| Lien de désabonnement | — |
| Alertes de délivrabilité | — |
| Achat de domaine et d'adresses dans l'app | — |
| Google, Microsoft, SMTP | — |

**Repères de volume publiés** : boîte neuve < 1 an → 40/jour maximum ; boîte établie →
60–70/jour ; pendant la chauffe → lemwarm à 40/jour et lemlist à 1/jour les deux
premières semaines ; pour 300/jour → 4 à 6 boîtes. **Le total d'une boîte = chauffe +
prospection + réponses manuelles.**

## F. Inbox

Conversations unifiées tous canaux et tous expéditeurs · jusqu'à 15 adresses par
utilisateur · réponse par e-mail, LinkedIn, WhatsApp ou appel depuis le fil · filtres,
étiquettes, recherche · statuts **Interested / Not interested / Unsubscribed** ·
marquage du stade de vie · assignation de tâches · suivi ouvertures/clics/réponses ·
détection d'absence du bureau · détection d'intention de réponse par IA · réponses
suggérées par IA · section Désabonnements · barre d'outils e-mail.

## G. Tâches

Six types (appel, e-mail, LinkedIn, WhatsApp, SMS, manuelle) × cinq statuts (Due,
Upcoming, Paused, Done, Ignored) · tableau à **colonnes configurables** · filtres en
trois familles (tâche / contact / entreprise) avec **ET-OU imbriqués** · pastilles
éditables · **vues sauvegardées** (nom, icône, portée, tri, compteur en direct) ·
création automatique depuis une étape manuelle ou **une branche conditionnelle** ·
création manuelle · « Mark as done » / « Send & mark done » · Ignore · **actions de
masse** (terminer, ignorer, reprogrammer, changer de propriétaire, changer la priorité)
· filtre **heure locale**.

## H. Rapports

Quatorze widgets (5 d'activité, 7 d'entonnoir, 2 de mise en forme) · filtres date /
étiquettes / campagnes / utilisateurs · **onglets sauvegardables** · partage par lien
restreint ou public · widgets déplaçables et redimensionnables · export CSV.

**Les deux entonnoirs** :
`Contacté → Délivré → Ouvert → Cliqué → Répondu → Intéressé`
et, séparément, `Non délivré · Pas intéressé · Désabonné`.

## I. IA

**lemAgent** — construire et lancer une campagne en décrivant son objectif ; le
résultat atterrit **dans l'éditeur standard**, à valider. Campagne prête « in under
15 minutes ».
**Agents d'enrichissement** — nettoyage des données, recherche web, recherche sur le
compte et le contact, agent d'extraction d'URL, agents LinkedIn.
**Agents de signaux** — veille sur l'ICP.
**Agents Claap** — enregistrement d'appel, objections, signaux d'achat, risques,
notes de coaching, résumé et e-mail de suivi rédigés à la fin de l'appel.
**Dans l'inbox** — détection d'intention, détection d'absence du bureau, réponses
générées.
**Divers** — remplissage automatique du CRM, filtres de base par IA.

## J. Intégrations

CRM : HubSpot, Salesforce, Pipedrive, Attio · VoIP : Aircall, Ringover ·
Automatisation : Zapier, Make, n8n, Clay · Claap · **API, CLI et serveur MCP** ·
extension Chrome (travailler depuis LinkedIn, Gmail et le CRM) · lemcal ·
« 500+ integrations ».

## K. Équipe et administration

Invitations · rôles et permissions (personnalisables en Enterprise) · utilisateurs
invités · campagnes partagées · attribution de crédits par utilisateur (Enterprise) ·
journaux d'activité (Enterprise) · SSO/SAML · double authentification · facturation en
devise locale · interface en quatre langues.

## L. lemcal — prise de rendez-vous

Pages de réservation personnalisables · plusieurs types de rendez-vous · disponibilités ·
**round robin** · limite de rendez-vous par jour · rappels automatiques · questions
préalables · réservation payante · réunions à plusieurs · synchronisation Google et
Microsoft · Meet, Zoom, Teams · import depuis Calendly et HubSpot · URL de redirection ·
intégration dans un site · Zapier.

---

## Ce que nous ne construirons pas, et pourquoi

| Écarté | Raison |
| --- | --- |
| **Base de leads mondiale** | Notre marché est l'artisan français. Notre base fait 60 445 fiches issues de Maps, de l'ADEME, de ProÉco et de la recherche — aucune base B2B mondiale ne les contient. |
| **Extension Chrome** | Hors périmètre acté. Utile pour prospecter sur LinkedIn ; notre prospection part de l'explorateur. |
| **Achat de domaines et d'adresses dans l'app** | Revente d'infrastructure, sans rapport avec notre besoin. |
| **Clonage de voix pour notes vocales** | Cible peu présente sur LinkedIn ; et le procédé se retourne vite contre celui qui l'emploie. |
| **Signaux « levée de fonds » et « changement de poste »** | Un plombier de trois personnes ne lève pas de fonds. |
| **Facturation en crédits** | Nous avons déjà un budget d'enrichissement par agent, en centimes, qui fait le même travail sans inventer une monnaie. |
