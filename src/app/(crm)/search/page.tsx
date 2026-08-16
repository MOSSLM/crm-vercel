import { redirect } from 'next/navigation';

/**
 * `/search` n'est pas un écran : c'est l'ancien doublon de `/search/new`.
 *
 * Trois routes rendaient `NewSearchPage` : `/recherche-entreprise` (l'unique
 * implémentation), `/search/new` (qui la ré-exporte) et celle-ci, qui en était
 * une copie manuelle — à un détail près, et c'est tout le problème : elle avait
 * été écrite avant `SectionTabsNav` et ne l'a jamais reçue. La page s'affichait
 * donc sans le bandeau d'onglets de la section, ce qui la fait passer pour une
 * page cassée alors que son contenu est le bon.
 *
 * Aucun lien de l'application n'y menait — la navigation, le hub, la palette de
 * commandes et les onglets pointent tous `/search/new`. Ne restaient que les
 * favoris et l'historique, d'où une redirection plutôt qu'une suppression : un
 * 404 punirait précisément les rares personnes qui avaient gardé l'adresse.
 *
 * Redirection TEMPORAIRE volontairement (307, pas 308) : un permanent se grave
 * dans le cache du navigateur et survivrait à toute décision contraire, sur une
 * route interne où ça ne s'impose pas.
 */
export default function SearchPage() {
  redirect('/search/new');
}
