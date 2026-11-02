import Link from 'next/link';
import { ArrowUpRight, Construction } from 'lucide-react';

export default function FoundationPage({ title, description, planned }: { title: string; description: string; planned: string[] }) {
  return <><div className="foundation-eyebrow">SPRINT 1 / APPLICATION FOUNDATION</div><h1>{title}</h1><p className="foundation-intro">{description}</p><section className="placeholder-panel"><Construction size={30}/><span className="planned-tag">Route placeholder</span><h2>This screen is reserved for a later sprint.</h2><p>The page and navigation are ready. Its product features remain in the backlog.</p><ul>{planned.map(item => <li key={item}>{item}</li>)}</ul><Link href="/" className="foundation-link">Back to the foundation overview <ArrowUpRight size={15}/></Link></section></>;
}
