'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { EMPTY, type Workspace } from '../lib/workspace';
import { loadWorkspace, saveWorkspace, resetWorkspace } from '../lib/storage';
interface WorkspaceAPI {
  data: Workspace; loading: boolean; saving: boolean; ready: boolean; error: string; notice: string;
  commit: (update: (current: Workspace) => Workspace, success: string) => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => Promise<boolean>;
}
const Context = createContext<WorkspaceAPI | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(() => structuredClone(EMPTY));
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const current = useRef(data), locked = useRef(false), readable = useRef(false);
  const reload = useCallback(async () => {
    if (locked.current) return;
    locked.current = true; setLoading(true); setError(''); setNotice(''); readable.current = false; setReady(false);
    try { const stored = await loadWorkspace(); current.current = stored; setData(stored); readable.current = true; setReady(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Local data could not be loaded.'); }
    finally { setLoading(false); locked.current = false; }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const commit = useCallback(async (update: (workspace: Workspace) => Workspace, success: string) => {
    if (locked.current || !readable.current) return false;
    locked.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const next = update(current.current);
      const saved = await saveWorkspace(next, current.current.revision);
      current.current = saved; setData(saved); setNotice(success);
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Change could not be saved.'); return false; }
    finally { locked.current = false; setSaving(false); }
  }, []);
  const reset = useCallback(async () => {
    if (locked.current) return false;
    locked.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const cleared = await resetWorkspace(readable.current ? current.current.revision : null);
      current.current = cleared; setData(cleared); readable.current = true; setReady(true);
      setNotice('Workspace reset. Your original export files are unchanged.'); return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Reset failed.'); return false; }
    finally { locked.current = false; setSaving(false); }
  }, []);
  return <Context.Provider value={{ data, loading, saving, ready, error, notice, commit, reload, reset }}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
