import React from "react";

interface Review {
  author_name: string;
  review_text: string;
  rating: number;
}

interface TestimonialsProps {
  title: string;
  subtitle?: string;
  reviews: Review[];
  settings: { style: "carousel" | "grid"; showRating: boolean };
  variables: Record<string, string>;
}

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex gap-0.5" aria-label={`${rating} étoiles sur 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={n <= rating ? "text-yellow-400" : "text-gray-300"}>
        ★
      </span>
    ))}
  </div>
);

const Testimonials: React.FC<TestimonialsProps> = ({ title, subtitle, reviews, settings, variables }) => {
  const resolvedSubtitle = subtitle ? resolveVars(subtitle, variables) : undefined;

  if (!reviews || reviews.length === 0) return null;

  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-4">{title}</h2>
          {resolvedSubtitle && (
            <p className="text-lg text-[var(--color-secondary)]">{resolvedSubtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.slice(0, 6).map((review, i) => (
            <div
              key={i}
              className="bg-gray-50 rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow"
            >
              {settings.showRating && <StarRating rating={review.rating} />}
              <p className="mt-3 text-[var(--color-secondary)] leading-relaxed line-clamp-4">
                &ldquo;{review.review_text}&rdquo;
              </p>
              <p className="mt-4 font-semibold text-[var(--color-text)]">— {review.author_name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

function resolveVars(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? "");
}

export default Testimonials;
