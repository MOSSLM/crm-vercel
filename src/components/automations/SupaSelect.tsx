'use client'
// SupaSelect.tsx — dropdown « Supabase-aware » lié aux données de référence.
// Porté depuis claude design/automations-atoms.jsx, branché sur RefData réel.
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { XI } from './icons'
import { useRefData } from './ref-data'
import { ENTITY_FIELDS } from './node-catalog'

type SelectRow = { id: string | number; name: string; color?: string | null; [k: string]: unknown }
type RefTable = 'pipelines' | 'stages' | 'users' | 'email_templates' | 'whatsapp_templates' | 'call_scripts' | 'task_types' | 'tags' | 'forms'

const TABLE_META: Record<RefTable, { schema: string; name: string }> = {
  pipelines: { schema: 'public', name: 'pipelines' },
  stages: { schema: 'public', name: 'etapes_pipeline' },
  users: { schema: 'public', name: 'user_profiles' },
  email_templates: { schema: 'public', name: 'email_templates' },
  whatsapp_templates: { schema: 'public', name: 'whatsapp_templates' },
  call_scripts: { schema: 'public', name: 'call_scripts' },
  task_types: { schema: 'public', name: 'automation_task_types' },
  tags: { schema: 'public', name: 'crm_tags' },
  forms: { schema: 'public', name: 'forms' },
}

function metaFor(table: RefTable, row: SelectRow): string | null {
  if (table === 'stages' && row.position != null) return `pos ${row.position}`
  if (table === 'users' && row.role) return String(row.role)
  if (table === 'email_templates' && row.subject) return String(row.subject)
  return null
}

export function SupaSelect({
  table,
  value,
  onChange,
  placeholder = 'Sélectionner…',
  filterFK = null,
  icon = 'table',
  disabled = false,
  allowClear = true,
}: {
  table: RefTable
  value: string | number | null | undefined
  onChange?: (id: string | number | null) => void
  placeholder?: string
  filterFK?: Record<string, string | number> | null
  icon?: string
  disabled?: boolean
  allowClear?: boolean
}) {
  const ref = useRefData()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 })

  const allRows = (ref[table] ?? []) as unknown as SelectRow[]
  const meta = TABLE_META[table]

  const rows = useMemo(() => {
    let r = allRows
    if (filterFK) {
      for (const [k, v] of Object.entries(filterFK)) {
        r = r.filter((row) => row[k] === v)
      }
    }
    if (q) {
      const needle = q.toLowerCase()
      r = r.filter((row) => (row.name || '').toLowerCase().includes(needle))
    }
    return r
  }, [allRows, filterFK, q])

  const selected = allRows.find((r) => String(r.id) === String(value))

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="supa-select"
        data-open={open ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lead">
          <XI name={icon} className="ico-sm" />
        </span>
        <span className="vals">
          {selected ? (
            <>
              {selected.color && (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: String(selected.color),
                    flexShrink: 0,
                    border: '1px solid rgba(0,0,0,.06)',
                  }}
                />
              )}
              <span className="main">{selected.name}</span>
              {metaFor(table, selected) && <span className="meta">{metaFor(table, selected)}</span>}
            </>
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
        </span>
        {allowClear && selected && (
          <span
            className="clear"
            role="button"
            title="Effacer"
            onClick={(e) => {
              e.stopPropagation()
              onChange?.(null)
            }}
          >
            <XI name="x" className="ico-xs" />
          </span>
        )}
        <XI name="chevdown" className="ico-xs chev" />
      </button>

      {open &&
        createPortal(
          <div className="au-skin">
            <div ref={popRef} className="supa-pop" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
              <div className="src">
                <XI name="database" className="ico-xs" />
                <span className="schema">{meta.schema}.</span>
                <span className="name">{meta.name}</span>
                <span className="rowcount">
                  {rows.length}/{allRows.length}
                </span>
              </div>
              <div className="search-wrap">
                <XI name="search" className="ico-sm" />
                <input
                  autoFocus
                  placeholder={`Filtrer dans ${meta.name}…`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rows[0]) {
                      onChange?.(rows[0].id)
                      setOpen(false)
                    }
                  }}
                />
              </div>
              <div className="opts">
                {rows.length === 0 && <div className="empty-row">Aucun résultat</div>}
                {rows.map((row) => (
                  <div
                    key={String(row.id)}
                    className="opt"
                    aria-selected={String(row.id) === String(value)}
                    onClick={() => {
                      onChange?.(row.id)
                      setOpen(false)
                    }}
                  >
                    {row.color && <span className="swatch" style={{ background: String(row.color) }} />}
                    <span className="label">{row.name}</span>
                    {metaFor(table, row) && <span className="meta">{metaFor(table, row)}</span>}
                    {String(row.id) === String(value) && (
                      <XI name="check" className="ico-sm" style={{ color: 'var(--accent)' }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="ft">
                <XI name="database" className="ico-xs" />
                <span>
                  lié à{' '}
                  <b>
                    {meta.schema}.{meta.name}
                  </b>
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <kbd>↵</kbd> sélectionner
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

// ── FieldSelect — choisit une colonne d'une entité ────────────────────────
export function FieldSelect({
  entity,
  value,
  onChange,
}: {
  entity: string
  value?: string
  onChange?: (v: string) => void
}) {
  const fields = ENTITY_FIELDS[entity] || []
  return (
    <select
      className="select"
      style={{ height: 26, fontSize: 12 }}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
    >
      <option value="">— champ —</option>
      {fields.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  )
}
