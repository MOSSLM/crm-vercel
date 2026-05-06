import React from "react";
import Button from "../snippets/button";

interface HeroProps {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  cta?: { text: string; href: string };
  settings: {
    overlay: boolean;
    height: "small" | "medium" | "large";
  };
  variables: Record<string, string>;
}

const heights: Record<string, string> = {
  small: "min-h-[40vh]",
  medium: "min-h-[60vh]",
  large: "min-h-[80vh]",
};

const Hero: React.FC<HeroProps> = ({
  title,
  subtitle,
  backgroundImage,
  cta,
  settings,
  variables,
}) => {
  const resolvedTitle = resolveVars(title, variables);
  const resolvedSubtitle = subtitle ? resolveVars(subtitle, variables) : undefined;

  return (
    <section
      className={`relative flex items-center justify-center ${heights[settings.height] ?? heights.large}`}
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: backgroundImage ? undefined : "var(--color-primary)",
      }}
    >
      {settings.overlay && backgroundImage && (
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      )}

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4">
          {resolvedTitle}
        </h1>

        {resolvedSubtitle && (
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto">
            {resolvedSubtitle}
          </p>
        )}

        {cta && (
          <div className="flex gap-4 justify-center">
            <Button text={cta.text} href={cta.href} variant="outline" size="lg" />
          </div>
        )}
      </div>
    </section>
  );
};

function resolveVars(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "");
}

export default Hero;
