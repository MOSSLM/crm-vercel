'use client'
import React from 'react'
import { XI } from './icons'

export function PlaceholderView({
  icon = 'bolt',
  title,
  desc,
}: {
  icon?: string
  title: string
  desc: string
}) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--bg-2)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: 420,
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 14,
          padding: '36px 32px',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'var(--accent-tint)',
            color: 'var(--accent-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <XI name={icon} className="ico-xl" />
        </span>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-.01em' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  )
}
