import React from "react";

interface ServiceItem {
  title: string;
  description: string;
  icon?: string;
  image?: string;
}

interface ServicesProps {
  title: string;
  subtitle?: string;
  items: ServiceItem[];
  settings: {
    columns: 2 | 3 | 4;
    style: "cards" | "list" | "minimal";
  };
  variables: Record<string, string>;
}

const colClasses: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

const Services: React.FC<ServicesProps> = ({ title, subtitle, items, settings }) => {
  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-4">{title}</h2>
          {subtitle && (
            <p className="text-lg text-[var(--color-secondary)] max-w-2xl mx-auto">{subtitle}</p>
          )}
        </div>

        <div className={`grid gap-8 ${colClasses[settings.columns] ?? colClasses[3]}`}>
          {items.map((item, i) => (
            <ServiceCard key={i} item={item} style={settings.style} />
          ))}
        </div>
      </div>
    </section>
  );
};

const ServiceCard: React.FC<{ item: ServiceItem; style: ServicesProps["settings"]["style"] }> = ({
  item,
  style,
}) => {
  if (style === "list") {
    return (
      <div className="flex gap-4 items-start">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
          <span className="text-[var(--color-primary)] text-xl">✓</span>
        </div>
        <div>
          <h3 className="font-semibold text-lg text-[var(--color-text)] mb-1">{item.title}</h3>
          <p className="text-[var(--color-secondary)]">{item.description}</p>
        </div>
      </div>
    );
  }

  if (style === "minimal") {
    return (
      <div className="text-center">
        <h3 className="font-semibold text-xl text-[var(--color-text)] mb-2">{item.title}</h3>
        <p className="text-[var(--color-secondary)]">{item.description}</p>
      </div>
    );
  }

  // cards (default)
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-shadow duration-300">
      {item.image ? (
        <img src={item.image} alt={item.title} className="w-12 h-12 object-cover rounded-lg mb-4" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center mb-4">
          <span className="text-[var(--color-primary)] text-2xl">⚙</span>
        </div>
      )}
      <h3 className="font-semibold text-xl text-[var(--color-text)] mb-2">{item.title}</h3>
      <p className="text-[var(--color-secondary)] leading-relaxed">{item.description}</p>
    </div>
  );
};

export default Services;
