import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * La bibliothèque de modèles, pour les puces de la carte message.
 *
 * L'étape de séquence apporte SON modèle, déjà rendu par le moteur et
 * transporté dans la tâche. Ces modèles-ci sont l'à-côté : de quoi écrire autre
 * chose que ce que l'étape prévoyait (relance hors séquence, rappel de RDV…)
 * sans quitter l'écran.
 *
 * Les corps partent tels quels, avec leurs `{{variables}}` : c'est le
 * navigateur qui les remplace avec les données du prospect affiché, comme le
 * fait déjà l'aperçu du builder d'automatisations.
 */
export const GET = withAuth({ role: "freelance" }, async ({ cors }) => {
  const sc = getServiceClient();

  const [wa, mail] = await Promise.all([
    sc.from("whatsapp_templates").select("id, name, body").order("name"),
    sc.from("email_templates").select("id, name, subject, body").order("name"),
  ]);

  // Une table absente (migration non appliquée) ne doit pas casser l'écran :
  // on renvoie ce qu'on a. Une vraie erreur SQL, elle, remonte.
  if (wa.error && wa.error.code !== "42P01") return jsonError(wa.error.message, 500, {}, cors);
  if (mail.error && mail.error.code !== "42P01") return jsonError(mail.error.message, 500, {}, cors);

  return json(
    { whatsapp: wa.data ?? [], email: mail.data ?? [] },
    { headers: cors },
  );
});
