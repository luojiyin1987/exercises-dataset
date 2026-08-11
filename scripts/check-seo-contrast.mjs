import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MINIMUM_RATIO = 4.5;
const CSS_FILES = [
  resolve('assets', 'exercise-page.css'),
  resolve('assets', 'taxonomy-page.css'),
];

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log('Usage: npm run build && npm run check:seo-contrast');
  process.exit(0);
}

function colorToken(css, name) {
  const match = css.match(new RegExp(`--${name}:(#[0-9a-fA-F]{3,6})`));
  if (!match) throw new Error(`Missing --${name} color token`);
  return match[1];
}

function luminance(hex) {
  let value = hex.slice(1);
  if (value.length === 3) value = [...value].map((character) => character.repeat(2)).join('');
  const channels = value.match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

let failed = false;

for (const file of CSS_FILES) {
  const css = await readFile(file, 'utf8').catch(() => {
    throw new Error(`${file} is missing. Run npm run build first.`);
  });
  const colors = Object.fromEntries(
    ['bg', 'surface', 'muted', 'accent'].map((name) => [name, colorToken(css, name)]),
  );
  const checks = [
    ['accent', 'surface'],
    ['accent', 'bg'],
    ['muted', 'surface'],
    ['muted', 'bg'],
  ];

  for (const [foreground, background] of checks) {
    const ratio = contrast(colors[foreground], colors[background]);
    const passed = ratio >= MINIMUM_RATIO;
    console.log(
      `${passed ? 'PASS' : 'FAIL'} ${file}: ${foreground} on ${background} ${ratio.toFixed(2)}:1`,
    );
    if (!passed) failed = true;
  }
}

if (failed) process.exitCode = 1;
