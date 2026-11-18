import { EMPTY, type Workspace } from './workspace';
export const WORKSPACE_DB = 'kh-en-corpus-sprint2';
const STORE = 'workspace';
const failure = 'Data could not be saved. Storage may be full or blocked. Previous saved data is unchanged.';
const conflict = 'Another tab saved newer changes. Reload before retrying; the newer saved workspace is unchanged.';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
const optionalString = (v: unknown) => v === null || typeof v === 'string';
const validSeconds = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

/** Validate persisted rows before publishing them to React. */
export function isWorkspace(v: unknown): v is Workspace {
  if (!object(v) || v.version !== 1 || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || typeof v.selectedProject !== 'string') return false;
  if (!['projects', 'recordings', 'members', 'mappings', 'targets', 'batches'].every(k => Array.isArray(v[k]))) return false;
  const projects = v.projects as unknown[], records = v.recordings as unknown[];
  if (!projects.every(p => object(p) && typeof p.key === 'string' && typeof p.id === 'string' && typeof p.name === 'string' && ['speech-platform', 'label-studio'].includes(String(p.source)) && ['complete', 'partial', 'unknown', 'approved-only'].includes(String(p.coverage)) && optionalString(p.lastImport))) return false;
  const projectKeys = new Set(projects.map(p => (p as { key: string }).key));
  if (v.selectedProject && !projectKeys.has(v.selectedProject)) return false;
  if (!records.every(r => object(r) && ['key', 'projectKey', 'taskId', 'audio', 'transcript', 'state', 'topic', 'speaker'].every(k => typeof r[k] === 'string') && projectKeys.has(String(r.projectKey)) && ['speech-platform', 'label-studio'].includes(String(r.source)) && validSeconds(r.seconds) && ['collector', 'annotator', 'assignedAnnotator', 'updatedAt'].every(k => optionalString(r[k])) && typeof r.completed === 'boolean' && typeof r.approved === 'boolean' && (!r.approved || (r.completed && r.state === 'approved')) && Array.isArray(r.annotations) && Array.isArray(r.history) && strings(r.issues))) return false;
  if (!(v.members as unknown[]).every(m => object(m) && typeof m.id === 'string' && typeof m.name === 'string')) return false;
  if (!(v.mappings as unknown[]).every(m => object(m) && ['projectKey', 'actor', 'memberId'].every(k => typeof m[k] === 'string') && ['collector', 'annotator'].includes(String(m.role)))) return false;
  if (!(v.targets as unknown[]).every(t => object(t) && typeof t.projectKey === 'string' && typeof t.memberId === 'string' && validSeconds(t.seconds) && typeof t.confirmed === 'boolean' && ['collected', 'completed', 'approved'].includes(String(t.basis)))) return false;
  if (!(v.batches as unknown[]).every(b => object(b) && ['id', 'filename', 'at', 'checksum'].every(k => typeof b[k] === 'string') && ['sourceRows', 'unique', 'duplicates', 'rejected', 'added', 'updated', 'unchanged', 'stale', 'conflicts'].every(k => Number.isSafeInteger(b[k]) && Number(b[k]) >= 0) && strings(b.projectKeys) && strings(b.issues))) return false;
  return new Set(records.map(r => (r as { key: string }).key)).size === records.length;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Browser storage is unavailable. Enable local storage access and retry.')); return; }
    const request = indexedDB.open(WORKSPACE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(new Error('Local database could not be opened. Retry loading your workspace.'));
    request.onblocked = () => reject(new Error('Another tab is blocking the database. Close it and retry.'));
  });
}
export async function loadWorkspace(): Promise<Workspace> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get('current');
    let result: unknown;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => {
      if (result === undefined) resolve(structuredClone(EMPTY));
      else if (isWorkspace(result)) resolve(result);
      else reject(new Error('Saved workspace is damaged or unsupported. It has been preserved. Retry loading, or explicitly reset from your original exports.'));
    };
    transaction.onabort = transaction.onerror = () => reject(new Error('Saved workspace could not be read. Its data has not been replaced.'));
  }); } finally { db.close(); }
}
/** Compare revisions and persist every field in one read/write transaction. */
export async function saveWorkspace(workspace: Workspace, expectedRevision: number): Promise<Workspace> {
  if (!isWorkspace(workspace)) throw new Error('Invalid workspace; the previous saved snapshot is unchanged.');
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get('current');
    const next = { ...workspace, revision: expectedRevision + 1 };
    let reason = failure;
    request.onsuccess = () => {
      const current: unknown = request.result;
      if (current !== undefined && !isWorkspace(current)) { reason = 'Stored data is unsupported. Reload or explicitly reset it before saving.'; transaction.abort(); return; }
      if ((current === undefined ? 0 : (current as Workspace).revision) !== expectedRevision) { reason = conflict; transaction.abort(); return; }
      try { store.put(next, 'current'); } catch { transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = transaction.onerror = () => reject(new Error(reason));
  }); } finally { db.close(); }
}
/** Persist a revisioned empty snapshot so stale tabs cannot resurrect pre-reset data. */
export async function resetWorkspace(expectedRevision: number | null): Promise<Workspace> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get('current');
    let next: Workspace;
    let reason = 'Reset failed. The previous saved workspace is unchanged.';
    request.onsuccess = () => {
      const current: unknown = request.result;
      if (expectedRevision === null ? isWorkspace(current) : (current !== undefined && !isWorkspace(current)) || (current === undefined ? 0 : (current as Workspace).revision) !== expectedRevision) {
        reason = conflict; transaction.abort(); return;
      }
      const revision = object(current) && Number.isSafeInteger(current.revision) && Number(current.revision) >= 0 ? Number(current.revision) : 0;
      next = { ...structuredClone(EMPTY), revision: revision + 1 };
      try { store.put(next, 'current'); } catch { transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = transaction.onerror = () => reject(new Error(reason));
  }); } finally { db.close(); }
}
