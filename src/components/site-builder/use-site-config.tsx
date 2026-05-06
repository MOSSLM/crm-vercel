"use client";

import React from "react";
import { SiteConfigContext } from "./SiteConfigProvider";

export function useSiteConfig() {
  return React.useContext(SiteConfigContext);
}
