import { jsonError } from "./respond";
import { getServiceClient } from "./service-client";

export type UserRole = "admin" | "freelance";

export type RoleResult =
  | { ok: true; role: UserRole }
  | { ok: false; response: Response };

/**
 * Looks up the caller's role in `user_profiles` and confirms it satisfies the
 * required role. Returns a ready-to-return 403 if the profile is missing or
 * the role doesn't qualify, or 500 if the lookup itself fails.
 *
 * The wrapper from `withAuth` calls this after `requireUser`; route code
 * should rarely call this directly.
 *
 * ── UN ADMIN SATISFAIT UNE EXIGENCE `freelance`, JAMAIS L'INVERSE ────────
 * L'égalité stricte d'origine disait « CE rôle et pas un autre ». Elle était
 * juste pour `admin` — un freelance ne doit jamais y passer — et fausse pour
 * `freelance` : un admin qui démarche, qui coche ses tâches ou qui ouvre sa
 * file du jour est refusé de ses propres écrans, alors qu'il a par ailleurs
 * accès à tout le CRM. Ce n'était pas une protection, c'était un trou : le
 * seul chemin restant était de se créer un second compte.
 *
 * La doctrine était DÉJÀ écrite ailleurs — `require-capability` : « Un admin
 * les a toutes, toujours » — et `require-staff` est né du même manque, avec
 * son en-tête qui nomme le défaut mot pour mot. Les deux notions restent
 * distinctes, et c'est ce qui décide du helper à employer :
 *
 *   · `requireStaff`          — les données couvrent TOUT LE PARC (tous les
 *                               prospects, tous les sites). Admin ou freelance,
 *                               peu importe : le périmètre est le même.
 *   · `role: "freelance"`     — les données sont celles DU CALLER
 *                               (`user.id`). Un admin y entre avec SON
 *                               périmètre à lui, pas celui d'un autre.
 *
 * ⚠️ CE QUI REND LE PASSAGE SÛR, et qu'il faut vérifier avant d'ajouter une
 * route : aucune route `/api/agent/*` ne lit d'identifiant d'agent dans ses
 * paramètres — toutes se cadrent sur `user.id`. Un admin qui passe cette porte
 * ne voit donc jamais que ses propres lignes. Le jour où une route accepterait
 * un `agent_id` en requête, elle exigerait `role: "admin"` et un contrôle
 * explicite, pas cette porte-ci.
 */
const satisfait = (role: UserRole, required: UserRole): boolean =>
  role === required || (required === "freelance" && role === "admin");

export const requireRole = async (
  user: { id: string },
  required: UserRole,
  extraHeaders: Record<string, string> = {},
): Promise<RoleResult> => {
  const { data, error } = await getServiceClient()
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError("profile_lookup_failed", 500, {}, extraHeaders) };
  }
  if (!data || !satisfait(data.role as UserRole, required)) {
    return { ok: false, response: jsonError("forbidden", 403, {}, extraHeaders) };
  }
  // Le rôle RÉEL, jamais celui qui était exigé : une route qui journalise le
  // caller doit pouvoir distinguer l'admin du freelance.
  return { ok: true, role: data.role as UserRole };
};
