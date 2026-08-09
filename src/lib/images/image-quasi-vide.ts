import "server-only";
import sharp from "sharp";

/**
 * Une image est-elle si uniforme qu'elle ne montre rien ?
 *
 * DERNIER FILET AVANT LA CARTE DE PARTAGE. Les services de capture rendent une
 * image dans plusieurs cas où il n'y a rien à voir :
 *   - thum.io renvoie son écran d'attente (fond blanc + roue + logo) tant que la
 *     capture n'est pas prête ;
 *   - un site lent est photographié avant d'avoir peint quoi que ce soit ;
 *   - une page d'erreur, un mur anti-robot, une redirection vers du vide.
 *
 * Dans tous ces cas la réponse est une vraie image, de bonne taille, en HTTP 200
 * — donc aucun contrôle réseau ne l'attrape. Seul le CONTENU la trahit.
 *
 * Mieux vaut alors la refuser : la carte se rend dans sa variante centrée, qui
 * est présentable, plutôt qu'avec un rectangle blanc au milieu qui donne au
 * prospect l'impression que son site est cassé.
 *
 * La mesure est l'écart-type par canal, sur une miniature. Une page réelle,
 * même très sobre, mélange du texte, des aplats et au moins une image : son
 * écart-type dépasse largement le seuil. Un écran d'attente reste très en
 * dessous. On travaille sur une miniature parce que la statistique ne demande
 * pas la pleine résolution et que ça évite de déplier 1 Mo pour rien.
 */

/**
 * Seuil MESURÉ, pas choisi au jugé.
 *
 * Écart-type maximal par canal, sur une miniature de 200 px de large :
 *
 *   page entièrement blanche .................................  0
 *   écran d'attente thum.io (roue + logo sur blanc) .......... 36
 *   site très sobre (bandeau, trois lignes, un bouton) ....... 96
 *   site avec une image de héros ............................. 76
 *
 * L'écart est franc — du simple au double — et 50 se pose au milieu, un peu
 * plus près du bas pour rester tolérant avec les sites épurés.
 *
 * SENS DE L'ARBITRAGE : c'est le faux NÉGATIF qui coûte cher. Laisser passer un
 * écran d'attente met un rectangle blanc au milieu d'un beau cadre navigateur,
 * et le prospect en conclut que le site qu'on lui propose ne s'affiche pas —
 * c'est exactement le défaut constaté sur la première carte envoyée en vrai.
 * Rejeter à tort une capture valide ne coûte que le mockup : la carte se rend
 * dans sa variante centrée, qui est présentable.
 */
const SEUIL_ECART_TYPE = 50;

export async function imageQuasiVide(bytes: ArrayBuffer | Uint8Array): Promise<boolean> {
  try {
    const buf = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const miniature = await sharp(buf)
      .resize({ width: 200, withoutEnlargement: true })
      // Aplatir sur blanc : une PNG transparente donnerait un écart-type nul sur
      // le canal alpha et fausserait la mesure dans les deux sens.
      .flatten({ background: "#ffffff" })
      .toBuffer();

    const stats = await sharp(miniature).stats();
    const ecartMax = Math.max(...stats.channels.map((c) => c.stdev));
    return ecartMax < SEUIL_ECART_TYPE;
  } catch {
    // Illisible n'est pas vide : on laisse l'appelant décider sur d'autres
    // critères plutôt que de jeter une capture peut-être bonne.
    return false;
  }
}
