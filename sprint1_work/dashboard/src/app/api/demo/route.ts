import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const dynamic = 'force-static';
export async function GET() {
  const fixture = await readFile(join(process.cwd(), 'fixtures', 'synthetic_edge_cases.json'), 'utf8');
  return new Response(fixture, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
