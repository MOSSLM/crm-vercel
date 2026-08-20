# Dossier lemlist

Ce que fait lemlist, pourquoi ça marche, et ce qu'on en reprend pour refaire notre
prospection. Relevé les 18 et 19 août 2026 ; les mesures de notre base datent du
19 août et sont à refaire, pas à recopier.

| Fichier | Ce qu'on y trouve |
| --- | --- |
| [`00-essence.md`](00-essence.md) | **Commencer ici.** Les huit principes qui font leur force, et ce que chacun exige de nous. |
| [`01-notes-brutes.md`](01-notes-brutes.md) | La capture page par page, verbatim, non triée. La matière première. |
| [`02-fonctionnalites.md`](02-fonctionnalites.md) | L'inventaire complet par domaine, et ce qu'on ne construira pas. |
| [`03-architecture.md`](03-architecture.md) | Leurs douze sections face aux nôtres, et l'arborescence de l'espace Prospection. |
| [`04-modele-de-donnees.md`](04-modele-de-donnees.md) | Campagne, Étape, Condition ×13, Statut de lead ×16, Tâche, Conversation, Rapport. |
| [`05-sequences-et-modeles.md`](05-sequences-et-modeles.md) | Leurs modèles étape par étape, et le catalogue rangé selon notre parc. |
| [`06-design.md`](06-design.md) | Palette, typographie, formes, grammaire d'écran, et le portage. |
| [`07-notre-mapping.md`](07-notre-mapping.md) | Où vont nos 905 prospects déjà attribués. |
| [`08-rechauffeur.md`](08-rechauffeur.md) | Notre lemwarm : pourquoi la chauffe passe par Resend, et ce que le DNS impose. |
| [`09-taches-en-tableau.md`](09-taches-en-tableau.md) | La file en tableau, les vues sauvegardées, et pourquoi « Terminer » n'est pas un geste de masse. |
| [`10-conversation.md`](10-conversation.md) | Le fil par lead — et la colonne d'auteur qui n'a jamais existé. |
| [`11-conditions.md`](11-conditions.md) | La fourche qui répond **trois** choses, et le code de tranche INSEE qui aurait faussé un quart du fichier. |
| [`12-editeur.md`](12-editeur.md) | Un éditeur, sept canaux : replis, texte conditionnel, et pourquoi les images du plan n'existent pas. |
| [`13-canaux.md`](13-canaux.md) | Le SMS livré en manuel, le caractère qui triple la facture, et les 0 profils LinkedIn du parc. |

## Les trois choses à retenir si on ne lit rien d'autre

1. **La campagne est l'unité de travail** — séquence + liste + lancement + rapport en
   un seul objet. Notre `automations` porte déjà tout sauf la liste. C'est le seul
   manque structurel, et tout le reste en découle.
2. **La condition remplace le calendrier**, et **chaque branche finit explicitement**.
   Nos six séquences font cinq à sept étapes et s'arrêtent sur un appel : c'est là
   qu'est le flou, pas dans le pipeline commercial.
3. **Une attente sans limite doit se voir.** Chez lemlist, *Wait until* apparaît dans la
   liste des leads. Chez nous, 59 inscriptions dorment dans un cul-de-sac que rien
   n'affiche.
