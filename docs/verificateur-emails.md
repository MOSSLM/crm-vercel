# Vérificateur d'adresses & garde de délivrabilité

Le CRM démarche des entreprises dont les adresses viennent d'un scraping suivi
d'une extraction par LLM. Elles sont donc, par construction, douteuses : garages
fermés, domaines non renouvelés, adresses recopiées de travers, fautes de frappe.
Chaque rebond abîme la réputation du domaine expéditeur, et jusqu'ici rien ne le
mesurait — `email_logs.resend_id` était écrit puis jamais relu, faute de webhook.

---

## 1. L'idée en une page

Il faut séparer deux choses qu'on confond toujours :

| Ce qui se prouve **avant** l'envoi | Ce qui ne se prouve **que par** l'envoi |
|---|---|
| syntaxe, domaine inexistant, aucun serveur mail, domaine jetable | l'existence réelle de la boîte |
| gratuit, instantané, **certain** | webhooks Resend : un rebond dur dit non, une livraison dit oui |

**Personne ne peut prouver qu'une boîte existe avant de lui écrire.** C'est
précisément pour ça que les librairies de validation « avec vérification SMTP »
se trompent si souvent : les hébergeurs mutualisés français (OVH, Ionos,
o2switch — la majorité des artisans) répondent `250` à *toutes* les adresses, et
les grands providers ne renseignent plus rien. Une sonde SMTP transformerait ce
`250` automatique en « adresse valide ».

Le système ne cherche donc pas à deviner l'indevinable. Il fait trois choses :

1. **éliminer ce qui est mathématiquement mort** — gratuit, certain ;
2. **apprendre de chaque envoi** — les webhooks Resend sont la seule preuve, et
   ils reconduisent la fraîcheur d'une adresse sans jamais rien retester ;
3. **couper si la réalité dérape** — le disjoncteur ne repose sur aucune
   prédiction, c'est ce qui rend la mise en liste noire du domaine
   structurellement improbable.

---

## 2. Les quatre verdicts

Le découpage n'est **pas** « prouvée / non prouvée » : le premier jour, aucune
adresse n'a jamais reçu d'email de notre part, ce partage-là ne dirait rien. Le
bon partage est **« rien à signaler » / « signal négatif concret »**.

| Verdict | Ce que c'est | Part typique d'une base scrapée | Traitement |
|---|---|---|---|
| **invalid** | **preuve** de mort : syntaxe cassée, domaine inexistant (NXDOMAIN), aucun serveur mail, domaine jetable, boîte automatique (`noreply@`), rebond dur déjà encaissé | 10-20 % | aucun envoi, séquence gelée |
| **risky** | pas de preuve de mort, mais un **signal négatif mesurable** (voir plus bas) | 5-15 % | envoi sous quota (`risky_daily_share`, 20 % par défaut) |
| **valid** | aucun signal négatif. Ne veut **pas** dire « boîte prouvée » | 70-85 % | envoi normal, plein régime |
| **unknown** | impossible de trancher (aucun résolveur DNS n'a répondu) | marginal | pas d'envoi, nouvel essai sous 3 jours |

Les signaux négatifs concrets, tous gratuits et mesurables sans rien envoyer :

- **une autre adresse du même domaine d'entreprise a déjà rebondi dur.** Le
  signal le plus fort dont on dispose. Volontairement **ignoré** sur les
  providers grand public : qu'une adresse `@gmail.com` ait rebondi ne dit rien
  de la suivante ;
- le domaine répond mais ne déclare **aucun serveur mail** (A sans MX) ;
- ses MX pointent vers un **parking** de noms de domaine ;
- **trois rebonds temporaires** accumulés sur l'adresse.

Le **catch-all n'est pas un signal négatif**. C'est l'état normal de la moitié
des prospects français ; le pénaliser mettrait la base entière au compte-gouttes
sans le moindre fait à lui reprocher.

### Ce qui n'est jamais pénalisé

Une adresse **générique** d'entreprise (`contact@`, `info@`, `devis@`) est la
cible normale sur un garage, pas un défaut : elle est étiquetée, jamais
dégradée. Seules les boîtes **automatiques** (`noreply@`, `ne-pas-repondre@`)
sont écartées — personne ne les lit.

---

## 3. La fraîcheur, et pourquoi elle ne coûte rien

Un verdict porte une date de péremption (`expires_at`). Passée cette date,
l'adresse repasse par la file de vérification **avant** tout envoi.

| Verdict | Fraîcheur |
|---|---|
| `valid` | `verify_ttl_days` — **120 jours** par défaut, réglable |
| `risky` | 30 jours (un signal négatif tombe souvent tout seul) |
| `invalid` | 365 jours (un domaine mort peut être racheté, mais pas demain) |
| `unknown` | 3 jours |
| syntaxe · jetable · boîte automatique · rebond dur · plainte · désabonnement | **jamais rejoué** |

**Le point qui rend le système gratuit à l'usage :** chaque `email.delivered`
reçu de Resend repousse la péremption de 120 jours. Une adresse qui reçoit
régulièrement n'est donc **jamais retestée** — la vérification de fond ne
travaille que sur ce qui dort.

---

## 4. Où ça vit

| Fichier | Rôle |
|---|---|
| `src/lib/email/verify/normalize.ts` | remet une adresse d'aplomb (`mailto:`, `%20`, chevrons, espaces invisibles, IDN → punycode) |
| `src/lib/email/verify/syntax.ts` | RFC pragmatique **+ les déchets du scraping** (`contact@2x.png`, `info@garage.com.jpg`…) |
| `src/lib/email/verify/domains.ts` | listes : jetables (8 201 domaines), providers grand public FR, adresses génériques, empreintes MX → provider |
| `src/lib/email/verify/typo.ts` | Damerau-Levenshtein → `gmial.com` ⇒ `gmail.com` |
| `src/lib/email/verify/dns.ts` | **DNS over HTTPS** (Cloudflare, repli Google) : MX, A, NXDOMAIN |
| `src/lib/email/verify/score.ts` | **le jugement — pur et testé**, c'est la seule pièce qui décide |
| `src/lib/email/verify/probe.ts` | l'interface d'une sonde SMTP. Non branchée, voir §8 |
| `src/lib/email/verify/service.ts` | la couche base : cache, lots groupés par domaine, compteurs |
| `src/lib/email/send-guard.ts` | **le garde d'envoi** : suppression > mode test > invalide > non vérifiée |
| `src/lib/email/bounce-guard.ts` | le disjoncteur |
| `src/app/api/email/verify/tick/route.ts` | la file de vérification (pg_cron, 5 min) |
| `src/app/api/email/verify/route.ts` | vérification à la demande (`GET` lecture, `POST` contrôle) |
| `src/app/api/webhooks/resend/route.ts` | ce que les emails deviennent réellement |
| `sql/20260803_email_verification.sql` | les quatre tables, les réglages, le job pg_cron |

Le moteur suit la même règle que `regulator.ts` : **le jugement est pur**, l'IO
vit à côté. `score.ts` se teste cas par cas, sans base ni réseau.

---

## 5. Le trajet d'un email

```
étape email due
   │
   ├─ aucune adresse ................ hold_reason = no_email        (rien préparé)
   ├─ phase de test, hors liste ..... hold_reason = test_hold       (rien préparé)
   ├─ adresse supprimée / invalide .. hold_reason = email_invalid   (attend une correction)
   ├─ pas de verdict frais .......... hold_reason = email_pending   (se débloque seul)
   │
   └─ éligible → LA FILE DU RÉGULATEUR
         ├─ disjoncteur déclenché ......... global_pause
         ├─ quota des douteuses atteint ... risky_cap
         ├─ domaine pas encore éprouvé .... domain_probe
         └─ écart, plages, plafonds ....... (règles existantes)
```

Un envoi retenu **ne fait jamais avancer l'inscription**. C'est l'invariant du
régulateur, et il valait déjà pour la phase de test : sur un vrai prospect,
franchir une étape sans avoir rien envoyé lui fait perdre un email pour de bon.

Les motifs sont écrits dans `sequence_enrollments.hold_reason` et affichés tels
quels dans la file du régulateur **et** dans la colonne Email du pipeline
commercial — c'est ce qui rend le système lisible plutôt que magique.

### La première touche par domaine

Sur un domaine **d'entreprise** vers lequel rien n'est jamais parti, une seule
adresse s'en va ; les autres attendent son verdict (`domain_probe`). Si elle
rebondit, elles sont gelées **avant** d'être envoyées, pas après. Sans objet sur
`gmail.com` ou `orange.fr`, qui hébergent des milliers de boîtes indépendantes.

---

## 6. Les webhooks Resend

`POST /api/webhooks/resend`, signé par **Svix** (HMAC-SHA256 sur
`<id>.<timestamp>.<payload>`, vérifié à la main dans la route — pas de
dépendance pour trente lignes). L'horodatage est contrôlé sur une fenêtre de
5 minutes, contre le rejeu d'un message capté.

**Idempotence** : l'événement est d'abord inséré dans `email_events`, dont
`event_id` est la clé primaire. Si l'insertion ne crée rien, l'événement a déjà
été traité et on s'arrête. Aucun compteur ne peut être incrémenté deux fois.

| Événement | Effet |
|---|---|
| `email.bounced` **dur** | adresse condamnée pour de bon · inscrite en suppression · **toutes les inscriptions actives qui la visaient sont gelées** |
| `email.bounced` **doux** | compteur seulement ; `risky` au troisième |
| `email.delivered` | verdict `valid` / `prouvee`, fraîcheur repoussée de 120 jours |
| `email.complained` | suppression + `sales_pipeline_state.state = 'black'` |
| `opened`, `clicked`, `delivery_delayed` | journalisés, sans effet sur le verdict |

Le gel des séquences sur rebond dur est le point critique : sans lui, les deux
relances de la séquence partiraient quand même vers une boîte qu'on sait morte.

**En production, sans `RESEND_WEBHOOK_SECRET`, la route refuse tout** (503) —
n'importe qui pourrait sinon condamner nos adresses en postant de faux rebonds.

---

## 7. Le disjoncteur

C'est la seule protection qui ne repose sur **aucune** prédiction. Tout le reste
essaie de deviner à l'avance ce qui va rebondir et se trompera parfois. Le
disjoncteur, lui, regarde le taux de rebond **réel** des 24 dernières heures.

Au-delà de `bounce_guard_threshold` (4 % par défaut), il met
`regulator_settings.paused = true` et prévient l'admin par une notification.

Deux garde-fous sur le garde-fou :

- un **plancher de 20 envois** sur la fenêtre : sans lui, un rebond sur trois
  envois afficherait 33 % et couperait une file parfaitement saine ;
- **une seule coupure** : si le régulateur est déjà en pause, on ne renotifie
  pas à chaque minute.

Il n'est consulté que lorsqu'il y a des emails à envoyer — un tick au repos
repasse toutes les minutes et doit rester gratuit.

Numérateur (`email_events`) et dénominateur (`email_logs`) sont deux faits, pas
deux estimations.

---

## 8. La sonde SMTP — pourquoi elle n'est pas branchée

`probe.ts` définit l'interface, sans implémentation. Trois obstacles, tous réels :

1. le **port 25 sortant est bloqué** chez Vercel, et selon toute vraisemblance
   chez Supabase (AWS le ferme par défaut) ;
2. une **IP de cloud sans PTR** se fait rejeter ou mettre en quarantaine — la
   réponse obtenue parlerait alors de nous, pas de la boîte ;
3. surtout : chez les **mutualisés catch-all**, le serveur répond `250` à toutes
   les adresses. La sonde ne prouverait rien là où on en aurait le plus besoin.

Le jour où une sonde devient possible (Edge Function Deno, machine avec port 25
ouvert), il suffit de l'enregistrer via `registerProbe()` — le reste de la chaîne
ne bouge pas. **Règle intangible dans ce cas :** le `MAIL FROM` doit utiliser un
**domaine jetable dédié**, jamais le domaine d'envoi réel. Une sonde qui se
présente sous notre nom fait remonter des refus à notre réputation, c'est-à-dire
exactement l'inverse de ce qu'on cherche.

---

## 9. Réglages

Dans **Régulateur › Qualité des adresses** (`regulator_settings`) :

| Réglage | Défaut | Ce que ça fait |
|---|---|---|
| `verify_before_send` | `true` | rien ne part vers une adresse sans verdict frais |
| `verify_ttl_days` | 120 | fraîcheur exigée d'une adresse vérifiée |
| `risky_daily_share` | 20 | part (%) du plafond réservée aux adresses à signal négatif |
| `domain_first_touch` | `true` | une adresse à la fois sur un domaine d'entreprise non éprouvé |
| `bounce_guard` | `true` | pause automatique si le rebond dérape |
| `bounce_guard_threshold` | 4.0 | seuil, en % de rebonds durs sur 24 h |

Couper `verify_before_send` rend exactement le comportement d'avant. C'est aussi
ce qui se passe tant que la migration n'a pas été appliquée : rien ne bloque, et
l'interface dit quel fichier jouer.

---

## 10. Mise en service

1. **Appliquer** `sql/20260803_email_verification.sql` via Supabase MCP (le
   dossier `sql/` est un journal, il ne s'exécute pas tout seul). La migration
   amorce la file en inscrivant toutes les adresses connues en `pending`.
2. **Enregistrer le job pg_cron** `email-verify-tick` (bloc final du fichier, en
   remplaçant `<PG_CRON_SECRET>` par le vrai secret).
3. **Créer le webhook Resend** (Dashboard → Webhooks) vers
   `https://<domaine>/api/webhooks/resend`, en cochant au minimum `email.sent`,
   `email.delivered`, `email.bounced`, `email.complained`. Poser le *Signing
   Secret* dans `RESEND_WEBHOOK_SECRET`.

> **Le premier jour**, toutes les adresses sont `pending` : les séquences se
> gèlent en `email_pending` le temps que la file les traite (300 adresses toutes
> les 5 minutes, groupées par domaine). C'est voulu — c'est exactement le moment
> où l'on ne veut pas envoyer à l'aveugle.

## 11. Ce qui reste manuel

Rien au quotidien. Une adresse jugée invalide se corrige depuis la colonne Email
du pipeline commercial : la saisie vérifie l'adresse dans la foulée, propose la
correction de frappe s'il y en a une, et dégèle la séquence toute seule.
