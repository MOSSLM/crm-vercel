/**
 * Numéro au format que wa.me exige : international, chiffres uniquement.
 *
 * LE PIÈGE : les fiches du CRM portent des numéros FRANÇAIS — « 06 12 34 56 78 ».
 * Se contenter de retirer les caractères non numériques donne `0612345678`, que
 * wa.me interprète comme un indicatif pays inexistant et refuse en ouvrant une
 * page d'erreur. Le bouton a donc l'air de fonctionner et ne mène nulle part.
 *
 * Cette fonction vivait dans `PartagerDemoDialog`, en privé. Le panneau lead
 * magnets du cockpit en avait besoin à son tour : plutôt qu'une troisième
 * variante du même nettoyage (`WhatsAppTab` a déjà la sienne), elle devient un
 * module. Même geste que pour `demoShareUrl`.
 */
export function versFormatInternational(brut: string | null | undefined): string | null {
  let n = (brut ?? "").replace(/[\s.\-()]/g, "");
  if (!n) return null;
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("0")) n = `+33${n.slice(1)}`;
  if (!n.startsWith("+")) n = `+${n}`;
  const chiffres = n.slice(1).replace(/\D/g, "");
  // Un indicatif plus un numéro national tiennent entre 8 et 15 chiffres (E.164).
  return chiffres.length >= 8 && chiffres.length <= 15 ? chiffres : null;
}

/** L'URL wa.me prête à ouvrir, ou null si le numéro est inutilisable. */
export function lienWhatsApp(telephone: string | null | undefined, message: string): string | null {
  const numero = versFormatInternational(telephone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(message)}` : null;
}
