import type { ShellCounts } from './AutomationsShell'

// Compteurs affichés dans la TopBar / StatusBar. Renseignés une fois les tables
// Supabase en place (voir commit migrations). Vide pour l'instant.
export async function getShellCounts(): Promise<ShellCounts> {
  return {}
}
