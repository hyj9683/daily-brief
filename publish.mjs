#!/usr/bin/env node
/* ── 오늘의 경제 · 발행 스크립트 ───────────────────────────────
   data/latest.json 을 검사하고, 같은 내용을 지난 호로 보관한 뒤
   지난 호 목록(data/index.json)을 다시 만듭니다.

     node publish.mjs                 # 검사 + 보관 + 목록 갱신
     node publish.mjs --push          # 위 작업 후 git commit & push
     node publish.mjs new.json        # new.json 을 latest.json 으로 올린 뒤 발행

   ───────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const ARCHIVE = join(DATA, 'archive');
const LATEST = join(DATA, 'latest.json');

const args = process.argv.slice(2);
const push = args.includes('--push');
const source = args.find((a) => !a.startsWith('--'));

const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };
const ok = (msg) => console.log('✓ ' + msg);

/* ── 1. 새 원고를 받았으면 latest.json 으로 올린다 ─────────── */
if (source) {
  const src = resolve(process.cwd(), source);
  if (!existsSync(src)) die(`원본 파일이 없습니다: ${src}`);
  writeFileSync(LATEST, readFileSync(src, 'utf8'), 'utf8');
  ok(`${source} → data/latest.json`);
}

/* ── 2. 검사 ──────────────────────────────────────────────── */
if (!existsSync(LATEST)) die('data/latest.json 이 없습니다.');

let payload;
try {
  payload = JSON.parse(readFileSync(LATEST, 'utf8'));
} catch (e) {
  die(`data/latest.json 이 올바른 JSON 이 아닙니다 — ${e.message}`);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date || '')) {
  die('date 는 "YYYY-MM-DD" 형식이어야 합니다.');
}
if (!Array.isArray(payload.tabs) || !payload.tabs.length) {
  die('tabs 배열이 비어 있습니다.');
}

const ids = payload.tabs.map((t) => t.id);
for (const need of ['market', 'news']) {
  if (!ids.includes(need)) console.warn(`  ! 탭 "${need}" 이(가) 없습니다 — 앱에서 빈 화면으로 보입니다.`);
}

const KNOWN = new Set(['p', 'bullets', 'callout', 'kpis', 'stats', 'table', 'hbar', 'timeline', 'terms', 'term', 'caption']);
let blocks = 0;
for (const tab of payload.tabs) {
  for (const sec of tab.sections || []) {
    for (const b of sec.blocks || []) {
      blocks++;
      if (!KNOWN.has(b.type)) console.warn(`  ! 모르는 블록 종류 "${b.type}" (${tab.id} / ${sec.title || '무제'}) — 렌더링되지 않습니다.`);
    }
  }
}
ok(`검사 통과 — ${payload.date} · 탭 ${payload.tabs.length}개 · 블록 ${blocks}개`);

/* ── 3. 지난 호로 보관 ────────────────────────────────────── */
if (!existsSync(ARCHIVE)) mkdirSync(ARCHIVE, { recursive: true });
const archiveFile = join(ARCHIVE, `${payload.date}.json`);
writeFileSync(archiveFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
ok(`보관 — data/archive/${payload.date}.json`);

/* ── 4. 지난 호 목록 다시 만들기 ──────────────────────────── */
const issues = readdirSync(ARCHIVE)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => {
    const d = JSON.parse(readFileSync(join(ARCHIVE, f), 'utf8'));
    return {
      date: d.date,
      headline: d.headline || '',
      issueDate: d.issueDate || '',
      file: `data/archive/${f}`
    };
  })
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

writeFileSync(
  join(DATA, 'index.json'),
  JSON.stringify({ updated: new Date().toISOString(), count: issues.length, issues }, null, 2) + '\n',
  'utf8'
);
ok(`목록 갱신 — 지난 호 ${issues.length}건`);

/* ── 5. 배포 ──────────────────────────────────────────────── */
if (!push) {
  console.log('\n배포하려면:  node publish.mjs --push');
  process.exit(0);
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
  const status = git('status', '--porcelain');
  if (!status.trim()) { ok('변경된 내용이 없어 push 를 건너뜁니다.'); process.exit(0); }
  git('add', '-A');
  git('commit', '-m', `브리핑 ${payload.date} — ${payload.headline || ''}`.trim());
  git('push');
  ok('GitHub 에 배포했습니다 — 1분쯤 뒤 앱에서 새로고침하면 반영됩니다.');
} catch (e) {
  die(`git 명령이 실패했습니다 — ${(e.stderr || e.message || '').toString().trim()}`);
}
