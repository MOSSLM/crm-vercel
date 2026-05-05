import React from "react";
import type { SiteSection } from "@/types";

// Lazy-load section components from themes
import HeroSection from "@/templates/theme-default/sections/hero";
import ServicesSection from "@/templates/theme-default/sections/services";
import AboutSection from "@/templates/theme-default/sections/about";
import TestimonialsSection from "@/templates/theme-default/sections/testimonials";
import ContactSection from "@/templates/theme-default/sections/contact";
import FaqSection from "@/templates/theme-default/sections/faq";
import CtaBannerSection from "@/templates/theme-default/sections/cta-banner";
import GallerySection from "@/templates/theme-default/sections/gallery";
import BlogSection from "@/templates/theme-default/sections/blog";
import PopupSection from "@/templates/theme-default/sections/popup";

interface SectionRendererProps {
  section: SiteSection;
  variables: Record<string, string>;
  clientOverrides?: Record<string, unknown>;
  subdomain?: string;
  blogPosts?: Array<Record<string, unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

const sectionComponents: Record<string, React.ComponentType<AnyProps>> = {
  hero: HeroSection,
  services: ServicesSection,
  about: AboutSection,
  testimonials: TestimonialsSection,
  contact: ContactSection,
  faq: FaqSection,
  "cta-banner": CtaBannerSection,
  gallery: GallerySection,
  blog: BlogSection,
  popup: PopupSection,
};

const SectionRenderer: React.FC<SectionRendererProps> = ({
  section,
  variables,
  clientOverrides,
  subdomain,
  blogPosts,
}) => {
  if (section.hidden) return null;

  const Component = sectionComponents[section.type];
  if (!Component) {
    return (
      <div className="py-8 px-6 bg-orange-50 border border-orange-200 text-orange-700 text-sm text-center">
        Section inconnue : <code>{section.type}</code>
      </div>
    );
  }

  // Merge base data with client overrides
  const mergedData = clientOverrides
    ? { ...section.data, ...clientOverrides }
    : section.data;

  // Inject blog posts for dynamic sections
  const extraProps: AnyProps = {};
  if (section.type === "blog" && blogPosts) {
    extraProps.posts = blogPosts;
    extraProps.subdomain = subdomain;
  }

  return <Component {...mergedData} {...extraProps} variables={variables} settings={mergedData.settings ?? {}} />;
};

export default SectionRenderer;
