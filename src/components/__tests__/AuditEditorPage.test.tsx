import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditEditorPage } from '../AuditEditorPage';
import type { Audit } from '@/types';

// jsdom does not implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock next/navigation
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn() }) }));

// Mock sonner toast
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));

// Mock supabase — controls what getSession returns
const getSessionMock = jest.fn();
jest.mock('@/utils/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSessionMock() } },
}));

// Mock saveAudit
const saveAuditMock = jest.fn();
jest.mock('@/utils/auditApi', () => ({ saveAudit: (...args: unknown[]) => saveAuditMock(...args) }));

// Mock generateAuditHtml (not under test here)
jest.mock('@/utils/auditHtmlExport', () => ({ generateAuditHtml: () => '<html/>' }));

// Mock ResizablePanelGroup et al. (complex UI not under test)
jest.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));

// Mock all page editors
jest.mock('../audit/editors/Page1Editor', () => ({ Page1Editor: () => null }));
jest.mock('../audit/editors/Page2Editor', () => ({ Page2Editor: () => null }));
jest.mock('../audit/editors/Page3Editor', () => ({ Page3Editor: () => null }));
jest.mock('../audit/editors/Page4Editor', () => ({ Page4Editor: () => null }));
jest.mock('../audit/editors/Page5Editor', () => ({ Page5Editor: () => null }));
jest.mock('../audit/editors/Page6Editor', () => ({ Page6Editor: () => null }));
jest.mock('../AuditPreview', () => ({ AuditPreview: () => null }));

const makeAudit = (overrides?: Partial<Audit>): Audit => ({
  id: 'test-audit-id',
  opportunite_id: 'opp-1',
  content: { page1: {}, page2: {}, page3: {}, page4: {}, page5: {}, page6: {} } as Audit['content'],
  statut: 'draft',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

function renderEditor(audit: Audit) {
  render(<AuditEditorPage audit={audit} opportunityName="Test Opp" />);
}

describe('AuditEditorPage — handleSave guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows error toast and does not call saveAudit when audit id is missing', async () => {
    const audit = makeAudit({ id: '' });
    renderEditor(audit);

    // Simulate having unsaved changes so the button is enabled
    // The save button is disabled until hasChanges=true; trigger via the isReady toggle
    const markReadyBtn = screen.getByText(/Marquer prêt/i);
    fireEvent.click(markReadyBtn);

    const saveBtn = screen.getByText(/Sauvegarder/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Audit non initialisé'));
    });
    expect(saveAuditMock).not.toHaveBeenCalled();
  });

  it('shows session expired toast and does not call saveAudit when session is null', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const audit = makeAudit();
    renderEditor(audit);

    const markReadyBtn = screen.getByText(/Marquer prêt/i);
    fireEvent.click(markReadyBtn);

    const saveBtn = screen.getByText(/Sauvegarder/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Session expirée'));
    });
    expect(saveAuditMock).not.toHaveBeenCalled();
  });

  it('calls saveAudit and shows success toast on happy path', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    saveAuditMock.mockResolvedValue(undefined);

    const audit = makeAudit();
    renderEditor(audit);

    const markReadyBtn = screen.getByText(/Marquer prêt/i);
    fireEvent.click(markReadyBtn);

    const saveBtn = screen.getByText(/Sauvegarder/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveAuditMock).toHaveBeenCalledWith('test-audit-id', expect.anything(), expect.objectContaining({ statut: 'ready' }));
      expect(toastSuccess).toHaveBeenCalledWith('Audit sauvegardé');
    });
  });

  it('shows session expired toast when saveAudit throws SESSION_EXPIRED', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    saveAuditMock.mockRejectedValue(new Error('SESSION_EXPIRED'));

    const audit = makeAudit();
    renderEditor(audit);

    const markReadyBtn = screen.getByText(/Marquer prêt/i);
    fireEvent.click(markReadyBtn);

    const saveBtn = screen.getByText(/Sauvegarder/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Session expirée'));
    });
  });
});
