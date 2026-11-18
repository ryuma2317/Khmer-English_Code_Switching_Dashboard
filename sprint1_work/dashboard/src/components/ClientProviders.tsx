'use client';
import { useState, type ReactNode } from 'react';
import { WorkspaceProvider, useWorkspace } from '../context/WorkspaceContext';
import { ConfirmDialog } from './UI';
import { APPROVAL_POLICY } from '../lib/workspace';
function WorkspaceControls() {
  const { data, loading, saving, ready, error, notice, commit, reload, reset } = useWorkspace();
  const [confirmReset, setConfirmReset] = useState(false);
  return <section className="workspace-controls" aria-label="Local workspace controls">
    <div className="workspace-toolbar"><strong>{loading ? 'Restoring saved workspace…' : saving ? 'Saving workspace…' : data.recordings.length + ' saved recordings'}</strong>
      <select aria-label="Current project" value={data.selectedProject} disabled={!ready || loading || saving || !data.projects.length} onChange={e => { const key = e.target.value; void commit(current => ({ ...current, selectedProject: key }), 'Project selection saved.'); }}><option value="">Select a project</option>{data.projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
      <button className="button" disabled={loading || saving} onClick={() => void reload()}>Reload saved workspace</button>
      <button className="button danger" disabled={loading || saving} onClick={() => setConfirmReset(true)}>Reset local workspace</button></div>
    <p className="workspace-policy">{APPROVAL_POLICY} Source exports without approval evidence stay Unknown.</p>
    {loading && <p role="status">Loading records and settings from this browser.</p>}
    {error && <div className="alert error" role="alert"><strong>Workspace needs attention.</strong> {error} Retry the action or reload the saved snapshot. Unsaved candidates remain available on the import page.</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {confirmReset && <ConfirmDialog title="Reset local workspace?" onCancel={() => setConfirmReset(false)} onConfirm={() => void reset().then(ok => { if (ok) setConfirmReset(false); })} disabled={saving}>This clears saved records, project selection, supported settings and import history from this browser. Cancel or Escape keeps them. Keep your original exports.</ConfirmDialog>}
  </section>;
}
export default function ClientProviders({ children }: { children: ReactNode }) {
  return <WorkspaceProvider><WorkspaceControls />{children}</WorkspaceProvider>;
}
