// Fonction utilitaire pour extraire le domaine d'une URL
export const extractDomainFromUrl = (url: string): string => {
  if (!url) return '';
  
  try {
    // Ajouter le protocole si manquant
    let cleanUrl = url;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    const urlObj = new URL(cleanUrl);
    let domain = urlObj.hostname;
    
    // Supprimer le www. si présent
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    return domain;
  } catch (error) {
    // Si l'URL n'est pas valide, essayer de nettoyer manuellement
    let cleaned = url.replace(/^https?:\/\//, ''); // Supprimer protocole
    cleaned = cleaned.replace(/^www\./, ''); // Supprimer www
    cleaned = cleaned.split('/')[0]; // Prendre seulement le domaine
    cleaned = cleaned.split('?')[0]; // Supprimer les paramètres de requête
    cleaned = cleaned.split('#')[0]; // Supprimer les ancres
    
    return cleaned;
  }
};

// Fonction pour extraire juste le nom de domaine sans l'extension pour les noms d'opportunité
export const extractDomainNameOnly = (url: string): string => {
  if (!url) return '';
  
  const domain = extractDomainFromUrl(url);
  if (!domain) return '';
  
  // Extraire juste la partie avant l'extension (.com, .fr, .org, etc.)
  const parts = domain.split('.');
  if (parts.length > 1) {
    // Prendre la première partie (nom sans extension)
    return parts[0];
  }
  
  return domain;
};

// Fonction pour obtenir le nom d'affichage d'une entreprise
export const getCompanyDisplayName = (name?: string | null, canonicalUrl?: string | null): string => {
  // Si on a un nom, on l'utilise
  if (name && name.trim()) {
    return name.trim();
  }
  
  // Sinon, on extrait le domaine de l'URL
  if (canonicalUrl) {
    const domain = extractDomainFromUrl(canonicalUrl);
    if (domain) {
      return domain;
    }
  }
  
  // Fallback final
  return 'Entreprise sans nom';
};

// Fonction pour formater une URL pour l'affichage
export const formatUrlForDisplay = (url?: string | null): string => {
  if (!url) return '';
  
  const domain = extractDomainFromUrl(url);
  return domain || url;
};

// Helper function to ensure URL has a valid protocol for opening in new window
export const ensureHttpsUrl = (url: string): string => {
  if (!url || url.trim() === '') return '';
  
  const trimmedUrl = url.trim();
  
  // If URL already has a protocol, return as is
  if (trimmedUrl.match(/^https?:\/\//i)) {
    return trimmedUrl;
  }
  
  // Add https:// prefix
  return `https://${trimmedUrl}`;
};