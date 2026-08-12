import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { deciderDestination } from "@/lib/site-domain";

/**
 * Aiguillage par hôte.
 *
 * Toute la décision vit dans `deciderDestination` (src/lib/site-domain.ts), qui
 * est pure et testée : ce fichier ne fait plus que la traduire en réponse Next.
 * La raison est concrète — aucun test du dépôt n'importe `next/server`, donc la
 * table hôte × chemin ne pouvait pas être figée ici.
 *
 * Rappel de la contrainte qui gouverne le design : ce code tourne sur l'edge, à
 * chaque requête de chaque hôte, y compris des hôtes qui ne sont pas les nôtres.
 * Il ne consulte jamais la base. Un domaine client est réécrit À L'AVEUGLE vers
 * /site/{host} et c'est la route qui tranche en résolvant `published_domain`.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const destination = deciderDestination(request.headers.get("host"), pathname);

  switch (destination.kind) {
    case "next":
      return NextResponse.next();

    case "redirect":
      return NextResponse.redirect(destination.to, 308);

    case "public": {
      const url = request.nextUrl.clone();
      url.pathname = `${destination.path}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }

    case "preview":
    case "site": {
      const url = request.nextUrl.clone();
      const suffix = pathname === "/" ? "" : pathname;
      const racine = destination.kind === "preview" ? "/preview" : "/site";
      url.pathname = `${racine}/${destination.segment}${suffix}`;
      return NextResponse.rewrite(url);
    }
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
