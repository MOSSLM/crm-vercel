/**
 * SIRET / SIREN : normalisation et validation.
 *
 * Pourquoi un module pour si peu : c'est LA clé d'entrée de toutes les données
 * publiques, et la seule erreur qui ne se voit pas. Un SIRET mal formé ne fait
 * pas échouer l'appel — l'API rend simplement « aucun résultat », ce qui est
 * indiscernable d'une entreprise réellement inconnue. Valider en amont, c'est
 * transformer un silence en message.
 *
 * Rappel du piège vérifié : l'ADEME ne matche QUE sur 14 chiffres. Passer un
 * SIREN à 9 chiffres rend 0 ligne sans erreur — mesuré à l'époque : 0 email
 * trouvé sur 22 fiches avec un SIREN, puis 9 sur 32 en corrigeant la clé.
 */

/** Ne garde que les chiffres : les saisies humaines contiennent points et espaces. */
export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/**
 * Clé de Luhn, telle que l'INSEE l'applique aux SIREN (9 chiffres) et aux
 * SIRET (14 chiffres).
 */
const luhnValid = (num: string): boolean => {
  let sum = 0;
  // On parcourt de droite à gauche : un chiffre sur deux est doublé.
  for (let i = 0; i < num.length; i += 1) {
    const fromRight = num.length - 1 - i;
    let digit = num.charCodeAt(i) - 48;
    if (fromRight % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

/**
 * La Poste échappe à la règle de Luhn : ses SIRET sont validés par une somme
 * des chiffres divisible par 5. Sans cette exception, on rejetterait des
 * établissements parfaitement réels.
 */
const LA_POSTE_SIREN = "356000000";

const laPosteValid = (siret: string): boolean => {
  let sum = 0;
  for (let i = 0; i < siret.length; i += 1) sum += siret.charCodeAt(i) - 48;
  return sum % 5 === 0;
};

/** `true` si la chaîne est un SIREN à 9 chiffres dont la clé tombe juste. */
export const isValidSiren = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const d = digitsOnly(value);
  if (d.length !== 9) return false;
  if (d === LA_POSTE_SIREN) return true;
  return luhnValid(d);
};

/** `true` si la chaîne est un SIRET à 14 chiffres dont la clé tombe juste. */
export const isValidSiret = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const d = digitsOnly(value);
  if (d.length !== 14) return false;
  if (d.startsWith(LA_POSTE_SIREN)) return laPosteValid(d);
  return luhnValid(d);
};

/**
 * Normalise vers un SIRET à 14 chiffres, ou `null`.
 *
 * Volontairement STRICT sur la longueur : on ne complète pas un SIREN par des
 * zéros pour « fabriquer » un SIRET. Le numéro d'établissement (les 5 derniers
 * chiffres) n'est pas devinable — le siège n'est pas toujours `00001` — et une
 * clé inventée interrogerait un établissement qui n'existe pas.
 */
export const normalizeSiret = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const d = digitsOnly(value);
  return d.length === 14 && isValidSiret(d) ? d : null;
};

/** Normalise vers un SIREN à 9 chiffres, ou `null`. Un SIRET est accepté : on en prend le préfixe. */
export const normalizeSiren = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const d = digitsOnly(value);
  if (d.length === 14 && isValidSiret(d)) return d.slice(0, 9);
  return d.length === 9 && isValidSiren(d) ? d : null;
};

/** Le SIREN porté par un SIRET, sans revalider. */
export const sirenOf = (siret: string): string => siret.slice(0, 9);

/** Affichage : `351 378 351 00040`. */
export const formatSiret = (siret: string): string =>
  `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
