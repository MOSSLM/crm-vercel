"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink } from "lucide-react";

export type SiteRow = {
  id: string;
  name: string | null;
  published_domain: string | null;
  published_subdomain: string | null;
  is_published: boolean;
};

function buildUrl(site: SiteRow): string | null {
  if (site.published_domain) return `https://${site.published_domain}`;
  if (site.published_subdomain) return `https://${site.published_subdomain}.samadigitalstudio.fr`;
  return null;
}

export function SiteCard({ site }: { site: SiteRow | null }) {
  if (!site) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Mon site</CardTitle>
          </div>
          <CardDescription>
            Votre site sera disponible une fois configuré par notre équipe.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const url = buildUrl(site);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{site.name ?? "Mon site"}</CardTitle>
          </div>
          {!site.is_published && (
            <span className="text-xs text-muted-foreground">En cours de configuration</span>
          )}
        </div>
        {url && site.is_published && (
          <CardDescription className="break-all">{url}</CardDescription>
        )}
      </CardHeader>
      {url && site.is_published && (
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Visiter mon site
              <ExternalLink className="ml-2 h-3 w-3" />
            </a>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
