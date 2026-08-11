import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DATA_FILE = resolve(ROOT_DIR, 'data/exercises.json');
const OUTPUT_DIR = resolve(process.env.SEO_OUTPUT_DIR || ROOT_DIR);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL || 'https://exercises.itea.fit');
const EXERCISES_DIR = join(OUTPUT_DIR, 'exercises');
const CSS_FILE = join(OUTPUT_DIR, 'assets', 'exercise-page.css');

const CSS = `:root{color-scheme:light;--bg:#f4f4f5;--surface:#fff;--text:#18181b;--muted:#71717a;--line:#e4e4e7;--accent:#ea580c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}a{color:var(--accent)}.shell{width:min(920px,calc(100% - 32px));margin:0 auto;padding:28px 0 64px}.back{display:inline-block;margin-bottom:22px;color:var(--muted);text-decoration:none}.back:hover{color:var(--text)}article{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(20px,4vw,40px)}h1{margin:0 0 8px;font-size:clamp(30px,5vw,48px);line-height:1.08;text-transform:capitalize}.lede{margin:0 0 28px;color:var(--muted);font-size:17px}.media{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:28px;align-items:start}.media img{width:100%;height:auto;border-radius:14px;border:1px solid var(--line);background:#fafafa}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}.facts div{padding:14px;border:1px solid var(--line);border-radius:12px}.facts dt{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.facts dd{margin:4px 0 0;font-weight:650;text-transform:capitalize}section{margin-top:32px}h2{font-size:22px;margin:0 0 12px}ol{padding-left:24px}li+li{margin-top:8px}.secondary{color:var(--muted)}details{margin-top:24px;padding-top:20px;border-top:1px solid var(--line)}summary{cursor:pointer;font-weight:650}.animation{margin-top:16px;max-width:420px}@media(max-width:700px){.media{grid-template-columns:1fr}.facts{grid-template-columns:1fr 1fr}}`;

function normalizeSiteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SITE_URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value = '') {
  return escapeHtml(value);
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'exercise';
}

function absoluteAssetUrl(path) {
  if (!path) return '';
  try {
    return new URL(path, `${SITE_URL}/`).toString();
  } catch {
    return '';
  }
}

function makeDescription(exercise) {
  const details = [exercise.target, exercise.equipment, exercise.body_part || exercise.category]
    .filter(Boolean)
    .map(String);
  const suffix = details.length ? ` Target: ${details[0]}. Equipment: ${details[1] || 'varies'}.` : '';
  return `${exercise.name} exercise guide with muscles, equipment, animation and step-by-step instructions.${suffix}`
    .replace(/\s+/g, ' ')
    .slice(0, 160)
    .trim();
}

function instructionSteps(exercise, language) {
  const steps = exercise.instruction_steps?.[language];
  if (Array.isArray(steps) && steps.length) return steps.map(String);

  const instructions = exercise.instructions?.[language];
  if (typeof instructions === 'string' && instructions.trim()) return [instructions.trim()];
  if (Array.isArray(instructions)) return instructions.map(String);
  return [];
}

function renderSteps(title, steps, lang) {
  if (!steps.length) return '';
  return `<section lang="${lang}"><h2>${escapeHtml(title)}</h2><ol>${steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('')}</ol></section>`;
}

function renderExercisePage(exercise, pageUrl) {
  const name = String(exercise.name || `Exercise ${exercise.id || ''}`).trim();
  const description = makeDescription({ ...exercise, name });
  const imageUrl = absoluteAssetUrl(exercise.image);
  const gifUrl = absoluteAssetUrl(exercise.gif_url);
  const englishSteps = instructionSteps(exercise, 'en');
  const turkishSteps = instructionSteps(exercise, 'tr');
  const secondary = Array.isArray(exercise.secondary_muscles)
    ? exercise.secondary_muscles.join(', ')
    : exercise.secondary_muscles || '';
  const title = `${name}: Muscles, Equipment & Instructions | Exercise Dataset`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: pageUrl,
    primaryImageOfPage: imageUrl || undefined,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Exercise Dataset',
      url: `${SITE_URL}/`,
    },
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(name)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
  <link rel="stylesheet" href="/assets/exercise-page.css">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <main class="shell">
    <a class="back" href="/">← Browse all exercises</a>
    <article>
      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <div class="media">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)} exercise" width="180" height="180" decoding="async">` : '<div></div>'}
        <dl class="facts">
          <div><dt>Target muscle</dt><dd>${escapeHtml(exercise.target || 'Not specified')}</dd></div>
          <div><dt>Muscle group</dt><dd>${escapeHtml(exercise.muscle_group || 'Not specified')}</dd></div>
          <div><dt>Body part</dt><dd>${escapeHtml(exercise.body_part || exercise.category || 'Not specified')}</dd></div>
          <div><dt>Equipment</dt><dd>${escapeHtml(exercise.equipment || 'Not specified')}</dd></div>
        </dl>
      </div>
      ${secondary ? `<section><h2>Secondary muscles</h2><p class="secondary">${escapeHtml(secondary)}</p></section>` : ''}
      ${renderSteps('How to perform', englishSteps, 'en')}
      ${renderSteps('Turkish instructions', turkishSteps, 'tr')}
      ${gifUrl ? `<details><summary>View exercise animation</summary><img class="animation" src="${escapeHtml(gifUrl)}" alt="${escapeHtml(name)} animation" loading="lazy" decoding="async"></details>` : ''}
    </article>
  </main>
</body>
</html>`;
}

function makeExercisePaths(exercises) {
  const baseSlugs = exercises.map((exercise) => slugify(exercise.name || exercise.id));
  const counts = new Map();
  for (const slug of baseSlugs) counts.set(slug, (counts.get(slug) || 0) + 1);

  return exercises.map((exercise, index) => {
    const baseSlug = baseSlugs[index];
    const suffix = counts.get(baseSlug) > 1 ? `-${slugify(exercise.id || index + 1)}` : '';
    return `${baseSlug}${suffix}`;
  });
}

function renderSitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
}

async function main() {
  const raw = await readFile(DATA_FILE, 'utf8');
  const exercises = JSON.parse(raw);
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error('data/exercises.json must contain a non-empty JSON array');
  }

  const slugs = makeExercisePaths(exercises);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error('Generated exercise paths are not unique');
  }

  await rm(EXERCISES_DIR, { recursive: true, force: true });
  await mkdir(EXERCISES_DIR, { recursive: true });
  await mkdir(dirname(CSS_FILE), { recursive: true });
  await writeFile(CSS_FILE, `${CSS}\n`, 'utf8');

  const exerciseUrls = [];
  for (let i = 0; i < exercises.length; i += 1) {
    const slug = slugs[i];
    const pageUrl = `${SITE_URL}/exercises/${slug}/`;
    const outputFile = join(EXERCISES_DIR, slug, 'index.html');
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, renderExercisePage(exercises[i], pageUrl), 'utf8');
    exerciseUrls.push(pageUrl);
  }

  const sitemapUrls = [`${SITE_URL}/`, `${SITE_URL}/setup.html`, ...exerciseUrls];
  await writeFile(join(OUTPUT_DIR, 'sitemap.xml'), renderSitemap(sitemapUrls), 'utf8');
  await writeFile(
    join(OUTPUT_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'utf8',
  );

  console.log(`Generated ${exercises.length} exercise pages.`);
  console.log(`Sitemap contains ${sitemapUrls.length} URLs.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
