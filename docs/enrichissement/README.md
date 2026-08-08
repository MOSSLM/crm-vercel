# Enrichissement manuel — mode d'emploi

Pour l'opérateur. Le prompt à donner à Claude est dans `prompt-local.md`, qui ne
contient que lui : ce fichier-ci n'est pas à coller dans la session.

## Pourquoi en local et pas depuis le web

Claude Code sur le web passe par un proxy réseau qui bloque `WebFetch`. Or tout
ce travail consiste à lire les sites des clients : c'est là que se trouvent les
emails, les noms de salariés et les chiffres que l'enrichissement automatique
manque. La recherche (`WebSearch`) passe, elle, et suffit pour les registres —
mais pas pour le reste.

## Prérequis : le MCP Supabase

Le dépôt ne configure aucun serveur MCP. Sans accès Supabase, le prompt est
inerte : la session ne pourra ni lire la file ni écrire une ligne.

```bash
claude mcp list          # « supabase » doit apparaître
```

S'il manque (il faut un jeton personnel Supabase, Account settings → Access
tokens) :

```bash
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=llzrpcbwnqvbrcjjwysm
```

## Le premier lancement

Ne pars pas directement sur 40 fiches. Colle le prompt, puis ajoute en une
phrase :

> Commence par 3 fiches seulement et donne-moi le rapport **avant** d'écrire
> quoi que ce soit en base.

Tu vois le barème appliqué sur des cas réels, les emails trouvés et où ils
allaient atterrir, et tu corriges avant que ça parte sur le lot entier. C'est
une session qui écrit dans la base de production.

## L'ordre des opérations

**Enrichir d'abord, publier ensuite.** La publication fige un instantané
(`published_variables`) et le site en ligne sert depuis ce gel, jamais depuis la
base vivante. Un site publié avant l'enrichissement garderait donc les anciens
chiffres jusqu'à sa republication.

Aujourd'hui la question ne se pose pas : sur les 88 sites liés à des entreprises
qualifiées, **aucun n'est publié**. L'ordre naturel est donc le bon.

## Après la session : rapatrier les logos existants

La session écrit dans `logo_url` l'adresse qu'elle trouve, sans se soucier de
l'hébergement — écrire en base par le MCP court-circuite de toute façon les
routes de l'application.

Deux filets rattrapent ça :

- **À la publication**, `ensureHostedLogo` aspire le logo distant juste avant que
  l'instantané se fige. Automatique, sur tous les chemins qui publient ou
  republient — y compris après un enrichissement par l'edge function.
- **La reprise ci-dessous**, pour le stock : les 119 logos déjà en base qui
  pointent vers le site de leur client, et tout ce qu'une session écrit sans
  qu'on publie derrière.

Depuis la console du navigateur, connecté au CRM (réservé aux admins) :

```js
const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
const token = JSON.parse(localStorage.getItem(key)).access_token;
const sweep = (body) => fetch('/api/media/rehost-logos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
}).then(r => r.json()).then(r => (console.log(r), r));

await sweep({ dry_run: true });   // ce qui serait fait, sans rien écrire
await sweep({});                  // pour de vrai
```

Rejouable : une image déjà chez nous est ignorée, elle n'est même pas
retéléchargée. Si la réponse porte un `next_after_id` non nul, le budget de la
requête a été atteint — rappeler avec `await sweep({ after_id: <la valeur> })`
jusqu'à ce qu'il repasse à `null`.
