# Le réchauffeur — ce qu'on a déjà, et ce que ça vaut vraiment

> Écrit le 19 août 2026, après avoir mesuré le DNS des deux domaines, lu les
> 3 467 lignes de `/Users/matt/Code/email-warmup` et confronté le tout au chemin
> d'envoi du CRM. Tous les chiffres ci-dessous sont relevés, pas estimés.

---

## 1. Le réchauffeur existe déjà

Une application Next.js autonome, écrite le 16 août, vit hors du dépôt :
`/Users/matt/Code/email-warmup`. Elle est complète et documentée.

| Ce qu'elle porte | Où |
| --- | --- |
| Contrôle DNS (SPF/DKIM/DMARC/MX) | `src/lib/dns-check.ts` |
| Chiffrement des secrets de boîtes, AES-256-GCM | `src/lib/crypto.ts` |
| Trois transports sous un contrat commun | `src/lib/connectors/` (IMAP-SMTP, API Gmail, Microsoft Graph) |
| Courbe de montée, bruit horaire, délai de réponse | `src/lib/warmup/schedule.ts` |
| Score de santé, verdict de palier, capacité de prospection | `src/lib/warmup/health.ts` |
| Appariement des destinataires | `src/lib/warmup/pairing.ts` |
| Le tick : planifier · envoyer · mesurer · sauver du spam · répondre · agréger | `src/lib/warmup/engine.ts` (486 lignes) |
| Huit tables Postgres, dont un verrou de moteur | `sql/001_schema.sql` |
| Quatre documents sur la délivrabilité | `docs/01` à `docs/04` |

**La couche 7 du plan n'est donc pas à écrire. Elle est à rapatrier.** Mais pas
telle quelle, et pour une raison que seul le DNS révèle.

---

## 2. Le principe du plan est faux — la mesure le dit

Le plan posait : *« le réchauffeur est une campagne comme les autres : il passe
par le même régulateur et compte dans le même plafond »*. Sur l'axe qui compte —
la réputation — **c'est faux**, et voici pourquoi.

### Nos deux domaines n'ont rien en commun

| | `samadigitalstudio.fr` — l'envoi | `samadigitalstudio.com` — les boîtes |
| --- | --- | --- |
| Transport | Resend → Amazon SES `eu-west-1` | LWS mutualisé (`mail.samadigitalstudio.com`) |
| DKIM | `resend._domainkey` (clé chez Resend) | sélecteur `dkim` (clé chez LWS) |
| SPF | délégué à `send.` : `include:amazonses.com ~all` | `…lws-hosting.com **-all**` |
| DMARC | `p=none` **(publié le 20/08/2026)** | `p=quarantine` |
| MX | `10 mail.samadigitalstudio.com` **(publié le 19/08/2026)** | `mail.samadigitalstudio.com` |

Un filtre anti-spam indexe la réputation sur le couple **(domaine signant `d=`,
IP émettrice)**. Entre nos deux chemins, **les deux composantes diffèrent**.

> **Chauffer des boîtes `@samadigitalstudio.com` chez LWS n'apporte rien au
> `contact@samadigitalstudio.fr` qui part par SES.** Zéro. Ce n'est pas une
> question de réglage : ce sont deux réputations distinctes.

### Et les deux « corrections » évidentes sont pires

- **Envoyer la prospection depuis le `.com`** : son SPF finit par `-all` sans
  Resend → échec SPF garanti → la quarantaine que son propre DMARC annonce.
- **Chauffer depuis LWS en `From: @…fr`** : la racine `.fr` n'a aucun SPF, et le
  seul DKIM publié appartient à Resend. On enverrait du courrier **non
  authentifié** — exactement le trafic qui abîme une réputation au lieu de la
  construire.

### Ce qui reste vrai

Le réchauffage ne se transfère à la prospection que s'il emprunte **le même
`d=`, le même pool et la même enveloppe**. Concrètement : un quatrième
connecteur, `ResendConnector`, qui envoie la chauffe **par Resend, depuis
l'adresse de prospection**, vers nos adresses témoins. Les connecteurs IMAP ne
servent plus qu'à **lire** les témoins — mesurer le placement, sortir du spam,
répondre. Le portage se réduit alors à `engine.ts` + `health.ts` +
`schedule.ts` + deux tables.

---

## 3. Deux lignes de DNS valent plus que tout le réchauffeur

`samadigitalstudio.fr` — le domaine d'où part toute la prospection — n'avait :

1. **aucun DMARC.** Depuis février 2024, Google et Yahoo l'**exigent** de tout
   expéditeur en volume.
2. **aucun MX.** Et j'avais donné ici la mauvaise raison le 19/08 : j'écrivais
   que les avis de non-remise s'y perdaient, ce qui est faux — un avis part vers
   le **Return-Path**, `send.samadigitalstudio.fr` chez SES, et Resend nous le
   renvoie par son webhook. La vraie raison était plus simple : sans MX,
   `contact@samadigitalstudio.fr` n'était la boîte de personne, et un domaine
   expéditeur incapable de recevoir est, pour une partie des filtres, la
   signature d'un domaine jetable.

### ✅ Les deux sont publiés — et ça change la couche 5b

**Vérifié le 20/08/2026**, DNS à l'appui : `dig MX samadigitalstudio.fr` rend
`10 mail.samadigitalstudio.com`, et le DMARC est en `p=none`. Matteo a créé la
boîte `contact@samadigitalstudio.fr` chez LWS le 19/08, et
`sql/20260819_reply_to_aligne_fr.sql` a aligné le `Reply-To` dessus **avec le
sous-adressage allumé** (`contact+<inscription>@`, éprouvé chez LWS le 19/08).

Conséquences, qui ne sont pas mineures :

- le `Reply-To` n'est plus sur un autre domaine que le `From` — c'était le motif
  exact de l'hameçonnage, et plusieurs filtres le comptaient contre nous ;
- **les réponses des prospects arrivent déjà dans une boîte que nous relevons
  peut-être en IMAP** : c'est ce qui rend l'option B de la couche 5b praticable
  sans toucher au DNS (voir `15-reception.md`) ;
- le §6 de ce fichier reste valable : le réchauffeur part par **Resend**, pas
  depuis cette boîte. Recevoir et chauffer sont deux choses distinctes.

Ces cinq minutes de DNS sont faites. Aucun réchauffage ne les aurait compensées.

*Vérifiable à tout moment dans le CRM : **Prospection › Délivrabilité**.*

---

## 4. Ce qui bloque, mesuré en base le 19/08/2026

- **`regulator_settings.paused = true` ET `test_mode = true`.** Rien ne peut
  partir, quoi qu'on dégèle. Les 4 seuls e-mails jamais envoyés sont des
  `scheduling` de juillet : **aucun e-mail de prospection n'est jamais parti.**
- **Le disjoncteur était dilué.** `email_logs` porte aussi WhatsApp (177 lignes,
  51 sur 24 h) et les notes (29). Son dénominateur ne les filtrait pas : le
  plancher de 20 envois était franchi sans qu'un seul e-mail existe, et un
  rebond dur sur deux vrais envois se serait lu 1,6 % au lieu de 50 %.
  **Corrigé** (`bounce-guard.ts`, filtre `channel = 'email'`, deux tests).
- **Un message WhatsApp gèle l'e-mail du même contact.** `loadSendHistory`
  alimente `contactsToday` et `lastByCompany` pour **toutes** les lignes, hors
  du test `isSequence` — avec `one_per_day_per_contact` actif, les 51 WhatsApp
  d'hier bloquent 51 e-mails aujourd'hui, et l'espacement de 45 min par
  entreprise s'applique aussi. C'est défendable comme règle d'espacement ; ce
  n'en est pas moins asymétrique, et personne ne le voit à l'écran.

---

## 5. Ce qui se porte, ce qui se réécrit

**Se porte tel quel** (modules purs) : `schedule.ts` (107 l.), `health.ts`
(134 l.), `content.ts` (120 l.), `mime.ts` (52 l.), `crypto.ts` (34 l.).
`dns-check.ts` est **déjà porté** — `src/lib/email/dns-delivrabilite.ts`, avec
trois corrections : le sélecteur `resend` manquait (faux négatif sur notre
propre domaine), SPF se lit sur le sous-domaine d'enveloppe, et un MX absent ne
bloque que pour un domaine qui doit recevoir.

**Se réécrit** : une cinquantaine de requêtes Postgres direct → PostgREST ou
RPC. Le rollup, la somme glissante 7 jours et la pénalité 14 jours ne sont pas
exprimables en PostgREST : ce sont des fonctions SQL à écrire.

**Ne se porte pas** : `engine_locks` (`pg_advisory_lock` fait mieux, sans TTL à
surveiller — et corrige au passage que `releaseLock` ne vérifie pas qui détient
le verrou) ; `oauth_states` si le pool reste en mots de passe d'application.

> **État au 19/08/2026 (soir) : le portage est terminé.** Les six phases
> tournent — planifier, envoyer, mesurer, sauver du spam, répondre, agréger —
> avec `imapflow` et `nodemailer` ajoutés au dépôt pour les quatre dernières.
> Reste à l'éprouver contre un vrai fournisseur : aucune session IMAP n'a
> encore été ouverte, et c'est le seul point qui ne se vérifie pas au clavier.

**Le danger n° 1 de la migration** : le schéma du réchauffeur n'a **aucune RLS,
aucune policy**. Dans Supabase, une table `public` sans RLS est exposée par
PostgREST — `mailboxes.secret_enc` deviendrait lisible par quiconque a la clé
publiable. La règle existe déjà en prod (`email_logs`, `automation_connections`
portent une policy `is_staff()`) : il n'y a qu'à la copier.

**Le conflit d'exécution** : le tick du CRM a `maxDuration = 60` et
`MAX_SENDS_PER_TICK = 5`. Ouvrir des dizaines de sessions IMAP/TLS n'y tient
pas. Le réchauffeur a besoin de **sa route, son cron `*/10`, son
`maxDuration = 300`, son verrou** — et il rend au régulateur un nombre
(`coldToday`), il ne lui demande pas de créneau.

---

## 6. Le principe, reformulé pour qu'il soit vrai

1. **Réputation** — la chauffe n'aide la prospection que par le même `d=`, le
   même pool, la même enveloppe. Donc : chauffe **par Resend**, témoins lus en
   IMAP.
2. **Ordonnancement** — le réchauffeur n'est pas une file du régulateur. Sa
   route, son cron, son verrou.
3. **Compteur** — la chauffe compte dans le volume total du domaine, mais elle
   **ne s'écrit pas dans `email_logs`**. J'avais écrit l'inverse ici le 19/08,
   en pensant qu'un `type` dédié suffisait ; il ne suffit pas. Le disjoncteur de
   rebonds filtre son dénominateur sur **`channel = 'email'`**, pas sur `type` :
   quarante messages de chauffe par jour y noieraient un rebond dur de
   prospection — exactement le défaut qu'on venait de corriger. La chauffe tient
   donc son propre journal (`rechauffe_messages`), et le plafond partagé se dit
   dans l'autre sens : le réchauffeur **retranche son volume** de la capacité de
   prospection qu'il rend (`capacite()` dans `sante.ts`).
