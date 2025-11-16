#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const [, , inputPath] = process.argv;
const usage = `Usage: node index.js <events.json|events.csv>

File format:
[
  { "tMs": 0,   "state": 1, "sigma": 0.6, "loss": 0.4 },
  { "tMs": 800, "state": 2 },
  { "tMs": 1600, "state": 0, "sigma": 0.2 }
]
`;

function parseFile(p) {
  if (!p) {
    console.error('No file provided. Falling back to demo timeline.');
    return [
      { tMs: 0, state: 1, sigma: 0.5, loss: 0.4 },
      { tMs: 1000, state: 2 },
      { tMs: 2000, state: 0 },
      { tMs: 3200, state: 1, sigma: 0.8, loss: 0.6 }
    ];
  }

  const absolute = path.resolve(p);
  if (!fs.existsSync(absolute)) {
    console.error(`File not found: ${absolute}`);
    process.exit(1);
  }

  if (absolute.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  }

  if (absolute.endsWith('.csv')) {
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/).filter(Boolean);
    const [header, ...rows] = lines;
    const cols = header.split(',').map(c => c.trim());
    return rows.map(line => {
      const cells = line.split(',');
      const entry = {};
      cols.forEach((col, idx) => {
        const val = cells[idx]?.trim();
        if (val === undefined || val === '') return;
        if (col === 'state' || col === 'tMs') entry[col] = Number(val);
        else entry[col] = Number(val);
      });
      return entry;
    });
  }

  console.error('Unsupported file format.');
  console.error(usage);
  process.exit(1);
}

const events = parseFile(inputPath).sort((a, b) => (a.tMs ?? 0) - (b.tMs ?? 0));
const start = Date.now();

console.log('--- Market Runner Auto Bridge ---');
console.log('Keep this terminal visible. When you see the block for a beat, copy it, focus GZDoom, open the console (~), paste, press Enter.');
console.log('Auto mode must be enabled: `pukename MR_ToggleAuto`');

function emit(event) {
  const lines = [];
  if (Number.isFinite(event.state)) {
    lines.push(`pukename MR_SetAlign ${event.state}`);
  }
  if (Number.isFinite(event.sigma)) {
    lines.push(`pukename MR_SetSigma ${Number(event.sigma).toFixed(2)}`);
  }
  if (Number.isFinite(event.loss)) {
    lines.push(`pukename MR_SetLoss ${Number(event.loss).toFixed(2)}`);
  }
  if (!lines.length) return;
  console.log('\n--- t= ' + (event.tMs ?? 0) + ' ms ---');
  console.log(lines.join('\n'));
}

events.forEach(evt => {
  const delay = Math.max(0, (evt.tMs ?? 0) - (Date.now() - start));
  setTimeout(() => emit(evt), delay);
});

// Keep process alive until last event fires.
const last = events[events.length - 1]?.tMs ?? 0;
setTimeout(() => process.exit(0), last + 2000);
