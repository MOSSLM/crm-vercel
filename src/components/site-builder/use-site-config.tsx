"use client";

import React from "react";
import { SiteConfigContext } from "./SiteBuilderProvider";

export function useSiteConfig() {
  return React.useContext(SiteConfigContext);
}
