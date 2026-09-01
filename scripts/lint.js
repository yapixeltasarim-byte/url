'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['src', 'scripts', 'tests', 'app.js'];

function walk(target, acc = []) {
  const full = path.isAbsolute(target) ? target : path.join(ROOT, target);
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(full)) {
      if (name === 'node_modules') continue;
      walk(path.join(full, name), acc);
    }
    return acc;
  }
  if (full.endsWith('.js')) acc.push(full);
  return acc;
}

const files = TARGETS.flatMap((target) => walk(target));
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    failed += 1;
    const rel = path.relative(ROOT, file);
    const detail = err.stderr ? err.stderr.toString().trim() : err.message;
    // eslint-disable-next-line no-console
    console.error(`[lint] ${rel}\n${detail}`);
  }
}

try {
  execFileSync('sh', ['-n', path.join(ROOT, 'stop.sh')], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (err) {
  failed += 1;
  const detail = err.stderr ? err.stderr.toString().trim() : err.message;
  // eslint-disable-next-line no-console
  console.error(`[lint] stop.sh\n${detail}`);
}

if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error(`[lint] ${failed} hata, ${files.length + 1} dosya`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`[lint] ${files.length} js + stop.sh, 0 hata`);
