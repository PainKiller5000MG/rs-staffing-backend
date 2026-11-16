// Story tool: read only the stories you need, see what is done, generate test
// skeletons and check that every acceptance criterion has a test.
//
//   npm run story -- status                 progress by wave and module
//   npm run story -- next [n]               next n P0 stories not done, in build order
//   npm run story -- list M2 [--p0]         stories of a module with status
//   npm run story -- show M2-CLI-01 M2-SIT  one story, or every story with that prefix
//   npm run story -- section M4             list a module's sections (edge cases, API, tables...)
//   npm run story -- section M4 edge        print the sections whose heading matches
//   npm run story -- todo M2-CLI-01 --out test/api/clients.test.ts
//                                           append test.todo skeletons (one per AC)
//   npm run story -- check M2-CLI-01 ...    gate: every AC has a real test (or an n/a note)
//
// Done = a commit subject starts with the story id ("M2-CLI-01: ..." or a
// range "M1-USR-01..07: ..."). The stories doc is docs/USER-STORIES.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOC = join(ROOT, 'docs/USER-STORIES.md');

/** Build order from the doc's "Summary and P0 build order". */
const WAVES: Record<string, number> = {
  M1: 1, M2: 1, M3: 1, M12: 1,
  M14: 2, M5: 2, M7: 2, M13: 2,
  M8: 3, M11: 3,
  M6: 4, M4: 4, M10: 4, M9: 4, M16: 4,
  M15: 5,
};
const ORDER = Object.keys(WAVES);

type Story = {
  id: string;
  module: string;
  priority: string;
  title: string;
  text: string[]; // header line + body lines
  acs: string[];
  line: number;
};
type Section = { module: string; heading: string; start: number; end: number };

const lines = readFileSync(DOC, 'utf8').split('\n');

const HEADER = /^\*\*(M\d+-[A-Z]+-\d+)\s*(?:·\s*(P\d)\s*·\s*(.+?)\*\*|\((P\d)\)\s*[—-]\s*(.+?)\*\*)/;

function parse() {
  const stories: Story[] = [];
  const sections: Section[] = [];
  let module = '';
  let cur: Story | null = null;
  let sec: Section | null = null;
  const close = () => {
    if (cur) {
      while (cur.text.length && !cur.text.at(-1)!.trim()) cur.text.pop();
      stories.push(cur);
    }
    cur = null;
  };
  lines.forEach((l, i) => {
    const mod = l.match(/^## Module (\d+)/);
    if (l.startsWith('## ') || l.startsWith('### ')) {
      close();
      if (sec) sec.end = i;
      sec = null;
      if (mod) module = `M${mod[1]}`;
      else if (l.startsWith('## ')) module = '';
      if (l.startsWith('### ') && module) {
        sec = { module, heading: l.slice(4).trim(), start: i, end: lines.length };
        sections.push(sec);
      }
      return;
    }
    const h = l.match(HEADER);
    if (h) {
      close();
      const id = h[1]!;
      cur = {
        id,
        module: id.split('-')[0]!,
        priority: (h[2] ?? h[4])!,
        title: (h[3] ?? h[5])!.replace(/\.$/, ''),
        text: [l],
        acs: [],
        line: i + 1,
      };
      return;
    }
    if (!cur) return;
    // A paragraph after a blank line that isn't a bullet ends the story.
    if (l.trim() && !/^\s*[-*|>]|^\s{2,}/.test(l) && !cur.text.at(-1)?.trim()) {
      close();
      return;
    }
    cur.text.push(l);
    if (/^- /.test(l)) cur.acs.push(l.slice(2).trim());
    else if (/^\s+- /.test(l) && cur.acs.length) cur.acs[cur.acs.length - 1] += ` / ${l.trim().slice(2)}`;
  });
  close();
  return { stories, sections };
}

function doneIds(): Set<string> {
  const done = new Set<string>();
  let log = '';
  try {
    log = execFileSync('git', ['log', '--format=%s'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return done;
  }
  for (const subject of log.split('\n')) {
    const head = subject.split(':')[0] ?? '';
    for (const m of head.matchAll(/(M\d+-[A-Z]+-)(\d+)(?:\s*(?:\.\.|–|-|to)\s*(\d+))?/g)) {
      const [, prefix, a, b] = m;
      const from = Number(a);
      const to = b ? Number(b) : from;
      for (let n = from; n <= to; n++) done.add(`${prefix}${String(n).padStart(2, '0')}`);
    }
    // "M2-SET-01..06, 09, 10: ..." (a range or number after a comma, same prefix as the first id)
    const first = head.match(/^(M\d+-[A-Z]+-)/);
    if (first) {
      for (const m of head.matchAll(/,\s*(\d+)(?:\s*\.\.\s*(\d+))?/g)) {
        const from = Number(m[1]);
        const to = m[2] ? Number(m[2]) : from;
        for (let n = from; n <= to; n++) done.add(`${first[1]}${String(n).padStart(2, '0')}`);
      }
    }
    // "M1-USR-01, 04, 05: ..."
    const list = head.match(/^(M\d+-[A-Z]+-)\d+(?:\s*,\s*\d+)+/);
    if (list) for (const n of head.slice(list[1]!.length).split(',')) done.add(`${list[1]}${n.trim().padStart(2, '0')}`);
  }
  return done;
}

const { stories, sections } = parse();
const byId = new Map(stories.map((s) => [s.id, s]));
const done = doneIds();
const mark = (s: Story) => (done.has(s.id) ? '✓' : '·');
const sortKey = (s: Story) => [ORDER.indexOf(s.module), s.line] as const;
const ordered = [...stories].sort((a, b) => sortKey(a)[0] - sortKey(b)[0] || a.line - b.line);

function select(args: string[]): Story[] {
  const out: Story[] = [];
  for (const a of args) {
    const exact = byId.get(a);
    if (exact) out.push(exact);
    else {
      const prefix = a.endsWith('-') ? a : `${a}-`;
      const found = stories.filter((s) => s.id.startsWith(prefix));
      if (!found.length) fail(`no story matches ${a}`);
      out.push(...found);
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function testFiles(dir = join(ROOT, 'test')): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? testFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const [cmd = 'status', ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--out');

switch (cmd) {
  case 'status': {
    const p0 = stories.filter((s) => s.priority === 'P0');
    const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
    const d = (xs: Story[]) => xs.filter((s) => done.has(s.id)).length;
    console.log(`All: ${d(stories)}/${stories.length} (${pct(d(stories), stories.length)})   P0: ${d(p0)}/${p0.length} (${pct(d(p0), p0.length)})`);
    for (const w of [1, 2, 3, 4, 5]) {
      const mods = ORDER.filter((m) => WAVES[m] === w);
      const ws = p0.filter((s) => mods.includes(s.module));
      console.log(`\nWave ${w}  P0 ${d(ws)}/${ws.length}`);
      for (const m of mods) {
        const all = stories.filter((s) => s.module === m);
        const mp0 = all.filter((s) => s.priority === 'P0');
        console.log(`  ${m.padEnd(4)} P0 ${String(d(mp0)).padStart(2)}/${String(mp0.length).padEnd(3)} all ${d(all)}/${all.length}`);
      }
    }
    break;
  }
  case 'next': {
    const n = Number(args[0] ?? 10);
    for (const s of ordered.filter((s) => s.priority === 'P0' && !done.has(s.id)).slice(0, n)) {
      console.log(`${s.id.padEnd(12)} ${s.title}`);
    }
    break;
  }
  case 'list': {
    const xs = (args.length ? select(args) : ordered).filter((s) => !flags.has('--p0') || s.priority === 'P0');
    for (const s of xs) console.log(`${mark(s)} ${s.id.padEnd(12)} ${s.priority} ${s.title}  (${s.acs.length} AC)`);
    break;
  }
  case 'show': {
    if (!args.length) fail('usage: show <ID or prefix>...');
    for (const s of select(args)) {
      console.log(`${s.text[0]}\n${s.acs.map((a, i) => `  AC${i + 1}: ${a}`).join('\n')}`);
      const extra = s.text.slice(1).filter((l) => l.trim() && !/^\s*- /.test(l));
      if (extra.length) console.log(extra.join('\n'));
      console.log(`  [${done.has(s.id) ? 'DONE' : 'todo'} · doc line ${s.line}]\n`);
    }
    break;
  }
  case 'section': {
    const [m, q] = args;
    if (!m) fail('usage: section <Mn> [heading text]');
    const secs = sections.filter((s) => s.module === m);
    if (!q) {
      for (const s of secs) console.log(`${s.heading}  (${s.end - s.start} lines)`);
      break;
    }
    const hits = secs.filter((s) => s.heading.toLowerCase().includes(q.toLowerCase()));
    if (!hits.length) fail(`no section of ${m} matches "${q}"`);
    for (const s of hits) console.log(lines.slice(s.start, s.end).join('\n').trimEnd() + '\n');
    break;
  }
  case 'todo': {
    const outIdx = rest.indexOf('--out');
    const out = outIdx >= 0 ? rest[outIdx + 1] : undefined;
    const q = (t: string) => `'${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    let body = '';
    for (const s of select(args)) {
      body += `\ndescribe(${q(`${s.id} ${s.title}`)}, () => {\n`;
      s.acs.forEach((a, i) => (body += `  test.todo(${q(`${s.id} AC${i + 1}: ${a.length > 140 ? `${a.slice(0, 137)}...` : a}`)});\n`));
      if (!s.acs.length) body += `  test.todo(${q(`${s.id} AC1: ${s.title}`)});\n`;
      body += '});\n';
    }
    if (!out) {
      console.log(body);
      break;
    }
    const path = join(ROOT, out);
    if (!existsSync(path)) {
      appendFileSync(path, `import { describe, expect, test } from 'vitest';\n`);
    }
    appendFileSync(path, body);
    console.log(`appended ${select(args).length} stories to ${out}`);
    break;
  }
  case 'check': {
    if (!args.length) fail('usage: check <ID or prefix>...');
    const files = testFiles().map((p) => ({ p, src: readFileSync(p, 'utf8') }));
    const TITLE = /\b(?:test|it)(\.(?:only|skip|todo|fails|concurrent))?\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
    let bad = 0;
    for (const s of select(args)) {
      const n = Math.max(1, s.acs.length);
      const covered = new Set<number>();
      const problems: string[] = [];
      for (const { p, src } of files) {
        for (const m of src.matchAll(TITLE)) {
          const [, mod, , title = ''] = m;
          if (!title.includes(s.id)) continue;
          const nums = [...title.matchAll(/AC(\d+)/g)].map((x) => Number(x[1]));
          if (mod === '.todo') problems.push(`todo left: ${title.slice(0, 90)}`);
          else if (mod === '.skip' || mod === '.fails') problems.push(`${mod.slice(1)}: ${title.slice(0, 90)}`);
          else if (mod === '.only') problems.push(`.only in ${p.slice(ROOT.length)}`);
          else nums.forEach((x) => covered.add(x));
        }
        // "// M2-CLI-04 AC3 n/a: export is Module 11" counts as covered, with a reason.
        for (const m of src.matchAll(new RegExp(`${s.id}\\s+AC(\\d+)\\s+n/a:\\s*\\S`, 'g'))) covered.add(Number(m[1]));
      }
      const missing = Array.from({ length: n }, (_, i) => i + 1).filter((i) => !covered.has(i));
      const ok = !missing.length && !problems.length;
      if (!ok) bad++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${s.id} ${covered.size}/${n} AC covered`);
      for (const i of missing) console.log(`   missing AC${i}: ${(s.acs[i - 1] ?? s.title).slice(0, 110)}`);
      for (const x of problems) console.log(`   ${x}`);
    }
    process.exit(bad ? 1 : 0);
  }
  default:
    fail(`unknown command ${cmd}; see the header of scripts/stories.ts`);
}
