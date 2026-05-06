import React from "react";

interface ContactProps {
  title: string;
  subtitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  settings: { showMap: boolean; showForm: boolean };
  variables: Record<string, string>;
}

const Contact: React.FC<ContactProps> = ({
  title,
  subtitle,
  phone,
  email,
  address,
  city,
  settings,
  variables,
}) => {
  const r = (v?: string) => (v ? resolveVars(v, variables) : undefined);

  const resolvedPhone = r(phone);
  const resolvedEmail = r(email);
  const resolvedAddress = r(address);
  const resolvedCity = r(city);

  const mapQuery = [resolvedAddress, resolvedCity].filter(Boolean).join(", ");

  return (
    <section id="contact" className="py-16 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-4">{title}</h2>
          {subtitle && (
            <p className="text-lg text-[var(--color-secondary)]">{subtitle}</p>
          )}
        </div>

        <div className={`grid gap-8 ${settings.showMap ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-lg mx-auto"}`}>
          <div className="space-y-4">
            {resolvedPhone && (
              <InfoRow icon="📞" label="Téléphone">
                <a href={`tel:${resolvedPhone}`} className="text-[var(--color-primary)] hover:underline">
                  {resolvedPhone}
                </a>
              </InfoRow>
            )}
            {resolvedEmail && (
              <InfoRow icon="✉️" label="Email">
                <a href={`mailto:${resolvedEmail}`} className="text-[var(--color-primary)] hover:underline">
                  {resolvedEmail}
                </a>
              </InfoRow>
            )}
            {(resolvedAddress || resolvedCity) && (
              <InfoRow icon="📍" label="Adresse">
                <span className="text-[var(--color-secondary)]">
                  {[resolvedAddress, resolvedCity].filter(Boolean).join(", ")}
                </span>
              </InfoRow>
            )}
          </div>

          {settings.showMap && mapQuery && (
            <div className="rounded-2xl overflow-hidden shadow-lg min-h-64">
              <iframe
                title="Localisation"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: 260 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const InfoRow: React.FC<{ icon: string; label: string; children: React.ReactNode }> = ({
  icon,
  label,
  children,
}) => (
  <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100">
    <span className="text-2xl flex-shrink-0">{icon}</span>
    <div>
      <p className="text-xs font-medium text-[var(--color-secondary)] uppercase tracking-wide mb-0.5">
        {label}
      </p>
      {children}
    </div>
  </div>
);

function resolveVars(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "");
}

export default Contact;
