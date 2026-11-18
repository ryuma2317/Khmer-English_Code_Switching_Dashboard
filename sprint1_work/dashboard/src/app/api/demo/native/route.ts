import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const dynamic = 'force-static';
export async function GET() {
  return new Response(await readFile(join(process.cwd(), 'fixtures', 'native_review_sample.json'), 'utf8'), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
