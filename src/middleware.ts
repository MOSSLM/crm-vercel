import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Subdomains that map to the CRM app (never treated as client sites)
const CRM_SUBDOMAINS = new Set(["app", "www", "admin", "crm", "api"]);

// Main app hostname (without port) — override via NEXT_PUBLIC_APP_DOMAIN env var
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "samadigitalstudio.fr";

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

  // Determine if this request is for a client subdomain
  const subdomain = extractSubdomain(hostname, APP_DOMAIN);

  if (subdomain && !CRM_SUBDOMAINS.has(subdomain)) {
    // Rewrite to (site) route group
    const url = request.nextUrl.clone();
    url.pathname = `/site/${subdomain}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

function extractSubdomain(hostname: string, appDomain: string): string | null {
  // localhost or IP — no subdomain routing
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // Custom domain (not ending with appDomain) — treat as client site with full host lookup
  if (!hostname.endsWith(appDomain)) {
    // Return a special marker; the site-resolver will look up by full domain
    return null; // handled by published_domain lookup in the route itself
  }

  // Subdomain of appDomain
  const withoutBase = hostname.slice(0, -(appDomain.length + 1)); // strip ".appDomain"
  if (!withoutBase) return null;

  return withoutBase;
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
