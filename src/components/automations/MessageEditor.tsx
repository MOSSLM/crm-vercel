'use client'
// MessageEditor — écrire un message avec ses variables, et voir ce qui partira.
//
// UN SEUL ÉDITEUR, TOUS LES CANAUX. C'est la demande explicite : le même
// constructeur pour l'e-mail et pour WhatsApp. Ce qui a éclaté la prospection
// en quatre surfaces, c'est justement que chaque canal avait « son » écran —
// l'onglet WhatsApp avec ses modèles en `localStorage`, l'onglet e-mail avec
// les siens, le builder avec un troisième. Ici le composant est unique et
// seules les CAPACITÉS changent : ce que le canal accepte est une donnée
// (`redaction.ts`), pas une branche de code.
//
// CE QUE ÇA REMPLACE
// Le builder listait les variables disponibles dans un panneau replié, à
// recopier à la main. Une faute de frappe (`{{company_nam}}`) ne se voyait
// nulle part : `interpolate` remplace par du vide toute clé inconnue, donc le
// message partait amputé et personne ne l'apprenait avant le prospect.
//
// TROIS CHOSES SE DISENT DIFFÉREMMENT, ET C'EST VOULU :
//   · un TROU (variable vide) — le message part quand même, en creux ;
//   · une FAUTE de structure (bloc mal fermé) — l'enregistrement doit être
//     refusé, parce qu'on ne sait pas ce qui partirait ;
//   · un DÉPASSEMENT — dur (la plateforme refuse) ou de confort (c'est notre
//     avis, et il se présente comme tel).
// Les confondre, c'est soit bloquer sur un avis, soit laisser passer un refus.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { XI } from './icons'
import { VARIABLES, insertVariable, type VarBag } from '@/lib/automations/variables'
import {
  analyserMessage,
  capaciteDuCanal,
  insertConditionnel,
  type Analyse,
  type CapaciteCanal,
} from '@/lib/automations/redaction'

/** Ce que la barre d'insertion propose de tester dans un conditionnel. */
const TESTABLES = VARIABLES.filter((v) => v.key !== 'owner.first_name' && v.key !== 'calendar_link')

export function MessageEditor({
  value,
  onChange,
  vars,
  rows = 6,
  placeholder,
  disabled = false,
  /** Étiquette de l'aperçu — « Aperçu » par défaut. */
  previewLabel = 'Aperçu',
  /** Sur quoi l'aperçu est calculé, affiché en tête (« Toiture Martin », « exemple »). */
  previewOn,
  /**
   * La nature de l'étape — `email`, `whatsapp`, `sms`, `call`… Ce qui change
   * le compteur, les limites et les outils proposés. Absente, on retombe sur
   * la consigne : le canal qui n'envoie rien, donc le plus prudent.
   */
  canal,
  /** Remonté à chaque frappe, pour que l'appelant puisse refuser d'enregistrer. */
  onAnalyse,
}: {
  value: string
  onChange: (v: string) => void
  vars: VarBag
  rows?: number
  placeholder?: string
  disabled?: boolean
  previewLabel?: string
  previewOn?: string | null
  canal?: string | null
  onAnalyse?: (a: Analyse, capacite: CapaciteCanal) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  const capacite = useMemo(() => capaciteDuCanal(canal), [canal])

  // Un insert quel qu'il soit : on remplace, puis on replace le curseur.
  // Sans ça, deux insertions de suite s'empilent au même endroit, dans
  // l'ordre inverse.
  const appliquer = useCallback(
    (calcul: (texte: string, debut: number, fin: number) => { text: string; cursor: number }) => {
      const el = ref.current
      // Sans textarea monté (ou sans focus), on ajoute à la fin plutôt que de
      // ne rien faire : un bouton qui ne réagit pas passe pour cassé.
      const start = el?.selectionStart ?? value.length
      const end = el?.selectionEnd ?? start
      const { text, cursor } = calcul(value, start, end)
      onChange(text)
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(cursor, cursor)
      })
    },
    [value, onChange],
  )

  const insert = useCallback(
    (key: string) => appliquer((t, d, f) => insertVariable(t, key, d, f)),
    [appliquer],
  )
  const insertRepli = useCallback(
    (key: string) =>
      appliquer((t, d, f) => {
        const { text, cursor } = insertVariable(t, key, d, f)
        // Le curseur atterrit ENTRE les guillemets : c'est le seul endroit où
        // il reste quelque chose à écrire.
        const avant = `${text.slice(0, cursor - 2)} | ""`
        return { text: avant + text.slice(cursor - 2), cursor: avant.length - 1 }
      }),
    [appliquer],
  )
  const insertCondition = useCallback(
    (key: string) => appliquer((t, d, f) => insertConditionnel(t, key, d, f)),
    [appliquer],
  )

  const analyse = useMemo(() => analyserMessage(value, vars, capacite), [value, vars, capacite])
  // Remonté dans un effet, pas pendant le rendu : prévenir le parent en plein
  // rendu, c'est le faire se mettre à jour pendant qu'il nous dessine.
  const signaler = useRef(onAnalyse)
  signaler.current = onAnalyse
  useEffect(() => {
    signaler.current?.(analyse, capacite)
  }, [analyse, capacite])

  return (
    <div className="msg-ed">
      <div className="msg-ed-vars" role="group" aria-label="Insérer une variable">
        {VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            className="msg-ed-var"
            disabled={disabled}
            title={`${v.desc} — ${v.sample}`}
            onClick={() => insert(v.key)}
          >
            {v.desc}
          </button>
        ))}
      </div>

      <div className="msg-ed-outils">
        <ChoixVariable
          label="Repli"
          titre="Insérer une variable avec le texte qui la remplace quand elle est vide"
          disabled={disabled}
          onChoix={insertRepli}
        />
        <ChoixVariable
          label="Si… sinon…"
          titre="Écrire deux phrases, et n’en envoyer qu’une selon ce que le prospect a"
          disabled={disabled}
          onChoix={insertCondition}
        />
      </div>

      <textarea
        ref={ref}
        className="textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="msg-ed-foot">
        <button type="button" className="msg-ed-toggle" onClick={() => setShowPreview((s) => !s)}>
          <XI name={showPreview ? 'chevdown' : 'chevright'} className="ico-xs" />
          {previewLabel}
          {previewOn && <span className="on">sur {previewOn}</span>}
        </button>
        <Compteur analyse={analyse} capacite={capacite} />
      </div>

      {/* Une faute de structure passe avant tout le reste : tant qu'elle est
          là, ni l'aperçu ni le compteur ne disent la vérité. */}
      {analyse.fautes.map((f, i) => (
        <div key={`${f.code}-${i}`} className="msg-ed-faute">
          <XI name="warning" className="ico-xs" />
          <span>{f.message}</span>
        </div>
      ))}

      {analyse.depassement && (
        <div className="msg-ed-missing">
          <XI name="x" className="ico-xs" />
          <span>
            {analyse.depassement.de} caractère{analyse.depassement.de > 1 ? 's' : ''} de trop. {capacite.motif}
          </span>
        </div>
      )}

      {showPreview && (
        <>
          <div className="msg-ed-preview" aria-live="polite">
            {analyse.rendu.trim() ? (
              analyse.rendu
            ) : (
              <span className="vide">Rien à afficher — le message est vide.</span>
            )}
          </div>
          {analyse.manquantes.length > 0 && (
            // Le message partirait quand même, avec des trous. C'est le seul
            // moment où on peut encore l'empêcher.
            <div className="msg-ed-missing">
              <XI name="x" className="ico-xs" />
              <span>
                {analyse.manquantes.length === 1 ? 'Cette variable partira vide' : 'Ces variables partiront vides'} :{' '}
                {analyse.manquantes.map((k) => VARIABLES.find((v) => v.key === k)?.desc ?? k).join(', ')}. Un repli
                comblerait le trou.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Un chip qui déroule les variables — même forme qu'un bouton d'insertion. */
function ChoixVariable({
  label,
  titre,
  disabled,
  onChoix,
}: {
  label: string
  titre: string
  disabled: boolean
  onChoix: (key: string) => void
}) {
  return (
    <label className="msg-ed-outil" title={titre}>
      <span>{label}</span>
      <select
        aria-label={titre}
        disabled={disabled}
        value=""
        onChange={(e) => {
          if (e.target.value) onChoix(e.target.value)
          // Remis à vide pour que rechoisir la même variable réagisse.
          e.target.value = ''
        }}
      >
        <option value="">…</option>
        {TESTABLES.map((v) => (
          <option key={v.key} value={v.key}>
            {v.desc}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Le compteur, et il ne compte pas la même chose selon le canal.
 *
 * LA LONGUEUR EST CELLE DU RENDU. Un message de 190 caractères dont 40 sont
 * `{{company.name}}` en fait 180 ou 210 selon le prospect : afficher la source
 * donnerait un chiffre qui n'est celui de personne.
 */
function Compteur({ analyse, capacite }: { analyse: Analyse; capacite: CapaciteCanal }) {
  if (capacite.segmente && analyse.sms) {
    const { segments, alphabet, coupable } = analyse.sms
    return (
      <span
        className="msg-ed-count"
        title={
          coupable
            ? `« ${coupable} » ne fait pas partie de l’alphabet GSM : le segment tombe de 160 à 70 caractères.`
            : capacite.motif
        }
      >
        {analyse.longueur} car. · {segments} SMS
        {alphabet === 'ucs2' && coupable && <span className="alerte"> · « {coupable} » coûte cher</span>}
      </span>
    )
  }

  if (capacite.limite !== null) {
    return (
      <span className={`msg-ed-count${analyse.depassement ? ' alerte' : ''}`} title={capacite.motif}>
        {analyse.longueur} / {capacite.limite} caractères
      </span>
    )
  }

  if (capacite.confort !== null) {
    return (
      <span className={`msg-ed-count${analyse.auDelaDuConfort ? ' avis' : ''}`} title={capacite.motif}>
        {analyse.longueur} caractères
        {analyse.auDelaDuConfort && ' · long pour un téléphone'}
      </span>
    )
  }

  return <span className="msg-ed-count">{analyse.longueur} caractères</span>
}
