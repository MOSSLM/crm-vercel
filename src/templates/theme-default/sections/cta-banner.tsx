import React from "react";
import Button from "../snippets/button";

interface CtaBannerProps {
  title: string;
  subtitle?: string;
  cta: { text: string; href: string };
  settings: { style: "gradient" | "solid" | "outline" };
  variables: Record<string, string>;
}

const CtaBanner: React.FC<CtaBannerProps> = ({ title, subtitle, cta, settings }) => {
  const bgClass =
    settings.style === "gradient"
      ? "bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"
      : settings.style === "outline"
      ? "bg-white border-2 border-[var(--color-primary)]"
      : "bg-[var(--color-primary)]";

  const textClass = settings.style === "outline" ? "text-[var(--color-primary)]" : "text-white";

  return (
    <section className={`py-16 px-6 ${bgClass}`}>
      <div className="max-w-4xl mx-auto text-center">
        <h2 className={`text-3xl md:text-4xl font-bold mb-4 ${textClass}`}>{title}</h2>
        {subtitle && (
          <p className={`text-xl mb-8 opacity-90 ${textClass}`}>{subtitle}</p>
        )}
        <Button
          text={cta.text}
          href={cta.href}
          variant={settings.style === "outline" ? "primary" : "outline"}
          size="lg"
        />
      </div>
    </section>
  );
};

export default CtaBanner;
