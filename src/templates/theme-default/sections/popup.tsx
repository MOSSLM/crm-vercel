"use client";

import React from "react";
import Button from "../snippets/button";

interface PopupProps {
  show: boolean;
  title: string;
  content: string;
  cta?: { text: string; href: string };
  settings: { delay: number; showOnce: boolean };
  variables: Record<string, string>;
}

const STORAGE_KEY = "site_popup_shown";

const Popup: React.FC<PopupProps> = ({ show, title, content, cta, settings }) => {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!show) return;

    if (settings.showOnce && typeof window !== "undefined") {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
      if (settings.showOnce && typeof window !== "undefined") {
        sessionStorage.setItem(STORAGE_KEY, "1");
      }
    }, settings.delay ?? 3000);

    return () => clearTimeout(timer);
  }, [show, settings.delay, settings.showOnce]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
        <button
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl"
          onClick={() => setVisible(false)}
          aria-label="Fermer"
        >
          ✕
        </button>
        <h2 id="popup-title" className="text-2xl font-bold text-[var(--color-text)] mb-4">
          {title}
        </h2>
        <p className="text-[var(--color-secondary)] mb-6 leading-relaxed">{content}</p>
        {cta && (
          <div className="flex gap-3">
            <Button text={cta.text} href={cta.href} variant="primary" size="md" />
            <Button text="Non merci" onClick={() => setVisible(false)} variant="ghost" size="md" />
          </div>
        )}
      </div>
    </div>
  );
};

export default Popup;
