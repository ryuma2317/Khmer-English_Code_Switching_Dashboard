'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioLines } from 'lucide-react';

const links = [{ href: '/', label: 'Overview' }, { href: '/import', label: 'Import' }, { href: '/members', label: 'Members' }, { href: '/recordings', label: 'Recordings' }];

export default function SprintNavigation() {
  const pathname = usePathname();
  return <header className="foundation-header"><div className="foundation-header-inner"><Link className="foundation-brand" href="/"><span><AudioLines size={24}/></span><div>Corpus<small>KHMER + ENGLISH</small></div></Link><nav aria-label="Main navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}</nav><span className="sprint-tag">Sprint 1 foundation</span></div></header>;
}
