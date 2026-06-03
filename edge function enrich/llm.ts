// =====================================================================
// Extraction structurée via OpenAI GPT-4o
// =====================================================================
// On utilise le mode "Structured Outputs" avec json_schema strict
// pour garantir que la réponse est un JSON parsable valide.
// Doc: https://platform.openai.com/docs/guides/structured-outputs
// =====================================================================

import type { LLMExtraction, GooglePlaceData } from "./types.ts";
import { SERVICE_TAGS_TAXONOMY } from "./types.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-2024-08-06"; // version qui supporte strict json_schema

// JSON Schema strict décrivant la sortie attendue
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "services_tags",
    "company_name_clean",
    "email",
    "logo_url",
    "address_clean",
    "years_experience",
    "rge_count",
    "satisfied_clients_from_site",
    "installations_from_site",
    "closest_big_city",
    "surrounding_cities",
    "site_accessible",
    "site_accessible_reason",
  ],
  properties: {
    services_tags: {
      type: "array",
      items: { type: "string" },
      description: `Services proposés par l'entreprise, extraits UNIQUEMENT du site web (pas de Google). Utilise EXCLUSIVEMENT les tags de la taxonomie suivante: ${SERVICE_TAGS_TAXONOMY.join(", ")}. Si un service mentionné sur le site ne rentre dans AUCUNE de ces catégories, ajoute un nouveau tag en minuscules, court (1-3 mots). Ordre: du plus mis en avant au moins.`,
    },
    company_name_clean: {
      type: ["string", "null"],
      description: "Nom propre de l'entreprise si celui fourni (souvent issu de Google) contient des suffixes/descriptifs à retirer. Retourne null si le nom actuel est déjà propre.",
    },
    email: {
      type: ["string", "null"],
      description: "Email de contact trouvé sur le site (home, contact, mentions légales). Privilégier un email pro (contact@, info@...) plutôt qu'un email perso. Null si rien trouvé.",
    },
    logo_url: {
      type: ["string", "null"],
      description: "URL ABSOLUE du logo de l'entreprise. Trouvable dans le header ou footer du site. Doit commencer par http. Null si pas clairement identifiable.",
    },
    address_clean: {
      type: ["string", "null"],
      description: "Adresse correcte au format '[Numéro] [Rue], [Code postal] [Ville]'. À remplir UNIQUEMENT si l'adresse fournie en input est clairement buguée (ex: contient juste '4(9)', des notes Google, ou est vide). Sinon retourner null.",
    },
    years_experience: {
      type: ["integer", "null"],
      description: "Nombre d'années d'expérience de l'entreprise. Chercher sur la page d'accueil ou à-propos. Si non mentionné, retourner null (ne PAS deviner).",
    },
    rge_count: {
      type: ["integer", "null"],
      description: "Nombre total de qualifications (RGE, Qualibat, Qualifelec, etc.) mentionnées sur le site. Null si aucune qualification n'est clairement affichée.",
    },
    satisfied_clients_from_site: {
      type: ["integer", "null"],
      description: "Si une stat type 'X clients satisfaits' est affichée sur le site, retourner X. Sinon null (on calculera à partir du nombre d'avis Google).",
    },
    installations_from_site: {
      type: ["integer", "null"],
      description: "Si une stat type 'X installations réalisées/chantiers' est affichée sur le site, retourner X. Sinon null.",
    },
    closest_big_city: {
      type: ["string", "null"],
      description: "La grande ville (préfecture/sous-préfecture ou ville connue >20k hab) la plus proche de l'adresse de l'entreprise, dans un rayon de 30 à 50 km. Si l'entreprise est DÉJÀ dans cette grande ville, mettre cette ville. Null si adresse inconnue.",
    },
    surrounding_cities: {
      type: "array",
      items: { type: "string" },
      description: "Liste de 8 à 12 villes connues (communes de plus de 3000 hab) dans un rayon de 30 à 50 km autour de l'entreprise, que l'entreprise pourrait desservir. Format: noms propres avec majuscules et accents. Pas la ville de l'entreprise elle-même.",
    },
    site_accessible: {
      type: "boolean",
      description: "true si le site web contient un minimum de contenu utile. false si le site ne répond pas, est vide, en construction, ou est clairement un site generique/placeholder.",
    },
    site_accessible_reason: {
      type: ["string", "null"],
      description: "Si site_accessible=false, raison courte (ex: 'site_en_construction', 'no_content', 'generic_placeholder'). Sinon null.",
    },
  },
} as const;

export interface LLMInput {
  site_markdown: string; // concaténation des pages scrapées
  google_data: GooglePlaceData | null;
  current_name: string | null;
  current_address: string | null;
  current_city: string | null;
  current_postal: string | null;
  current_email: string | null;
}

export async function extractWithLLM(
  input: LLMInput,
  apiKey: string,
): Promise<LLMExtraction | null> {
  if (!apiKey) {
    console.error("OPENAI_API_KEY manquante");
    return null;
  }

  const systemPrompt = `Tu es un assistant spécialisé dans l'extraction d'informations structurées sur des TPE/PME françaises du secteur CVC (chauffage, ventilation, climatisation, plomberie) et photovoltaïque.

Ton rôle : lire le contenu brut d'un site web (en markdown) + les données Google Business, et extraire des informations précises dans un format JSON strict.

RÈGLES IMPORTANTES :
- N'invente AUCUNE information. Si tu n'es pas sûr, retourne null.
- Pour les services : utilise UNIQUEMENT la taxonomie fournie (climatisation, pompe à chaleur, chauffage, ventilation, plomberie, électricité, photovoltaïque, rénovation). Ajoute un tag custom SEULEMENT si un service mentionné ne rentre dans aucune catégorie.
- Pour la géographie : raisonne sur la position réelle de la ville en France. Donne des vraies villes existantes. Évite de citer des communes trop petites (<3000 hab) ou trop lointaines (>50km).
- Pour le logo : l'URL doit être ABSOLUE (https://...) et pointer vers une image (.png/.jpg/.svg/.webp). Regarde les balises <img> du header/footer dans le markdown.
- Pour l'email : privilégie toujours un email de type contact@, info@, commercial@ plutôt qu'un email perso. S'il y a plusieurs emails, prends le plus pro.`;

  const googleSection = input.google_data
    ? `\n\n--- DONNÉES GOOGLE BUSINESS ---\nNom Google: ${input.google_data.name ?? "N/A"}\nAdresse formatée: ${input.google_data.formatted_address ?? "N/A"}\nNombre total d'avis: ${input.google_data.total_reviews ?? "N/A"}`
    : `\n\n--- DONNÉES GOOGLE BUSINESS ---\n(non disponibles)`;

  const userPrompt = `Voici les informations actuelles sur l'entreprise :
- Nom: ${input.current_name ?? "inconnu"}
- Adresse: ${input.current_address ?? "inconnue"}
- Ville: ${input.current_city ?? "inconnue"}
- Code postal: ${input.current_postal ?? "inconnu"}
- Email connu: ${input.current_email ?? "aucun"}
${googleSection}

--- CONTENU DU SITE WEB ---
${input.site_markdown}

--- FIN DU CONTENU ---

Extrais les informations en remplissant le JSON demandé.`;

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "enrichment_extraction",
        strict: true,
        schema: EXTRACTION_SCHEMA,
      },
    },
    temperature: 0.1, // basse pour maximiser la cohérence
    max_tokens: 2000,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000); // 45s max pour GPT-4o

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`OpenAI API error ${res.status}: ${errText.slice(0, 500)}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error("OpenAI: content manquant dans la réponse");
      return null;
    }
    const parsed = JSON.parse(content) as LLMExtraction;
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`LLM extraction error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}