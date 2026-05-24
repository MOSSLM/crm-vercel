'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { FormSubmission } from '@/types';
import { authedFetch } from "@/utils/authedFetch";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FormSubmission | null>(null);

  useEffect(() => {
    if (!id) return;
    authedFetch(`/api/forms/${id}/submissions`)
      .then((r) => r.json())
      .then((d) => { setSubmissions(Array.isArray(d) ? d : []); setLoading(false); });
  }, [id]);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* List */}
      <div className="w-96 flex-shrink-0 border-r border-white/10 flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-semibold">Soumissions</span>
          <span className="text-xs text-white/40">{submissions.length}</span>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-6 text-center text-white/40 text-sm">Chargement…</div>
          )}
          {!loading && submissions.length === 0 && (
            <div className="p-6 text-center text-white/40 text-sm">Aucune soumission</div>
          )}
          {submissions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${selected?.id === s.id ? 'bg-white/10' : ''}`}
            >
              <div className="text-sm font-medium">
                {s.contact?.name ?? s.contact?.email ?? 'Anonyme'}
              </div>
              {s.contact?.email && (
                <div className="text-xs text-white/40 mt-0.5">{s.contact.email}</div>
              )}
              <div className="text-xs text-white/30 mt-1">{formatDate(s.created_at)}</div>
              <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                s.status === 'received' ? 'bg-blue-500/20 text-blue-300' :
                s.status === 'processed' ? 'bg-green-500/20 text-green-300' :
                'bg-red-500/20 text-red-300'
              }`}>
                {s.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-auto p-6">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-white/30 text-sm">
            Sélectionnez une soumission pour voir les détails
          </div>
        ) : (
          <div className="max-w-2xl">
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-1">
                {selected.contact?.name ?? 'Soumission'}
              </h2>
              <div className="text-sm text-white/40">{formatDate(selected.created_at)}</div>
            </div>

            {/* Contact info */}
            {Object.keys(selected.contact ?? {}).length > 0 && (
              <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Contact</div>
                {Object.entries(selected.contact ?? {}).map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-1">
                    <span className="text-white/40 text-sm w-16 flex-shrink-0 capitalize">{k}</span>
                    <span className="text-sm">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Answers */}
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Réponses</div>
              {Object.entries(selected.answers ?? {}).map(([k, v]) => (
                <div key={k} className="py-2 border-b border-white/5 last:border-0">
                  <div className="text-xs text-white/40 font-mono mb-1">{k}</div>
                  <div className="text-sm">
                    {Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v ?? '')}
                  </div>
                </div>
              ))}
            </div>

            {selected.source_url && (
              <div className="mt-4 text-xs text-white/30">
                Source : <span className="font-mono">{selected.source_url}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
