// Print only the contract models (and enums) you need, instead of reading the
// whole 70 KB contract.prisma.
//
//   npm run model -- Client Site        those models
//   npm run model -- --list             every model and enum name
//   npm run model -- RecordStatus       an enum works too
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const src = readFileSync(join(ROOT, 'src/prisma/contract.prisma'), 'utf8').split('\n');
const blocks = new Map<string, string[]>();
let ns = '';
for (let i = 0; i < src.length; i++) {
  const n = src[i]!.match(/^namespace (\w+)/);
  if (n) ns = n[1]!;
  const m = src[i]!.match(/^\s*(model|enum) (\w+) \{/);
  if (!m) continue;
  const out: string[] = [];
  // Keep the doc comments right above the block.
  for (let j = i - 1; j >= 0 && /^\s*\/\//.test(src[j]!); j--) out.unshift(src[j]!);
  let k = i;
  for (; k < src.length; k++) {
    out.push(src[k]!);
    if (/^\s*\}\s*$/.test(src[k]!)) break;
  }
  blocks.set(m[2]!, [`// ${m[1]} ${ns ? `${ns}.` : ''}${m[2]}`, ...out]);
  i = k;
}

const args = process.argv.slice(2);
if (!args.length || args[0] === '--list') {
  console.log([...blocks.keys()].join(' '));
} else {
  for (const a of args) {
    const b = blocks.get(a);
    console.log(b ? `${b.join('\n')}\n` : `// no model or enum named ${a}\n`);
  }
}
