/**
 * Créer les affaires manquantes des 600 entreprises de la campagne.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Les cohortes ont été marquées le 16/08 par SQL direct, et `owner_id` posé de
 * la même façon. C'était une erreur : dans ce CRM, ce n'est pas la
 * qualification qui crée l'affaire, c'est L'ATTRIBUTION —
 * `assignProspectToAgent` (src/app/api/admin/_assign.ts:67) applique la règle
 * « une entreprise = une affaire » et ne crée une opportunité que si
 * l'entreprise n'en a strictement aucune. Poser `owner_id` en SQL court-circuite
 * exactement ce passage : 520 des 600 fiches se sont retrouvées attribuées mais
 * sans affaire, donc invisibles du pipeline marketing — et sans affaire, pas de
 * dossier lead magnet (il naît d'un trigger sur l'opportunité), donc pas de
 * site démo possible.
 *
 * Ce script rejoue le geste manquant par la vraie route. Il est SANS DANGER sur
 * les 80 fiches qui ont déjà leur affaire : `assignProspectToAgent` lit le
 * propriétaire AVANT d'écrire et ne crée rien s'il existe déjà une affaire.
 *
 * COMMENT LE JOUER
 * La route est en `role: "admin"` et n'accepte pas de clé de service : il faut
 * une vraie session. Se connecter au CRM en admin, ouvrir la console du
 * navigateur SUR LE DOMAINE DU CRM, et coller ce fichier entier.
 * La route plafonne à 200 entreprises par appel (garde-fou anti-timeout) : le
 * découpage ci-dessous le respecte.
 *
 * Rien à défaire en cas de doute : relancer le script est sans effet sur ce qui
 * est déjà passé.
 */

const AGENT_ID = "76353de0-ac50-4645-9530-8be2db55c7a3";

/** Cohorte A — site faible, sans affaire au 16/08. */
const COHORTE_A = [
  50, 98, 166, 168, 185, 187, 192, 197, 218, 230, 244, 247, 250, 251, 255, 265, 271, 274, 297, 300,
  303, 342, 348, 356, 376, 395, 410, 417, 422, 425, 427, 431, 441, 444, 445, 449, 450, 457, 458,
  459, 461, 465, 474, 479, 480, 493, 496, 504, 508, 511, 515, 523, 536, 542, 543, 554, 556, 561,
  562, 568, 573, 582, 585, 590, 603, 605, 620, 624, 648, 652, 654, 656, 659, 665, 667, 673, 676,
  679, 694, 696, 697, 698, 699, 700, 701, 708, 715, 730, 731, 774, 783, 801, 803, 816, 818, 821,
  827, 831, 874, 875, 885, 888, 889, 893, 903, 911, 912, 913, 939, 948, 962, 968, 977, 981, 985,
  988, 991, 992, 998, 999, 1006, 1019, 1043, 1047, 1048, 1057, 1063, 1068, 1076, 1084, 1089, 1091,
  1094, 1099, 1101, 1104, 1117, 1118, 1119, 1121, 1122, 1142, 1150, 1158, 1161, 1163, 1172, 1174,
  1175, 1178, 1191, 1201, 1202, 1204, 1207, 1214, 1232, 1237, 1239, 1244, 1245, 1258, 1282, 1284,
  1287, 1290, 1299, 1312, 1323, 1326, 1330, 1337, 1344, 1353, 1356, 1375, 1379, 1393, 1402, 1414,
  1423, 1426, 1448, 1451, 1465, 1468, 1497, 1510, 1511, 1541, 1553, 1584, 1596, 1602, 1617, 1621,
  1625, 1626, 1627, 1636, 1644, 1671, 1679, 1686, 1695, 1696, 1699, 1700, 1701, 1704, 1723, 1726,
  1730, 1735, 1738, 1747, 1754, 1780, 1783, 1803, 1809, 1814, 1819, 1820, 1825, 1838, 1845, 1869,
  1888, 1891, 1915, 1932, 1933, 1943, 2129, 2134, 2313,
];

/** Cohorte B — sans site utilisable, sans affaire au 16/08. */
const COHORTE_B = [
  3, 96, 108, 137, 138, 163, 199, 202, 219, 220, 224, 233, 267, 277, 283, 327, 334, 345, 399, 413,
  418, 438, 452, 455, 466, 469, 470, 482, 491, 494, 497, 512, 527, 533, 535, 541, 544, 550, 583,
  598, 602, 604, 628, 638, 644, 645, 646, 651, 695, 712, 796, 802, 834, 835, 842, 846, 858, 870,
  877, 879, 882, 884, 898, 910, 915, 931, 937, 941, 945, 952, 958, 989, 994, 997, 1017, 1020, 1022,
  1027, 1033, 1044, 1053, 1062, 1075, 1079, 1093, 1128, 1129, 1133, 1137, 1154, 1156, 1157, 1160,
  1165, 1168, 1169, 1170, 1176, 1180, 1185, 1197, 1213, 1223, 1259, 1260, 1262, 1273, 1278, 1292,
  1302, 1327, 1341, 1350, 1430, 1445, 1459, 1598, 1639, 1748, 1782, 1784, 1787, 1802, 1828, 1829,
  1842, 1847, 1851, 1918, 1981, 2056, 2097, 5397, 5404, 5413, 5421, 5432, 5567, 5580, 5595, 5612,
  5661, 5692, 5716, 5732, 5740, 5741, 5748, 5757, 5779, 5796, 5800, 5801, 5816, 5820, 5825, 5835,
  5837, 5849, 5859, 5860, 5862, 5882, 5891, 5894, 5922, 5932, 5941, 5953, 5960, 5964, 5972, 5977,
  5979, 5982, 5986, 5989, 5998, 6002, 6007, 6021, 6029, 6050, 6054, 6065, 6071, 6094, 6098, 6107,
  6117, 6118, 6120, 6121, 6122, 6128, 6132, 6140, 6144, 6147, 6152, 6161, 6188, 6204, 6207, 6208,
  6215, 6224, 6229, 6241, 6246, 6250, 6257, 6261, 6270, 6275, 6278, 6283, 6287, 6291, 6295, 6304,
  6318, 6323, 6333, 6343, 6351, 6357, 6392, 6395, 6426, 6435, 6436, 6448, 6459, 6460, 6463, 6464,
  6475, 6503, 6509, 6515, 6530, 6532, 6533, 6534, 6549, 6550, 6552, 6557, 6564, 6568, 6570, 6575,
  6581, 6584, 6586, 6596, 6598, 6606, 6609, 6619, 6629, 6630, 6657, 6659, 6663, 6666, 6673, 6693,
  6699, 6703, 6708, 6709, 6711, 6719, 6736, 6738, 6750, 6754, 6756, 6769, 6775, 6778,
];

/** Le jeton de la session en cours, tel que supabase-js le range. */
function jetonSession() {
  for (const cle of Object.keys(localStorage)) {
    if (!/^sb-.*-auth-token$/.test(cle)) continue;
    try {
      const brut = JSON.parse(localStorage.getItem(cle));
      const jeton = brut?.access_token ?? brut?.currentSession?.access_token;
      if (jeton) return jeton;
    } catch {
      /* clé d'un autre projet, on passe */
    }
  }
  throw new Error("Aucune session trouvée — se connecter au CRM, puis rejouer ici.");
}

/** 200 par appel : c'est le plafond de la route (MAX_BATCH), pas une précaution. */
function paquets(ids, taille = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += taille) out.push(ids.slice(i, i + taille));
  return out;
}

async function attribuer(nom, ids) {
  const jeton = jetonSession();
  let crees = 0;
  const echecs = [];

  for (const [i, paquet] of paquets(ids).entries()) {
    const res = await fetch("/api/admin/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ entreprise_ids: paquet, agent_id: AGENT_ID }),
    });
    const corps = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`${nom} · paquet ${i + 1} : ${res.status}`, corps);
      echecs.push(...paquet.map((id) => ({ entreprise_id: id, error: `HTTP ${res.status}` })));
      continue;
    }
    crees += corps.assigned?.length ?? 0;
    if (corps.failed?.length) echecs.push(...corps.failed);
    console.log(`${nom} · paquet ${i + 1}/${paquets(ids).length} — ${corps.assigned?.length ?? 0} attribuées`);
  }

  console.log(`${nom} : ${crees} attribuées, ${echecs.length} en échec`);
  if (echecs.length) console.table(echecs.slice(0, 20));
  return { crees, echecs };
}

await attribuer("Cohorte A", COHORTE_A);
await attribuer("Cohorte B", COHORTE_B);
console.log("Terminé. Contrôle : les 600 fiches doivent maintenant avoir une affaire.");
