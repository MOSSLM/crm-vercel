import React from "react";

interface StatItem {
  label: string;
  value: string;
}

interface AboutProps {
  title: string;
  content: string;
  image?: string;
  stats?: StatItem[];
  settings: { imagePosition: "left" | "right" };
  variables: Record<string, string>;
}

const About: React.FC<AboutProps> = ({ title, content, image, stats, settings, variables }) => {
  const resolvedContent = resolveVars(content, variables);
  const resolvedImage = image ? resolveVars(image, variables) : undefined;

  const textBlock = (
    <div className="flex flex-col justify-center">
      <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-6">{title}</h2>
      <p className="text-lg text-[var(--color-secondary)] leading-relaxed mb-8">{resolvedContent}</p>
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl font-bold text-[var(--color-primary)]">
                {resolveVars(stat.value, variables)}
              </div>
              <div className="text-sm text-[var(--color-secondary)] mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const imageBlock = resolvedImage ? (
    <div className="flex items-center justify-center">
      <img
        src={resolvedImage}
        alt={title}
        className="rounded-2xl shadow-xl max-h-96 object-cover w-full"
      />
    </div>
  ) : (
    <div className="flex items-center justify-center bg-[var(--color-primary)]/5 rounded-2xl min-h-64" />
  );

  return (
    <section className="py-16 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {settings.imagePosition === "left" ? (
            <>
              {imageBlock}
              {textBlock}
            </>
          ) : (
            <>
              {textBlock}
              {imageBlock}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

function resolveVars(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "");
}

export default About;
