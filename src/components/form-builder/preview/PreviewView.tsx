'use client';

import { useState } from 'react';
import type { Form } from '@/types';
import { FormRuntime } from '../runtime/FormRuntime';
import { Lock, Monitor, Smartphone } from 'lucide-react';

interface PreviewViewProps {
  form: Form;
}

export function PreviewView({ form }: PreviewViewProps) {
  const [mode, setMode] = useState<'step' | 'scroll'>(form.settings?.renderMode ?? 'step');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const requiredCount = form.questions.filter((q) => q.required).length;

  return (
    <>
      <div className="pane" style={{ width: 220, flexShrink: 0 }}>
        <div className="pane-hd"><span>Aperçu</span></div>
        <div className="pane-body" style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 4px 8px' }}>Mode</div>
          <div style={{ display: 'flex', gap: 4, padding: '0 4px 16px' }}>
            <button
              onClick={() => setMode('step')}
              style={{
                flex: 1, height: 28, padding: '0 8px', borderRadius: 6,
                border: '1px solid ' + (mode === 'step' ? 'var(--accent)' : 'var(--border-2)'),
                background: mode === 'step' ? 'var(--accent-tint)' : 'var(--surface)',
                color: mode === 'step' ? 'var(--accent-2)' : 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
            >Étape</button>
            <button
              onClick={() => setMode('scroll')}
              style={{
                flex: 1, height: 28, padding: '0 8px', borderRadius: 6,
                border: '1px solid ' + (mode === 'scroll' ? 'var(--accent)' : 'var(--border-2)'),
                background: mode === 'scroll' ? 'var(--accent-tint)' : 'var(--surface)',
                color: mode === 'scroll' ? 'var(--accent-2)' : 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
            >Scroll</button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 4px 8px' }}>Appareil</div>
          <div style={{ display: 'flex', gap: 4, padding: '0 4px 16px' }}>
            <button
              onClick={() => setDevice('desktop')}
              style={{
                flex: 1, height: 28, padding: '0 8px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: '1px solid ' + (device === 'desktop' ? 'var(--accent)' : 'var(--border-2)'),
                background: device === 'desktop' ? 'var(--accent-tint)' : 'var(--surface)',
                color: device === 'desktop' ? 'var(--accent-2)' : 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
            ><Monitor size={13} />Desktop</button>
            <button
              onClick={() => setDevice('mobile')}
              style={{
                flex: 1, height: 28, padding: '0 8px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: '1px solid ' + (device === 'mobile' ? 'var(--accent)' : 'var(--border-2)'),
                background: device === 'mobile' ? 'var(--accent-tint)' : 'var(--surface)',
                color: device === 'mobile' ? 'var(--accent-2)' : 'var(--text-2)',
                fontSize: 12, cursor: 'pointer',
              }}
            ><Smartphone size={13} />Mobile</button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 4px 8px', borderTop: '1px solid var(--border)' }}>État</div>
          <div style={{ padding: '0 4px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <div>Questions : <b style={{ color: 'var(--text)' }}>{form.questions.length}</b></div>
            <div>Règles : <b style={{ color: 'var(--text)' }}>{form.logic.length}</b></div>
            <div>Obligatoires : <b style={{ color: 'var(--text)' }}>{requiredCount}</b></div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Browser chrome */}
        <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <div style={{ flex: 1, height: 20, background: 'var(--bg-2)', borderRadius: 10, padding: '0 10px', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: '20px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, margin: '0 8px' }}>
            <Lock size={10} />
            {form.slug ? `form.crm/${form.slug}` : 'form.crm/preview'}
          </div>
        </div>

        {/* Viewport */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16 }}>
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              boxShadow: '0 6px 24px rgba(20,18,14,.08), 0 1px 0 var(--border)',
              overflow: 'hidden',
              width: device === 'mobile' ? 380 : '100%',
              minHeight: device === 'mobile' ? 720 : '100%',
              flex: device === 'mobile' ? '0 0 auto' : undefined,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <FormRuntime form={form} mode={mode} device={device} embedded />
          </div>
        </div>
      </div>
    </>
  );
}
