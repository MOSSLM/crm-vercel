/**
 * `POST /api/media/from-url` — aspirer une image distante dans la médiathèque.
 *
 * Le pendant de `POST /api/media` pour ce qui n'est pas un fichier posé sur le
 * bureau mais une adresse : un logo trouvé sur le site d'un client, une URL
 * collée dans le champ logo. La règle est la même des deux côtés — ce qui
 * s'affiche dans nos démos est servi par nous, jamais par un site tiers qui
 * peut changer du jour au lendemain.
 */

import { json, jsonError } from "@/app/api/_lib/respond";
import { mediaFromUrlSchema, type MediaFromUrlPayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { rehostRemoteImage } from "@/lib/images/rehost-remote-image";

export const dynamic = "force-dynamic";

export const POST = withAuth<MediaFromUrlPayload>(
  { body: mediaFromUrlSchema },
  async ({ body, cors }) => {
    const supabase = getServiceClient();

    const result = await rehostRemoteImage(supabase, body.url, {
      entrepriseId: body.entreprise_id ?? null,
      imageType: body.image_type,
      tags: body.tags,
      altText: body.alt_text,
      fileName: body.file_name,
    });

    if (!result.ok) {
      // 422 et non 500 : l'URL est en cause, pas le serveur. Le client peut
      // afficher le motif tel quel.
      return jsonError(result.error, 422, {}, cors);
    }

    return json(
      {
        public_url: result.publicUrl,
        storage_path: result.storagePath,
        size_bytes: result.bytes,
        already_hosted: result.alreadyHosted,
      },
      { headers: cors },
    );
  },
);
