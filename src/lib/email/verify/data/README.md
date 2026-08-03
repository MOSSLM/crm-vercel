# Données du vérificateur d'adresses

## `disposable-domains.json`

Liste des domaines d'adresses jetables (Yopmail, Mailinator, 10minutemail…),
8 201 entrées. Une adresse sur l'un de ces domaines est **invalide
définitivement** : elle a été créée pour être abandonnée, et si elle répond
encore, ce n'est pas un prospect.

Source : [`disposable-email-domains/disposable-email-domains`][src], fichier
`disposable_email_blocklist.conf`, domaine public (CC0).

[src]: https://github.com/disposable-email-domains/disposable-email-domains

C'est une **donnée**, pas du code : elle est recopiée telle quelle, triée et
dédoublonnée, sans transformation métier. La logique qui s'en sert vit dans
`../domains.ts`.

### La mettre à jour

La liste bouge lentement (quelques dizaines d'entrées par trimestre). Rien ne
casse si elle vieillit : un domaine jetable non listé sera simplement traité
comme un domaine ordinaire, et le premier rebond le classera de toute façon.

```bash
curl -s https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf \
  | tr 'A-Z' 'a-z' | tr -d '\r' | sort -u | grep -E '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(d.trim().split("\n"))))' \
  > src/lib/email/verify/data/disposable-domains.json
```

> Le fichier n'est importé que par du code serveur (`domains.ts`, lui-même
> chargé par le service de vérification). Il ne part jamais dans le bundle
> client — 130 Ko n'ont rien à faire dans un navigateur.
