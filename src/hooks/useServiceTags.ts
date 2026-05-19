"use client";

import React from "react";

let cachedTags: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function fetchServiceTags(): Promise<string[]> {
  if (cachedTags) return Promise.resolve(cachedTags);
  if (inflight) return inflight;
  inflight = fetch("/api/site-builder/service-tags")
    .then((r) => (r.ok ? r.json() : { tags: [] }))
    .then((data: { tags?: string[] }) => {
      cachedTags = Array.isArray(data.tags) ? data.tags : [];
      return cachedTags;
    })
    .catch(() => {
      cachedTags = [];
      return cachedTags;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Returns the sorted list of all service_tag values present on at least one
 * enterprise in the system. Used by the builder to populate the per-block
 * and per-page service_tag picker. Fetched once and cached for the session.
 */
export function useServiceTags(): string[] {
  const [tags, setTags] = React.useState<string[]>(cachedTags ?? []);
  React.useEffect(() => {
    if (cachedTags) return;
    let cancelled = false;
    fetchServiceTags().then((t) => {
      if (!cancelled) setTags(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return tags;
}
