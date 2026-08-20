'use client'
// ChoixSiret — la porte de sortie que la file n'avait pas.
//
// CE QU'IL DÉBLOQUE
// `recherche-entreprises` propose des candidats d'identité et ne choisit
// jamais. C'est la bonne règle : un rapprochement faux contamine l'identité,
// les finances, puis les qualifications RGE — qui finissent en logos sur un
// site public qu'on produit. Mais une règle qui interdit d'écrire sans offrir de
// porte pour trancher ne protège rien : elle empile.
//
// Mesuré le 20/08/2026 : 14 fiches attendent vraiment une décision, 48
// candidats, dont AUCUN n'a ses quatre critères concordants et 8 fiches sur 14
// sont serrées. Le gisement est devant — 2 648 fiches vivantes sans SIRET, dont
// 1 479 cherchables — et c'est la passe de lissage qui l'amènera ici.
//
// CE QUE L'ÉCRAN MONTRE, ET POURQUOI CE N'EST PAS UN SCORE
// Le registre des bots pose le critère mot pour mot : « pour écrire un
// rapprochement sans relecture humaine, il faut adresse + code postal + nom +
// métier concordants ; trois sur quatre ne suffisent pas ». On affiche donc
// LES QUATRE, un par un — pas « 87/100 », un chiffre qu'on ne sait pas
// contester. Le score reste visible, en second.
//
// ⚠️ MÊME AVEC LES QUATRE, ON NE VALIDE PAS TOUT SEUL. La fiche 57
// « KM Dépannage » a deux SIREN plausibles à la même adresse et au même
// patronyme : l'un chauffagiste, l'autre taxi. Les quatre concordent pour les
// deux. Seul l'appel au registre les distingue — et il a lieu à la validation.
//
// DEUX SIRET DE MÊME SIREN NE SONT PAS DEUX ENTREPRISES. C'est une entreprise
// et deux ÉTABLISSEMENTS, et l'écran doit le dire — sinon il crie au danger sur
// un choix sans enjeu. Voir `memeEntreprise` dans `choix-siret.ts` : ce que le
// choix change (l'adresse) et ce qu'il ne change pas (tout le reste, RGE
// compris) y est établi sur le code, pas supposé.
import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, RefreshCw, X } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import {
  nomCompareA,
  type CandidatJuge,
  type EntrepriseCandidate,
  type FicheAChoisir,
} from '@/lib/lissage/choix-siret'
import './lem-skin.css'

interface Resume {
  fiches: number
  entreprises: number
  etablissements: number
  evidentes: number
  serrees: number
}

interface Charge {
  resume: Resume
  fiches: FicheAChoisir[]
  plafonne: boolean
}

/**
 * Les quatre critères, et le troisième porte un libellé VARIABLE.
 *
 * Deux barèmes coexistent en base : celui de `score.ts` ne compare que la
 * commune, celui du versement `proeco` compare la VOIE et dit son niveau
 * (`adresse exacte`, `même voie`). Écrire « commune » en dur mentirait dans 89 %
 * des cas — et sur le critère qui pèse le plus dans le rapprochement.
 */
const CRITERES: { cle: keyof CandidatJuge['concordance']; label?: string }[] = [
  { cle: 'nom', label: 'nom' },
  { cle: 'codePostal', label: 'code postal' },
  { cle: 'adresse' },
  { cle: 'metier', label: 'métier' },
]

export function ChoixSiret() {
  const [charge, setCharge] = useState<Charge | null>(null)
  const [chargement, setChargement] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setChargement(true)
    setPanne(null)
    try {
      const r = await authedFetch('/api/lissage/identite')
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message ?? j?.error ?? 'La lecture de la file a échoué.')
        setCharge(null)
        return
      }
      setCharge(j as Charge)
    } catch {
      // UNE PANNE DE LECTURE N'EST PAS UNE FILE VIDE. Le piège a déjà été posé
      // quatre fois dans ce projet : « aucune tâche », « aucun fil », « aucune
      // liste », « aucune passe ». Ici il coûterait plus cher qu'ailleurs —
      // « rien à trancher » ferait croire le travail fini.
      setPanne('La lecture de la file a échoué.')
      setCharge(null)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  const trancher = useCallback(
    async (
      entrepriseId: number,
      siret: string,
      decision: 'valide' | 'rejete',
      extra: { source?: string; source_url?: string } = {},
    ) => {
      setOccupe(entrepriseId)
      setMessage(null)
      try {
        const r = await authedFetch('/api/lissage/identite', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entreprise_id: entrepriseId, siret, decision, ...extra }),
        })
        const j = await r.json()
        if (!r.ok) {
          setPanne(j?.message ?? j?.error ?? 'La décision a échoué.')
          return
        }
        // Les divergences ne bloquent pas — un siège ailleurs est légitime — mais
        // elles se disent. Les enfouir, c'est valider en aveugle.
        const avert = (j.avertissements ?? []) as string[]
        setMessage(
          decision === 'valide'
            ? `SIRET ${siret} validé.${avert.length ? ` ⚠ ${avert.join(' · ')}` : ''}`
            : 'Candidat écarté.',
        )
        await charger()
      } catch {
        setPanne('La décision a échoué.')
      } finally {
        setOccupe(null)
      }
    },
    [charger],
  )

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Choisir le SIRET</h1>
            <p className="lem-sous">
              L’annuaire <b>propose</b>, il ne choisit jamais. Chaque candidat est présenté sur
              ses quatre critères — <b>nom, code postal, adresse, métier</b> — parce qu’un
              rapprochement faux ne fait pas une donnée fausse&nbsp;: il contamine l’identité,
              les finances, puis les qualifications RGE affichées sur un site public.
            </p>
          </div>
          <button className="lem-btn" onClick={() => void charger()} disabled={chargement}>
            <RefreshCw size={15} /> Recharger
          </button>
        </header>

        {panne && (
          <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{panne}</div>
          </div>
        )}

        {message && (
          <div className="lem-alerte" data-gravite="info" style={{ marginBottom: 12 }}>
            <div>{message}</div>
          </div>
        )}

        {charge && (
          <div className="lem-carte" style={{ padding: 16, marginBottom: 14 }}>
            <BandeauResume resume={charge.resume} />
            {charge.plafonne && (
              <p className="lem-second" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
                L’écran n’en affiche qu’une partie. Le compte ci-dessus porte sur la file
                entière&nbsp;: il ne descend qu’à mesure qu’on tranche.
              </p>
            )}
          </div>
        )}

        {chargement ? (
          <div className="lem-carte">
            <div className="lem-vide">Chargement…</div>
          </div>
        ) : panne && !charge ? null : !charge || charge.fiches.length === 0 ? (
          <div className="lem-carte">
            <div className="lem-vide">
              <h3>Rien à trancher</h3>
              <p>
                Aucune fiche n’a de candidat en attente. Pour en produire, lancez une passe de
                lissage sur les fiches <b>sans SIRET</b>&nbsp;: l’annuaire y déposera ses
                propositions, et elles arriveront ici.
              </p>
            </div>
          </div>
        ) : (
          charge.fiches.map((f) => (
            <CarteFiche
              key={f.fiche.entrepriseId}
              fiche={f}
              occupe={occupe === f.fiche.entrepriseId}
              onTrancher={trancher}
            />
          ))
        )}
      </div>
    </div>
  )
}

/** Ce que la file dit d'elle-même. Un compteur nu ne dit pas la charge de travail. */
function BandeauResume({ resume }: { resume: Resume }) {
  return (
    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <Chiffre n={resume.fiches} label="fiches à trancher" />
      <Chiffre n={resume.entreprises} label="entreprises candidates" />
      <Chiffre n={resume.etablissements} label="établissements proposés" />
      <Chiffre n={resume.evidentes} label="dont les quatre critères concordent" ton="ok" />
      <Chiffre n={resume.serrees} label="où deux candidats se tiennent" ton="attention" />
    </div>
  )
}

function Chiffre({ n, label, ton }: { n: number; label: string; ton?: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div className="lem-second" style={{ fontSize: 12.5 }}>
        {ton ? <span className="lem-pill" data-ton={ton}>{label}</span> : label}
      </div>
    </div>
  )
}

function CarteFiche({
  fiche,
  occupe,
  onTrancher,
}: {
  fiche: FicheAChoisir
  occupe: boolean
  onTrancher: (
    entrepriseId: number,
    siret: string,
    decision: 'valide' | 'rejete',
    extra?: { source?: string; source_url?: string },
  ) => void | Promise<void>
}) {
  const [ailleurs, setAilleurs] = useState('')
  const [url, setUrl] = useState('')
  const id = fiche.fiche.entrepriseId

  return (
    <div className="lem-carte" style={{ padding: 18, marginBottom: 14 }}>
      <div className="lem-entete" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {fiche.fiche.nom ?? `Fiche #${id}`}
          </h2>
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 3 }}>
            {[fiche.fiche.codePostal, fiche.fiche.ville].filter(Boolean).join(' ') ||
              'ni code postal ni commune sur la fiche'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {fiche.evidente && (
            <span className="lem-pill" data-ton="ok">les quatre concordent</span>
          )}
          {fiche.memeEntreprise ? (
            <span className="lem-pill" data-ton="neutre">même entreprise, deux établissements</span>
          ) : (
            fiche.serree && (
              <span className="lem-pill" data-ton="attention">deux candidats se tiennent</span>
            )
          )}
        </div>
      </div>

      {/* DEUX SITUATIONS QUI SE RESSEMBLENT ET N'ONT RIEN À VOIR, et les
          confondre était le défaut de la première version : elle criait au
          danger sur un cas parfaitement bénin. Le SIREN les sépare — même
          SIREN = UNE entreprise à deux adresses ; SIREN différents = deux
          entreprises que le score ne départage pas. */}
      {fiche.memeEntreprise ? (
        <div className="lem-alerte" data-gravite="info" style={{ marginBottom: 12 }}>
          <div>
            Ces {fiche.etablissements} candidats sont <b>la même entreprise</b>
            {fiche.siren ? ` (SIREN ${fiche.siren})` : ''}, à des établissements différents. Le
            choix ne change <b>ni</b> la raison sociale, <b>ni</b> les dirigeants, <b>ni</b> les
            finances, <b>ni</b> les qualifications RGE — l’ADEME est interrogée sur tout le
            SIREN. Il ne change que <b>l’adresse retenue</b>&nbsp;: prenez l’établissement où
            l’activité a lieu, pas forcément le siège.
          </div>
        </div>
      ) : (
        fiche.serree && (
          <div className="lem-alerte" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              Deux candidats sont à moins de huit points l’un de l’autre, et ce ne sont{' '}
              <b>pas la même entreprise</b>. Le score ne les départage pas&nbsp;:{' '}
              <b>lisez l’adresse et le métier</b> avant de trancher.
            </div>
          </div>
        )
      )}

      {fiche.entreprises.map((e) => (
        <BlocEntreprise
          key={e.siren}
          entreprise={e}
          occupe={occupe}
          onValider={(siret) => void onTrancher(id, siret, 'valide', { source: 'resolution' })}
          onEcarter={(siret) => void onTrancher(id, siret, 'rejete')}
        />
      ))}

      {/* Le SIRET lu ailleurs — pied de page du site, registre consulté à la
          main. Sur ce parc, la recherche par nom échoue souvent : « CLIMIZ » est
          immatriculée TOP CLIMATISATION et rend 0 résultat. Ce champ n'est pas
          une commodité, c'est le seul recours de ces fiches-là. Il est vérifié
          au registre comme les autres avant d'être écrit. */}
      <details style={{ marginTop: 10 }}>
        <summary className="lem-second" style={{ fontSize: 12.5, cursor: 'pointer' }}>
          Aucun ne convient — j’ai le SIRET ailleurs
        </summary>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'flex-end' }}>
          <label>
            <span className="lem-second" style={{ fontSize: 12 }}>SIRET (14 chiffres)</span>
            <input
              className="lem-champ"
              value={ailleurs}
              onChange={(e) => setAilleurs(e.target.value.replace(/\D/g, '').slice(0, 14))}
              placeholder="12345678900012"
              style={{ width: 190, fontFamily: 'ui-monospace, monospace' }}
            />
          </label>
          <label style={{ flex: '1 1 260px' }}>
            <span className="lem-second" style={{ fontSize: 12 }}>Où l’avez-vous lu&nbsp;?</span>
            <input
              className="lem-champ"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (pied de page du site)"
            />
          </label>
          <button
            className="lem-btn"
            disabled={occupe || ailleurs.length !== 14}
            onClick={() =>
              void onTrancher(id, ailleurs, 'valide', {
                source: url ? 'recherche_web' : 'saisie',
                ...(url ? { source_url: url } : {}),
              })
            }
          >
            Vérifier au registre et écrire
          </button>
        </div>
      </details>
    </div>
  )
}

/**
 * Une ENTREPRISE : son meilleur établissement, et les autres repliés.
 *
 * L'établissement ne se fait plus trancher à la main — le SIREN étant le même,
 * seule l'adresse change, et le score l'intègre déjà. On dit ce qu'on a retenu
 * et pourquoi, et on laisse la porte ouverte : le score ne connaît pas le
 * terrain aussi bien que celui qui a la fiche Google sous les yeux.
 */
function BlocEntreprise({
  entreprise,
  occupe,
  onValider,
  onEcarter,
}: {
  entreprise: EntrepriseCandidate
  occupe: boolean
  onValider: (siret: string) => void
  onEcarter: (siret: string) => void
}) {
  const { retenu, autres, etablissements } = entreprise
  return (
    <div>
      <LigneCandidat
        candidat={retenu}
        occupe={occupe}
        onValider={() => onValider(retenu.siret)}
        onEcarter={() => onEcarter(retenu.siret)}
        mention={
          etablissements > 1
            ? `${etablissements} établissements pour ce SIREN — celui-ci est le mieux rapproché`
            : null
        }
      />
      {autres.length > 0 && (
        <details style={{ margin: '6px 0 0 14px' }}>
          <summary className="lem-second" style={{ fontSize: 12.5, cursor: 'pointer' }}>
            Voir les {autres.length} autre{autres.length > 1 ? 's' : ''} établissement
            {autres.length > 1 ? 's' : ''} de la même entreprise
          </summary>
          {autres.map((c) => (
            <LigneCandidat
              key={c.siret}
              candidat={c}
              occupe={occupe}
              onValider={() => onValider(c.siret)}
              onEcarter={() => onEcarter(c.siret)}
              mention="autre établissement du même SIREN"
            />
          ))}
        </details>
      )}
    </div>
  )
}

/** Un candidat : ses quatre critères d'abord, son score ensuite. */
function LigneCandidat({
  candidat,
  occupe,
  onValider,
  onEcarter,
  mention,
}: {
  candidat: CandidatJuge
  occupe: boolean
  onValider: () => void
  onEcarter: () => void
  /** Ce que le regroupement par SIREN a décidé, en toutes lettres. */
  mention?: string | null
}) {
  return (
    <div
      style={{
        border: '1px solid var(--lem-bord)',
        borderRadius: 'var(--lem-rayon-2)',
        padding: 12,
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 14 }}>{candidat.denomination ?? '—'}</strong>
        <span className="lem-second" style={{ fontSize: 12 }}>
          {candidat.concordance.compte}/4 critères · score {candidat.score}
        </span>
      </div>

      <div className="lem-second" style={{ fontSize: 12.5, marginTop: 2 }}>
        {[candidat.adresse, candidat.codePostal, candidat.ville].filter(Boolean).join(' ') || '—'}
        {candidat.nafCode ? ` · NAF ${candidat.nafCode}` : ''}
      </div>
      <div className="lem-decor" style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
        {candidat.siret}
      </div>

      {mention && (
        <div className="lem-second" style={{ fontSize: 12, marginTop: 4 }}>
          {mention}
        </div>
      )}

      {/* LES QUATRE CRITÈRES DU REGISTRE, un par un. Un score composite se
          conteste mal ; « nom oui, code postal non » se conteste tout seul. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {CRITERES.map((c) => {
          const tenu = Boolean(candidat.concordance[c.cle])
          const label = c.label ?? candidat.concordance.libelleAdresse
          return (
            <span key={c.cle} className="lem-pill" data-ton={tenu ? 'ok' : 'neutre'}>
              {tenu ? '✓' : '✕'} {label}
            </span>
          )
        })}
      </div>

      {/* Les deux barèmes ne nomment pas ce champ pareil (`nomCompareA` /
          `nom_compare_a`) : `nomCompareA()` lit les deux, sinon la ligne la plus
          utile de la carte disparaissait pour 89 % des candidats. */}
      {nomCompareA(candidat.detail) && (
        <div className="lem-decor" style={{ fontSize: 12, marginTop: 6 }}>
          nom comparé à {nomCompareA(candidat.detail)}
        </div>
      )}

      {/* Une entreprise cessée n'est pas éliminée : c'est peut-être LA bonne, et
          la découvrir morte est un renseignement. Elle doit sauter aux yeux. */}
      {candidat.alertes.map((a) => (
        <div key={a} style={{ fontSize: 12.5, marginTop: 6, color: 'var(--lem-attention)', fontWeight: 500 }}>
          ⚠ {a}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="lem-btn principal" onClick={onValider} disabled={occupe}>
          <Check size={14} /> C’est celle-ci
        </button>
        <button className="lem-btn discret" onClick={onEcarter} disabled={occupe}>
          <X size={14} /> Écarter
        </button>
      </div>
    </div>
  )
}
