'use client'
// MessageEditor — écrire un message avec ses variables, et voir ce qui partira.
//
// CE QUE ÇA REMPLACE
// Le builder listait les variables disponibles dans un panneau replié, à
// recopier à la main. Une faute de frappe (`{{company_nam}}`) ne se voyait
// nulle part : `interpolate` remplace par du vide toute clé inconnue, donc le
// message partait amputé et personne ne l'apprenait avant le prospect.
//
// Ici les variables s'insèrent au curseur, et l'aperçu montre le rendu sur une
// vraie entreprise — avec, en creux, ce qui partira en blanc.
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { XI } from './icons'
import { VARIABLES, interpolateVars, insertVariable, missingVariables, type VarBag } from '@/lib/automations/variables'

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
}: {
  value: string
  onChange: (v: string) => void
  vars: VarBag
  rows?: number
  placeholder?: string
  disabled?: boolean
  previewLabel?: string
  previewOn?: string | null
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [showPreview, setShowPreview] = useState(true)

  const insert = useCallback(
    (key: string) => {
      const el = ref.current
      // Sans textarea monté (ou sans focus), on ajoute à la fin plutôt que de
      // ne rien faire : un bouton qui ne réagit pas passe pour cassé.
      const start = el?.selectionStart ?? value.length
      const end = el?.selectionEnd ?? start
      const { text, cursor } = insertVariable(value, key, start, end)
      onChange(text)
      // Replacer le curseur derrière l'insertion, sinon deux clics de suite
      // empilent les variables au même endroit, dans l'ordre inverse.
      requestAnimationFrame(() => {
        el?.focus()
        el?.setSelectionRange(cursor, cursor)
      })
    },
    [value, onChange],
  )

  const rendu = useMemo(() => interpolateVars(value, vars), [value, vars])
  const manquantes = useMemo(() => missingVariables(value, vars), [value, vars])

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
        <span className="msg-ed-count">{value.length} caractères</span>
      </div>

      {showPreview && (
        <>
          <div className="msg-ed-preview" aria-live="polite">
            {rendu.trim() ? rendu : <span className="vide">Rien à afficher — le message est vide.</span>}
          </div>
          {manquantes.length > 0 && (
            // Le message partirait quand même, avec des trous. C'est le seul
            // moment où on peut encore l'empêcher.
            <div className="msg-ed-missing">
              <XI name="x" className="ico-xs" />
              <span>
                {manquantes.length === 1 ? 'Cette variable partira vide' : 'Ces variables partiront vides'} :{' '}
                {manquantes.map((k) => VARIABLES.find((v) => v.key === k)?.desc ?? k).join(', ')}.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
