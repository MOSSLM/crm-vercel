"use client";

import React from "react";

interface GalleryProps {
  title: string;
  images: Array<{ src: string; alt?: string }>;
  settings: { columns: 2 | 3 | 4; lightbox: boolean };
  variables: Record<string, string>;
}

const colClasses: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

const Gallery: React.FC<GalleryProps> = ({ title, images, settings }) => {
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <section className="py-16 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] text-center mb-12">
          {title}
        </h2>
        <div className={`grid gap-4 ${colClasses[settings.columns] ?? colClasses[3]}`}>
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              className="block overflow-hidden rounded-xl aspect-square cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              onClick={() => settings.lightbox && setLightboxSrc(img.src)}
            >
              <img
                src={img.src}
                alt={img.alt ?? `Image ${i + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </button>
          ))}
        </div>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image en plein écran"
        >
          <img
            src={lightboxSrc}
            alt="Plein écran"
            className="max-h-[90vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300"
            onClick={() => setLightboxSrc(null)}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
};

export default Gallery;
