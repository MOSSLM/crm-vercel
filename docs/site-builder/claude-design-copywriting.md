# Règles Claude Design — Copywriting

> **Fichier à fournir à Claude au moment de générer un design de site**, en
> complément de `claude-design-variables.md` (placeholders et variables).
> Le site est un **template unique pour tous les pros de l'habitat** :
> climatisation seule, clim + chauffage + plomberie, plombier pur, etc.
> Le même texte sera lu tel quel par les visiteurs de dizaines d'entreprises
> différentes. Chaque phrase doit donc être vraie pour TOUTES.

---

## 1. Services : JAMAIS en dur dans les phrases

C'est la règle la plus importante. Les entreprises n'ont pas les mêmes
services : le builder affiche/masque les blocs selon les tags de services de
chaque entreprise (`data-service-tag`), mais il ne réécrit pas les phrases.
Un service nommé dans une phrase générique sera donc affiché à tort chez une
entreprise qui ne le propose pas.

**Interdit dans le hero, l'à-propos, le footer, les CTA et tout texte
générique :**

- ❌ « Votre spécialiste de la **climatisation** à [Ville] »
- ❌ « **Chauffage, plomberie et climatisation** : nous faisons tout »
- ❌ « Votre **chauffagiste** de confiance »
- ❌ « Installation de **pompes à chaleur** partout dans le [Département] »

**À la place, des formulations métier-neutres :**

- ✅ « [Nom de l'entreprise], votre expert local de l'habitat à [Ville] »
- ✅ « Des interventions soignées pour votre confort au quotidien »
- ✅ « Installation, entretien et dépannage de vos équipements »
- ✅ « Un savoir-faire local au service de votre logement »

Vocabulaire générique utile : *votre confort, vos équipements, vos travaux,
votre installation, votre projet, votre logement, nos interventions,
installation / entretien / dépannage*.

### La seule exception : les blocs par service

Dans les sections qui présentent les services **un par un** — cards « Nos
services », pages `service-<tag>.html`, liens de navigation vers ces pages —
sois au contraire **précis et riche** : nomme le service, ses bénéfices, son
vocabulaire technique. Chaque bloc porte son `data-service-tag`, donc il ne
s'affiche que chez les entreprises concernées.

```html
<!-- OK : bloc taggé, texte spécifique au service -->
<div class="service-card" data-service-tag="climatisation">
  <h3>Climatisation</h3>
  <p>Installation et entretien de systèmes de climatisation réversible…</p>
</div>
```

Test rapide : *si ce texte reste affiché chez un plombier pur, est-il encore
vrai ?* Si non → soit le neutraliser, soit le tagger.

---

## 2. Taille de l'entreprise : rester neutre

Le template sert des entreprises de toutes tailles (solo, TPE, PME). Aucune
affirmation sur la taille, la structure ou l'histoire de l'entreprise.

**Interdit :**

- ❌ « Entreprise **familiale** », « de père en fils »
- ❌ « **Petite** entreprise », « artisan **indépendant** », « à **taille humaine** »
- ❌ « Notre **équipe de X techniciens** », « nos **agences** »
- ❌ Toute allusion au fait d'être seul, deux, ou nombreux

**Autorisé et encouragé — l'angle, c'est le LOCAL :**

- ✅ « Entreprise **locale** », « votre professionnel **de proximité** »
- ✅ « Nous intervenons à [Ville] et dans ses environs »
- ✅ « Basés à [Ville], nous nous déplaçons à [Zones desservies] »
- ✅ « Un interlocuteur local qui connaît votre secteur »

Formulations neutres pour parler de soi : *nous, notre entreprise,
[Nom de l'entreprise]*. Éviter « notre équipe » (présume plusieurs personnes)
comme « je » (présume un solo).

---

## 3. Ne jamais inventer de faits

Toute affirmation vérifiable doit venir d'une **variable** ou disparaître.

| Sujet | Règle |
|---|---|
| Années d'expérience | Jamais de chiffre en dur (« depuis 20 ans », « depuis 1998 »). Utiliser `{{ entreprise.annee_experience }}` dans un bloc qui supporte d'être vide, sinon « une solide expérience du terrain ». |
| Nombre de clients / chantiers | Jamais en dur. `{{ entreprise.clients_count }}` (conditionnelle) ou rien. |
| Note et avis Google | Uniquement `{{ entreprise.note_moyenne }}` et `{{ entreprise.nombre_avis }}`. Jamais « 4,9/5 » en dur. |
| Certifications & labels (RGE, QualiPAC, Qualibat, garantie décennale…) | Ne jamais les affirmer en générique : toutes les entreprises ne les ont pas. Soit un bloc taggé/conditionnel, soit rien. L'attestation fluides a sa variable (`[ACO]`). |
| Aides & subventions (MaPrimeRénov', CEE, TVA réduite…) | Ne jamais promettre une aide ni une éligibilité (souvent conditionnées à des certifications). Au plus : « des aides peuvent exister selon votre projet — parlons-en ». |
| Prix | Aucun prix, aucun « à partir de X € ». « **Devis gratuit** » est OK (universel chez ces pros). |
| Délais & disponibilité | Pas d'engagement chiffré en dur : « 24h/24 », « 7j/7 », « en 30 minutes », « devis sous 24h ». Préférer « intervention rapide », « réponse dans les meilleurs délais ». |
| Marques (Daikin, Atlantic, Mitsubishi…) | Aucun nom de marque dans le texte générique. « Nous travaillons avec du matériel de grandes marques » est OK. |
| Récompenses & classements | Jamais : « n°1 », « leader », « élu meilleur… », « le plus… de la région ». |
| Économies d'énergie | Pas de promesse chiffrée (« divisez votre facture par 2 »). « Réduire vos consommations » / « améliorer votre confort énergétique » : OK. |

---

## 4. Fondateur, équipe, personnes

- Le prénom du fondateur existe en variable conditionnelle (`[Prénom]`), mais
  ne construis **pas** une section entière autour d'une personne (« Jean, votre
  plombier depuis 1990 ») : la variable peut être vide et le métier varie.
  Usage sûr : une ligne isolée du type « Une entreprise fondée par [Prénom] »
  dans l'à-propos, jamais dans le hero.
- Pas de genre présumé (« votre artisan et **sa** femme »), pas de biographie
  inventée, pas de citation attribuée au dirigeant.
- Témoignages clients : réalistes et plausibles (prénom + initiale), sans
  mention d'un service précis non taggé, sans détails invérifiables
  (« il est venu un dimanche à 3h du matin »).

---

## 5. Ton et style

- **Vouvoiement**, toujours.
- Phrases courtes, concrètes, orientées bénéfices client : confort,
  tranquillité, fiabilité, propreté du chantier, respect des délais, conseil.
- Pas de jargon technique dans les sections génériques (garde-le pour les
  pages services, où il est pertinent et taggé).
- Pas de superlatifs vides (« excellence absolue », « qualité inégalée ») ni
  d'emphase artificielle. Le registre : pro, direct, rassurant.
- CTA orientés action : « Demander un devis gratuit », « Appelez-nous »,
  « Décrivez-nous votre projet ». Pas de CTA vagues (« Cliquez ici »).
- SEO local naturel : placer [Ville], [Département], [Zones desservies] dans
  les titres et paragraphes, sans bourrage (une occurrence par section suffit).
- Jamais de comparaison dénigrante avec « les autres entreprises » ou les
  grandes enseignes.

---

## 6. Arguments universels autorisés

Une base saine pour remplir les sections génériques — vrai pour tout pro de
l'habitat, quelle que soit sa taille :

- Proximité et ancrage local (connaissance du secteur, déplacement rapide)
- Devis gratuit et sans engagement
- Travail soigné, chantier propre, matériel de qualité
- Conseil honnête et transparent avant travaux
- Interlocuteur unique du devis à la fin du chantier
- Respect des délais annoncés
- Note Google réelle : « {{ entreprise.note_moyenne }}/5 sur
  {{ entreprise.nombre_avis }} avis »

---

## 7. Checklist copywriting avant export

- [ ] Aucun métier ni service nommé hors des blocs `data-service-tag` et des
      pages services.
- [ ] Chaque phrase générique reste vraie pour un plombier solo COMME pour une
      PME de clim-chauffage.
- [ ] Aucune mention de taille, famille, équipe, indépendance.
- [ ] Aucun chiffre en dur (années, clients, note, prix, délais) — variables
      uniquement.
- [ ] Aucune certification, marque, aide d'État ou récompense affirmée en
      générique.
- [ ] L'angle « local » est présent (hero, à-propos, footer) via [Ville],
      [Département], [Zones desservies].
- [ ] Vouvoiement partout, CTA orientés action, zéro superlatif vide.
