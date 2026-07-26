import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPreviewSubdomain } from "@/lib/site-builder/preview-url";
import { CRM_SUBDOMAINS, SITE_DOMAIN, extractSubdomain } from "@/lib/site-domain";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]; // strip port for local dev
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/portail") ||
    pathname.includes(".") // static assets
  ) {
    return NextResponse.next();
  }

  // Determine if this request is for a client subdomain. A custom domain (one
  // that isn't under SITE_DOMAIN) yields null and is handled by the
  // published_domain lookup in the route itself.
  const subdomain = extractSubdomain(hostname, SITE_DOMAIN);

  if (subdomain && !CRM_SUBDOMAINS.has(subdomain)) {
    const url = request.nextUrl.clone();
    const suffix = pathname === "/" ? "" : pathname;
    // A UUID-shaped subdomain is an unguessable draft/template preview → render
    // the live (unpublished) draft. Everything else is a published site.
    url.pathname = isPreviewSubdomain(subdomain)
      ? `/preview/${subdomain}${suffix}`
      : `/site/${subdomain}${suffix}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
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
