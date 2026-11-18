'use client';

import { useState, type ChangeEvent } from 'react';
import { FileJson, UploadCloud, ArrowRight, CheckCircle2, History } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { applyPreview, MAX_FILE_BYTES, previewImport, type Coverage, type ImportOptions, type Preview, type Source } from '../../lib/workspace';
import { Badge, PageHeading, Stat, Tip } from '../../components/UI';

const initial: ImportOptions = { filename: '', projectId: '', projectName: '', coverage: 'unknown', source: 'speech-platform' };
export default function ImportPage() {
  const { data, commit, saving, ready } = useWorkspace();
  const [options, setOptions] = useState(initial);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const change = (patch: Partial<ImportOptions>) => { setOptions(current => ({ ...current, ...patch })); setPreview(null); setAcknowledged(false); setError(''); };
  async function prepare(text = content, opts = options) {
    setChecking(true); setAcknowledged(false); setError('');
    try {
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      const next = previewImport(text, { ...opts, checksum }, data);
      setPreview(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This file could not be previewed.'); }
    finally { setChecking(false); }
  }
  async function receive(file?: File) {
    if (!file) return;
    setPreview(null); setAcknowledged(false); setError('');
    if (!/\.(json|jsonl)$/i.test(file.name)) { setError('Choose a .json or .jsonl file.'); setContent(''); return; }
    if (file.size > MAX_FILE_BYTES) { setError('File exceeds the 20 MB local import limit.'); setContent(''); return; }
    try { const text = await file.text(); setContent(text); setOptions(current => ({ ...current, filename: file.name })); }
    catch { setError('The selected file could not be read.'); }
  }
  async function sample(native = false) {
    setChecking(true); setAcknowledged(false); setError('');
    try {
      const response = await fetch(native ? '/api/demo/native' : '/api/demo');
      if (!response.ok) throw new Error('The bundled example could not be loaded.');
      const text = await response.text();
      const next = native ? { filename: 'native_review_sample.json', projectId: '', projectName: 'Synthetic native review', coverage: 'complete' as Coverage, source: 'speech-platform' as Source } : { filename: 'synthetic_edge_cases.json', projectId: '42', projectName: 'Synthetic compatibility demonstration', coverage: 'unknown' as Coverage, source: 'label-studio' as Source };
      setOptions(next); setContent(text); await prepare(text, next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Example unavailable.'); }
    finally { setChecking(false); }
  }
  async function confirm() {
    if (!preview?.ok || (preview.batch.rejected > 0 && !acknowledged)) return;
    const ok = await commit(current => {
      const fresh = previewImport(content, { ...options, checksum: preview.batch.checksum }, current);
      return applyPreview(current, { ...fresh, batch: { ...fresh.batch, id: preview.batch.id, at: preview.batch.at } });
    }, 'Snapshot imported. Open Overview to inspect the updated totals.');
    if (ok) { setPreview(null); setContent(''); setOptions(current => ({ ...current, filename: '' })); }
  }
  const disable = saving || checking || !ready;
  return <><PageHeading eyebrow="START WITH THE SOURCE" title="Import a snapshot" description="Inspect your export before adding it to the local workspace." action={<div className="actions"><button className="button" onClick={() => void sample(true)} disabled={disable}><FileJson size={16}/>Preview native example</button><button className="button" onClick={() => void sample()} disabled={disable}>Preview compatibility example</button></div>}/>
    <div className="import-grid"><section className="panel"><div className="step-label">01 <span>Choose the source and context</span></div><div className="form-grid"><label>Source format<select aria-label="Source format" value={options.source} disabled={disable} onChange={event => change({ source: event.target.value as Source })}><option value="speech-platform">Speech Annotation Platform</option><option value="label-studio">Label Studio compatibility</option></select></label><label>Project ID <span className="muted">if not in the file</span><input value={options.projectId} disabled={disable} onChange={event => change({ projectId: event.target.value })} placeholder={options.source === 'label-studio' ? 'Numeric project ID' : 'Native string project ID'}/></label><label>Project display name<input value={options.projectName} maxLength={100} disabled={disable} onChange={event => change({ projectName: event.target.value })} placeholder="Optional descriptive name"/></label><label>Declared source coverage<select aria-label="Declared source coverage" value={options.coverage} disabled={disable} onChange={event => change({ coverage: event.target.value as Coverage })}><option value="unknown">Unknown</option><option value="partial">Partial snapshot</option><option value="complete">Complete snapshot (declared)</option></select></label></div><p className="helper">Native training manifests are always labelled approved-only. A paginated project response is complete only when its page metadata accounts for every task.</p>
      <div className="dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disable) void receive(event.dataTransfer.files[0]); }}><UploadCloud size={30}/><strong>{options.filename || 'Drop an export here'}</strong><span>JSON or JSONL · up to 20 MB · no audio upload</span><label className="button file-button">Choose file<input aria-label="Choose export file" type="file" accept=".json,.jsonl" disabled={disable} onChange={(event: ChangeEvent<HTMLInputElement>) => { void receive(event.target.files?.[0]); event.target.value = ''; }}/></label></div>
      <div className="actions"><button className="button primary" onClick={() => void prepare()} disabled={!content || disable}>{checking ? 'Validating…' : 'Preview file'}<ArrowRight size={16}/></button>{content && <button className="button" disabled={disable} onClick={() => { setContent(''); setPreview(null); setAcknowledged(false); setError(''); setOptions(current => ({ ...current, filename: '' })); }}>Cancel without saving</button>}</div>{error && <p role="alert" className="field-error">{error}</p>}</section>
      <aside className="panel import-explainer"><span className="small-label">A SAFE IMPORT WORKFLOW</span><h2>Preview first.<br/>Save when you’re ready.</h2><p>The preview explains accepted rows, repeated identities, stale updates and missing metadata. Cancelling a preview leaves your saved workspace unchanged.</p><ul className="check-list"><li><CheckCircle2 size={17}/>Each recording counts once</li><li><CheckCircle2 size={17}/>Partial exports retain existing tasks</li><li><CheckCircle2 size={17}/>Unknown duration stays unknown</li><li><CheckCircle2 size={17}/>Collector and annotator stay separate</li></ul><Tip>Native exports may omit duration, project identity or approval evidence. Provide explicit context and keep unavailable fields visible.</Tip></aside></div>
    {preview && <section className="panel preview-panel" aria-label="Import preview"><div className="section-title"><div><div className="step-label">02 <span>Review the proposed changes</span></div><h2>{options.filename}</h2></div><Badge value={preview.ok ? (preview.batch.rejected ? 'partial' : 'ready') : 'invalid'}/></div><div className="stats-grid compact"><Stat label="Source rows" value={preview.batch.sourceRows} detail={`${preview.batch.duplicates} repeated identities`}/><Stat label="Unique recordings" value={preview.batch.unique} detail={`${preview.batch.rejected} rejected rows`}/><Stat label="Added / updated" value={`${preview.batch.added} / ${preview.batch.updated}`} detail={`${preview.batch.unchanged} unchanged`}/><Stat label="Retained stored evidence" value={preview.batch.stale + preview.batch.conflicts} detail={`${preview.batch.stale} older · ${preview.batch.conflicts} conflicts`}/></div>
      {preview.errors.map(message => <p role="alert" className="field-error" key={message}>{message}</p>)}<div className="preview-warnings"><strong>{preview.records.filter(record => record.seconds === null).length} unknown durations · {preview.records.filter(record => !record.collector).length} missing collectors</strong><p>These fields remain visible and are never silently estimated.</p></div>{preview.batch.issues.length > 0 && <details open><summary>Inspect {preview.batch.issues.length} source issues</summary><ul className="issue-list">{preview.batch.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>}<div className="candidate-table"><table><caption>Candidate records and approval evidence</caption><thead><tr><th>Recording ID</th><th>Project</th><th>Duration seconds</th><th>Annotation state</th><th>Counts as approved</th></tr></thead><tbody>{preview.records.slice(0,20).map(record => <tr key={record.key}><td>{record.taskId}</td><td>{record.projectKey}</td><td>{record.seconds ?? 'Unknown'}</td><td>{record.state}</td><td>{record.approved ? 'Yes' : 'No'}</td></tr>)}</tbody></table><p className="helper">Showing up to 20 of {preview.records.length} candidate records. Coverage: {preview.projects.map(p => p.coverage).join(', ') || 'unknown'}. Only approved annotations qualify for the target; unavailable approval stays unknown.</p></div>{preview.batch.rejected > 0 && <label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>I reviewed the rejected rows and want to import only supported records.</label>}<div className="actions"><button className="button primary" disabled={!preview.ok || disable || (preview.batch.rejected > 0 && !acknowledged)} onClick={() => void confirm()}>Confirm import</button><button className="button" disabled={disable} onClick={() => setPreview(null)}>Cancel preview</button></div></section>}
    <section className="panel"><div className="section-title"><div><span className="small-label">A RECORD OF EVERY CONFIRMED SNAPSHOT</span><h2><History size={19}/>Import history</h2></div><span className="muted">{data.batches.length} saved batches</span></div>{!data.batches.length ? <p className="muted">Confirmed imports will appear here. Failed previews never replace the latest successful snapshot.</p> : <div className="batch-history">{[...data.batches].reverse().map(batch => <details key={batch.id}><summary><span><strong>{batch.filename}</strong><small>{new Date(batch.at).toLocaleString()}</small></span><span className="muted">{batch.added} added · {batch.updated} updated · {batch.rejected} rejected</span></summary><dl className="detail-grid"><div><dt>Source / unique / duplicates</dt><dd>{batch.sourceRows} / {batch.unique} / {batch.duplicates}</dd></div><div><dt>Unchanged / stale / conflicts</dt><dd>{batch.unchanged} / {batch.stale} / {batch.conflicts}</dd></div></dl><p className="checksum">SHA-256 {batch.checksum || 'not supplied'}</p>{batch.issues.length ? <ul className="issue-list">{batch.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p>No source conflicts or rejected rows.</p>}</details>)}</div>}</section>
  </>;
}
