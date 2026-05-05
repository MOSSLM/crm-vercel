"use client";

import React from "react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqProps {
  title: string;
  items: FaqItem[];
  settings: Record<string, unknown>;
  variables: Record<string, string>;
}

const Faq: React.FC<FaqProps> = ({ title, items }) => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] text-center mb-12">
          {title}
        </h2>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                className="w-full text-left flex justify-between items-center px-6 py-4 font-medium text-[var(--color-text)] hover:bg-gray-50 transition-colors"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                aria-expanded={openIndex === i}
              >
                <span>{item.question}</span>
                <span
                  className={`flex-shrink-0 ml-4 text-[var(--color-primary)] transition-transform duration-200 ${openIndex === i ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 py-4 bg-gray-50 text-[var(--color-secondary)] leading-relaxed border-t border-gray-200">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faq;
