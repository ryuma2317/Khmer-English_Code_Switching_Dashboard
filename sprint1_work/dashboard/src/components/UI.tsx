'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Database, Info } from 'lucide-react';
import { hours } from '../lib/workspace';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function Stat({ label, value, detail, accent = false }: { label: string; value: ReactNode; detail: string; accent?: boolean }) {
  return <article className={`stat ${accent ? 'stat-accent' : ''}`}><p>{label}</p><strong>{value}</strong><span>{detail}</span></article>;
}
export function Empty({ title = 'Your workspace starts here', children }: { title?: string; children?: ReactNode }) {
  return <section className="empty"><div className="empty-icon"><Database size={28}/></div><h2>{title}</h2><p>{children ?? 'Preview an export to begin tracking recordings, contributions and the work that remains.'}</p><Link className="button primary" href="/import">Import a snapshot <ArrowUpRight size={16}/></Link></section>;
}
export function Tip({ children }: { children: ReactNode }) { return <div className="tip"><Info size={17}/><div>{children}</div></div>; }
export function Hours({ seconds }: { seconds: number | null }) { return seconds === null ? <span className="muted">Unknown</span> : <span className="numeric">{hours(seconds)} <span className="muted">h</span></span>; }
export function Badge({ value }: { value: string }) { return <span className={`badge ${['completed', 'approved', 'complete'].includes(value) ? 'good' : ['cancelled', 'rejected', 'unknown', 'partial', 'approved-only'].includes(value) ? 'warn' : ''}`}>{value.replaceAll('-', ' ').replaceAll('_', ' ')}</span>; }
export function ConfirmDialog({ title, children, onCancel, onConfirm, disabled = false }: { title: string; children: ReactNode; onCancel: () => void; onConfirm: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onCancel(); }}><h2>{title}</h2><p>{children}</p><div className="actions"><button autoFocus onClick={onCancel} className="button">Cancel</button><button className="button danger" disabled={disabled} onClick={onConfirm}>Confirm reset</button></div></dialog>;
}
