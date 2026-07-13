// =====================================================================
// Extraction structurée via LLM (OpenAI ou DeepSeek)
// =====================================================================
// Le provider + le modèle sont configurables (table `enrichment_llm_settings`,
// gérée depuis les Paramètres du CRM). Deux stratégies de sortie structurée :
//   - OpenAI : "Structured Outputs" avec json_schema strict (garantie de format)
//     Doc: https://platform.openai.com/docs/guides/structured-outputs
//   - DeepSeek : API compatible OpenAI mais uniquement mode json_object.
//     Le schéma est injecté dans le prompt et la sortie est normalisée/validée
//     ci-dessous (coercition des types, valeurs manquantes → null/[]).
// =====================================================================

import type { LLMExtraction, GooglePlaceData, LlmConfig } from "./types.ts";
import { SERVICE_TAGS_TAXONOMY } from "./types.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// JSON Schema strict décrivant la sortie attendue (OpenAI Structured Outputs)
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

// Squelette JSON donné en clair au modèle DeepSeek (mode json_object) : il n'y a
// pas de json_schema strict, donc on décrit la forme attendue dans le prompt.
const JSON_SHAPE_HINT = `Réponds UNIQUEMENT avec un objet JSON valide respectant EXACTEMENT cette forme (mêmes clés, mêmes types) :
{
  "services_tags": ["string"],
  "company_name_clean": "string|null",
  "email": "string|null",
  "logo_url": "string|null",
  "address_clean": "string|null",
  "years_experience": number|null,
  "rge_count": number|null,
  "satisfied_clients_from_site": number|null,
  "installations_from_site": number|null,
  "closest_big_city": "string|null",
  "surrounding_cities": ["string"],
  "site_accessible": true,
  "site_accessible_reason": "string|null"
}
N'ajoute aucune clé supplémentaire, aucun texte hors du JSON.`;

export interface LLMInput {
  site_markdown: string; // concaténation des pages scrapées
  google_data: GooglePlaceData | null;
  current_name: string | null;
  current_address: string | null;
  current_city: string | null;
  current_postal: string | null;
  current_email: string | null;
}

// ---------------------------------------------------------------------
// Helpers provider / modèle
// ---------------------------------------------------------------------

/** GPT-5 famille + o-series : pas de `temperature` custom (défaut imposé) et
 *  paramètre `max_completion_tokens` au lieu de `max_tokens`. */
function isOpenAIReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

function endpointFor(provider: LlmConfig["provider"]): string {
  return provider === "deepseek" ? DEEPSEEK_URL : OPENAI_URL;
}

// ---------------------------------------------------------------------
// Normalisation défensive de la sortie (indispensable pour DeepSeek, filet de
// sécurité pour OpenAI).
// ---------------------------------------------------------------------
function toStrOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 && t.toLowerCase() !== "null" ? t : null;
  }
  return null;
}

function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d-]/g, "");
    if (!cleaned) return null;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}

function normalizeExtraction(raw: unknown): LLMExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // Par défaut on considère le site accessible sauf si explicitement false.
  const siteAccessible = typeof o.site_accessible === "boolean" ? o.site_accessible : o.site_accessible !== false;
  const reason = toStrOrNull(o.site_accessible_reason);
  return {
    services_tags: toStrArray(o.services_tags),
    company_name_clean: toStrOrNull(o.company_name_clean),
    email: toStrOrNull(o.email),
    logo_url: toStrOrNull(o.logo_url),
    address_clean: toStrOrNull(o.address_clean),
    years_experience: toIntOrNull(o.years_experience),
    rge_count: toIntOrNull(o.rge_count),
    satisfied_clients_from_site: toIntOrNull(o.satisfied_clients_from_site),
    installations_from_site: toIntOrNull(o.installations_from_site),
    closest_big_city: toStrOrNull(o.closest_big_city),
    surrounding_cities: toStrArray(o.surrounding_cities),
    site_accessible: siteAccessible,
    site_accessible_reason: reason ?? undefined,
  };
}

/** Extrait un objet JSON d'un contenu texte (au cas où le modèle enrobe le JSON). */
function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------
// Construction du body de requête selon le provider / modèle
// ---------------------------------------------------------------------
function buildRequestBody(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
): Record<string, unknown> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  if (config.provider === "deepseek") {
    return {
      model: config.model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    };
  }

  // OpenAI : Structured Outputs strict.
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: { name: "enrichment_extraction", strict: true, schema: EXTRACTION_SCHEMA },
    },
  };
  if (isOpenAIReasoningModel(config.model)) {
    // GPT-5 / o-series : temperature non modifiable, jeton de sortie dédié.
    // ATTENTION : ces modèles consomment leur budget en RAISONNEMENT interne
    // AVANT de produire la sortie visible. Avec un budget trop bas (2000), tout
    // part dans le raisonnement et la réponse revient VIDE ("contenu vide").
    // On donne donc une marge large, et pour gpt-5 on plafonne l'effort de
    // raisonnement à "minimal" (extraction structurée = pas besoin de raisonner
    // longuement) → sortie fiable, plus rapide et moins chère.
    body.max_completion_tokens = 16000;
    if (/^gpt-5/i.test(config.model)) {
      body.reasoning_effort = "minimal";
    }
  } else {
    body.temperature = 0.1;
    body.max_tokens = 2000;
  }
  return body;
}

/** Budget temps par appel : les modèles de raisonnement sont plus lents. */
function timeoutForModel(config: LlmConfig): number {
  return config.provider === "openai" && isOpenAIReasoningModel(config.model) ? 90000 : 45000;
}

// ---------------------------------------------------------------------
// Appel unique (une tentative)
// ---------------------------------------------------------------------
async function callOnce(
  config: LlmConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<LLMExtraction | null> {
  const body = buildRequestBody(config, systemPrompt, userPrompt);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutForModel(config));

  try {
    const res = await fetch(endpointFor(config.provider), {
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
      console.error(`${config.provider} API error ${res.status}: ${errText.slice(0, 500)}`);
      return null;
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      // Diagnostic : finish_reason="length" + reasoning_tokens élevés ⇒ le budget
      // est parti dans le raisonnement (voir max_completion_tokens / reasoning_effort).
      const finish = choice?.finish_reason ?? "?";
      const refusal = choice?.message?.refusal;
      const usage = data?.usage ?? {};
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? "?";
      console.warn(
        `${config.provider}/${config.model}: contenu vide ` +
          `(finish_reason=${finish}, completion_tokens=${usage?.completion_tokens ?? "?"}, ` +
          `reasoning_tokens=${reasoningTokens}${refusal ? `, refusal=${String(refusal).slice(0, 120)}` : ""})`,
      );
      return null;
    }
    const parsed = parseJsonLoose(content);
    return normalizeExtraction(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`LLM extraction error (${config.provider}/${config.model}): ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------
// Point d'entrée : 1 tentative + 1 retry (DeepSeek peut renvoyer vide).
// ---------------------------------------------------------------------
export async function extractWithLLM(
  input: LLMInput,
  config: LlmConfig,
  apiKey: string,
): Promise<LLMExtraction | null> {
  if (!apiKey) {
    console.error(`Clé API manquante pour le provider ${config.provider}`);
    return null;
  }

  const systemBase = `Tu es un assistant spécialisé dans l'extraction d'informations structurées sur des TPE/PME françaises du secteur CVC (chauffage, ventilation, climatisation, plomberie) et photovoltaïque.

Ton rôle : lire le contenu brut d'un site web (en markdown) + les données Google Business, et extraire des informations précises dans un format JSON strict.

RÈGLES IMPORTANTES :
- N'invente AUCUNE information. Si tu n'es pas sûr, retourne null.
- Pour les services : utilise UNIQUEMENT la taxonomie fournie (climatisation, pompe à chaleur, chauffage, ventilation, plomberie, électricité, photovoltaïque, rénovation). Ajoute un tag custom SEULEMENT si un service mentionné ne rentre dans aucune catégorie.
- Pour la géographie : raisonne sur la position réelle de la ville en France. Donne des vraies villes existantes. Évite de citer des communes trop petites (<3000 hab) ou trop lointaines (>50km).
- Pour le logo : l'URL doit être ABSOLUE (https://...) et pointer vers une image (.png/.jpg/.svg/.webp). Regarde les balises <img> du header/footer dans le markdown.
- Pour l'email : privilégie toujours un email de type contact@, info@, commercial@ plutôt qu'un email perso. S'il y a plusieurs emails, prends le plus pro.`;

  // DeepSeek n'a pas de json_schema strict : on décrit la forme dans le prompt.
  const systemPrompt = config.provider === "deepseek"
    ? `${systemBase}\n\n${JSON_SHAPE_HINT}`
    : systemBase;

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

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callOnce(config, apiKey, systemPrompt, userPrompt);
    if (result) return result;
    if (attempt === 0) console.warn(`${config.provider}/${config.model}: nouvelle tentative`);
  }
  return null;
}
