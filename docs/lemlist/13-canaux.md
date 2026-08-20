# Les canaux — ce qu'on a branché, et ce qui n'a personne à joindre

> Écrit le 20 août 2026. Les densités viennent de la base le jour même.

---

## 1. L'état réel, canal par canal

| Canal | État | Ce qui manque |
| --- | --- | --- |
| **E-mail** | Prêt de bout en bout — Resend, régulateur, vérificateur, disjoncteur | Rien de technique. **4 envois en tout**, tous en juillet : il faut le lancer. |
| **Appel** | File, tâches, cockpit, issues | `calls` reste à 0 : l'issue se lit dans `prospection_tasks` + `email_logs.outcome`. |
| **WhatsApp** | Prêt en manuel | Rien. C'est le bon modèle, et le SMS vient de le copier. |
| **SMS** | **Livré** (20/08) | L'envoi *par le CRM* — voir §2. |
| **LinkedIn** | Étape présente, actions non | **Personne à joindre** — voir §3. |

---

## 2. Le SMS, et pourquoi le CRM ne l'envoie pas

### Ce qui a été livré

- `sql/20260820_canal_sms.sql` — `prospection_tasks.kind` acceptait
  `call | whatsapp | linkedin | email` et rien d'autre. Une étape SMS ne pouvait
  donc pas poser de tâche : la contrainte rejetait la ligne, et **l'avancement
  de l'inscription entière échouait**, pas seulement l'étape.
- `lienSms()` dans `src/lib/prospects/canal.ts`, à côté de `lienWhatsApp`.
- L'étape dans le constructeur, l'onglet dans la file de l'agent, le bouton dans
  les deux surfaces de tâche, l'icône et la couleur partout.
- Le compteur de l'éditeur, qui dit les **segments** et le caractère coupable.

### La décision : manuel, comme WhatsApp

Pour WhatsApp c'est une contrainte — `wa.me` n'a pas d'API d'envoi. Pour le SMS,
non : l'adaptateur Zadarma porte bien un `sendSms`. Mais :

- **`sms_messages` compte zéro ligne.** Il n'a jamais envoyé un message.
- **Le code porte encore un `CONFIRM: param names against live spec`.**

Brancher un envoi **payant** et jamais éprouvé dans une boucle automatique, c'est
découvrir que les paramètres étaient faux deux cents SMS plus tard. Le lien
`sms:` ouvre l'application du téléphone avec le texte déjà écrit : gratuit,
immédiat, vérifiable à la main.

Le jour où l'envoi par le CRM sera éprouvé contre le vrai fournisseur, il
s'ajoutera comme un **mode** de cette même étape. Rien de ce qui a été écrit
n'aura besoin de bouger.

### Le détail qui coûte de l'argent

`{% raw %}?&body={% endraw %}` n'est pas une faute de frappe : iOS attend
`&body=` dès qu'un paramètre précède, Android `?body=`. `?&body=` est la seule
écriture que **les deux** acceptent.

Et surtout — le SMS se facture **par segment**, 160 caractères en alphabet GSM,
**70** dès qu'un seul caractère en sort. Ce qui en sort, chez nous :

- `ê â î ô û ë ï` — aucun circonflexe ni tréma sur a/e/i/o/u ;
- **`ç` minuscule** : la table GSM porte `Ç` (0x09) et lui seul ;
- **l'apostrophe typographique `’`**, que tout le CRM écrit.

En revanche `é è à ù ì ò É Ä Ö Ü` **passent** — c'est contre-intuitif et c'est
pour ça que le compteur nomme le caractère coupable plutôt que d'afficher un
nombre de SMS. « Votre message coûte 3 SMS » ne dit pas quoi corriger ;
« l'apostrophe ’ fait tomber le segment à 70 » le dit.

---

## 3. LinkedIn — la mesure, puis la conséquence

Le plan portait deux avertissements. Le second disait : *« Aucune de nos 905
entreprises attribuées n'a de `linkedin_url` »*. Relevé le 20/08, sur le parc
entier :

| Mesure | Valeur |
| --- | --- |
| Entreprises dans la base | 60 447 |
| … avec une `linkedin_url` | **0** |
| Contacts | 374 |
| … avec une `linkedin_url` | **6** |

Zéro entreprise. Six contacts.

Ce que la couche 2 bis demandait pour LinkedIn : six actions, un pilotage de
navigateur avec profil dédié, délais humains et plafonds (l'architecture de
`moteur-playwright.mjs`), plus la condition « invitation acceptée ». C'est le
plus gros bloc du plan — **11 points sur 100** — et il servirait **six contacts**,
sur un fichier où l'e-mail en touche 478 et le téléphone 863.

**Rien n'est donc construit côté automatisation LinkedIn.** L'étape existe
toujours dans le constructeur — elle pose une tâche manuelle, et son compteur
connaît enfin la vraie limite de 200 caractères. Ce qui reste à faire n'est pas
du code, c'est **de la donnée** : il faut des profils avant d'avoir des actions.

C'est la troisième correction au plan par la mesure, et elle a la même forme que
les deux précédentes (`a_ouvert` en couche 2, les images en couche 4 bis) : **le
préalable manque, et il ne se rattrape pas en écrivant du code.**

---

## 4. La couleur du SMS

La palette du CRM impose des teintes distinctes à l'œil sur un même écran. Les
hues déjà prises : sarcelle 187° (e-mail), vert 155° (WhatsApp), bleu 209°
(LinkedIn), ambre 40° (appel), violet 256° (groupe séquence), magenta 325°
(attente), rouge (danger).

Le SMS prend **l'olive `#77851C`, 78°** — la seule teinte vraiment libre. À 78°
contre 155°, il ne se confond pas avec le vert de WhatsApp, ce qui compte
puisque ce sont les deux canaux de message et qu'ils cohabitent dans la même
file.
