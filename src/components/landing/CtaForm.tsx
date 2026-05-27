"use client";

export default function CtaForm() {
  return (
    <form
      className="cta-form"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="cta-input-row">
        <input className="cta-input" type="text" placeholder="Votre prénom" />
        <input className="cta-input" type="text" placeholder="Votre activité" />
      </div>
      <input className="cta-input" type="email" placeholder="Votre email professionnel" />
      <input className="cta-input" type="tel" placeholder="Votre téléphone (optionnel)" />
      <button className="cta-submit" type="submit">
        Demander l&apos;audit gratuit →
      </button>
      <div className="cta-note">Réponse sous 24h · Aucune obligation</div>
    </form>
  );
}
