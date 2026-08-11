import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT_DIR, 'data', 'exercises.json');
const OUTPUT_DIR = resolve(process.env.SEO_OUTPUT_DIR || ROOT_DIR);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL || 'https://exercises.itea.fit');
const SITEMAP_FILE = join(OUTPUT_DIR, 'sitemap.xml');
const CSS_FILE = join(OUTPUT_DIR, 'assets', 'taxonomy-page.css');

const TAXONOMIES = [
  {
    path: 'muscles',
    label: 'Target muscles',
    title: 'Exercises by Target Muscle',
    description: 'Browse exercises grouped by their primary target muscle.',
    value: (exercise) => exercise.target,
  },
  {
    path: 'equipment',
    label: 'Equipment',
    title: 'Exercises by Equipment',
    description: 'Browse exercises grouped by the equipment required.',
    value: (exercise) => exercise.equipment,
  },
  {
    path: 'body-parts',
    label: 'Body parts',
    title: 'Exercises by Body Part',
    description: 'Browse exercises grouped by the body part they train.',
    value: (exercise) => exercise.body_part || exercise.category,
  },
];

const CSS = `:root{--bg:#f4f4f5;--surface:#fff;--text:#18181b;--muted:#52525b;--line:#e4e4e7;--accent:#c2410c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}a{color:var(--accent)}.shell{width:min(1040px,calc(100% - 32px));margin:auto;padding:28px 0 64px}.topbar{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;margin-bottom:22px}.back{color:var(--muted);text-decoration:none}.nav{display:flex;gap:10px;flex-wrap:wrap}.nav a{text-decoration:none}.panel{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(20px,4vw,40px)}.breadcrumbs{margin:0 0 18px;color:var(--muted);font-size:14px}.breadcrumbs ol{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}.breadcrumbs li{display:flex;align-items:center}.breadcrumbs li+li::before{content:"/";margin-right:6px;color:#a1a1aa}.breadcrumbs a{color:var(--muted);text-decoration:none}.breadcrumbs a:hover{color:var(--text)}h1{margin:0;font-size:clamp(30px,5vw,48px);line-height:1.08;text-transform:capitalize}.lede{margin:10px 0 28px;color:var(--muted);font-size:17px}.grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.grid a{display:block;border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none}.grid strong{display:block;color:var(--text);text-transform:capitalize}.grid span{display:block;margin-top:3px;color:var(--muted);font-size:13px}`;

function normalizeSiteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('SITE_URL must use http or https');
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

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function makeExercisePaths(exercises) {
  const bases = exercises.map((exercise) => slugify(exercise.name || exercise.id));
  const counts = new Map();
  for (const slug of bases) counts.set(slug, (counts.get(slug) || 0) + 1);
  return exercises.map((exercise, index) => {
    const suffix = counts.get(bases[index]) > 1 ? `-${slugify(exercise.id || index + 1)}` : '';
    return `${bases[index]}${suffix}`;
  });
}

function buildGroups(exercises, slugs, taxonomy) {
  const groups = new Map();
  for (let i = 0; i < exercises.length; i += 1) {
    const value = String(taxonomy.value(exercises[i]) || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!groups.has(key)) groups.set(key, { value, slug: slugify(value), items: [] });
    groups.get(key).items.push({ exercise: exercises[i], slug: slugs[i] });
  }

  const owners = new Map();
  for (const group of groups.values()) {
    if (owners.has(group.slug) && owners.get(group.slug) !== group.value) {
      throw new Error(`Taxonomy slug collision: "${owners.get(group.slug)}" and "${group.value}"`);
    }
    owners.set(group.slug, group.value);
    group.items.sort((a, b) =>
      String(a.exercise.name || '').localeCompare(String(b.exercise.name || ''), 'en'),
    );
  }
  return [...groups.values()].sort((a, b) => a.value.localeCompare(b.value, 'en'));
}

function siteNav() {
  return `<nav class="nav" aria-label="Browse"><a href="/exercises/">All exercises</a>${TAXONOMIES.map(
    (taxonomy) => `<a href="/${taxonomy.path}/">${escapeHtml(taxonomy.label)}</a>`,
  ).join('')}</nav>`;
}

function renderBreadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items
    .map((item, index) => {
      const isCurrent = index === items.length - 1;
      return isCurrent
        ? `<li><span aria-current="page">${escapeHtml(item.name)}</span></li>`
        : `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a></li>`;
    })
    .join('')}</ol></nav>`;
}

function breadcrumbJsonLd(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, `${SITE_URL}/`).toString(),
    })),
  }).replace(/</g, '\\u003c');
}

function renderPage(title, description, canonicalUrl, body, breadcrumbs) {
  const breadcrumbData = breadcrumbJsonLd(breadcrumbs);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} | Exercise Dataset</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="stylesheet" href="/assets/taxonomy-page.css">
  <script type="application/ld+json">${breadcrumbData}</script>
</head>
<body>
  <main class="shell">
    <div class="topbar"><a class="back" href="/">← Exercise Dataset</a>${siteNav()}</div>
    <section class="panel">${renderBreadcrumbs(breadcrumbs)}${body}</section>
  </main>
</body>
</html>`;
}

function exerciseList(items) {
  return `<ul class="grid">${items.map(({ exercise, slug }) => {
    const name = String(exercise.name || `Exercise ${exercise.id || ''}`).trim();
    const details = [exercise.target, exercise.equipment].filter(Boolean).join(' · ');
    return `<li><a href="/exercises/${escapeHtml(slug)}/"><strong>${escapeHtml(name)}</strong>${
      details ? `<span>${escapeHtml(details)}</span>` : ''
    }</a></li>`;
  }).join('')}</ul>`;
}

function groupIndex(taxonomy, groups) {
  const body = `<h1>${escapeHtml(taxonomy.title)}</h1>
<p class="lede">${escapeHtml(taxonomy.description)} ${groups.length} groups are available.</p>
<ul class="grid">${groups.map((group) =>
  `<li><a href="/${taxonomy.path}/${escapeHtml(group.slug)}/"><strong>${escapeHtml(group.value)}</strong><span>${group.items.length} exercise${group.items.length === 1 ? '' : 's'}</span></a></li>`,
).join('')}</ul>`;
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Exercises', path: '/exercises/' },
    { name: taxonomy.label, path: `/${taxonomy.path}/` },
  ];
  return renderPage(taxonomy.title, taxonomy.description, `${SITE_URL}/${taxonomy.path}/`, body, breadcrumbs);
}

function groupPage(taxonomy, group) {
  const title = `${group.value} Exercises`;
  const description = `Browse ${group.items.length} exercise${group.items.length === 1 ? '' : 's'} for ${group.value}, with animations, target muscles, equipment and step-by-step instructions.`;
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Exercises', path: '/exercises/' },
    { name: taxonomy.label, path: `/${taxonomy.path}/` },
    { name: group.value, path: `/${taxonomy.path}/${group.slug}/` },
  ];
  return renderPage(
    title,
    description,
    `${SITE_URL}/${taxonomy.path}/${group.slug}/`,
    `<h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(description)}</p>${exerciseList(group.items)}`,
    breadcrumbs,
  );
}

function allExercises(exercises, slugs) {
  const items = exercises
    .map((exercise, index) => ({ exercise, slug: slugs[index] }))
    .sort((a, b) => String(a.exercise.name || '').localeCompare(String(b.exercise.name || ''), 'en'));
  const count = items.length.toLocaleString('en-US');
  const title = `All ${count} Exercises`;
  const description = `Browse all ${count} fitness exercises with target muscles, equipment, animations and step-by-step instructions.`;
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Exercises', path: '/exercises/' },
  ];
  return renderPage(
    title,
    description,
    `${SITE_URL}/exercises/`,
    `<h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(description)}</p>${exerciseList(items)}`,
    breadcrumbs,
  );
}

function readSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll('&amp;', '&'));
}

function renderSitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
}

async function main() {
  const exercises = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  if (!Array.isArray(exercises) || !exercises.length) {
    throw new Error('data/exercises.json must contain a non-empty JSON array');
  }

  const slugs = makeExercisePaths(exercises);
  if (new Set(slugs).size !== slugs.length) throw new Error('Generated exercise paths are not unique');

  const sitemapXml = await readFile(SITEMAP_FILE, 'utf8').catch(() => {
    throw new Error('sitemap.xml is missing; run scripts/generate-seo.mjs first');
  });

  for (const taxonomy of TAXONOMIES) {
    await rm(join(OUTPUT_DIR, taxonomy.path), { recursive: true, force: true });
  }
  await mkdir(dirname(CSS_FILE), { recursive: true });
  await writeFile(CSS_FILE, `${CSS}\n`, 'utf8');
  await writeFile(join(OUTPUT_DIR, 'exercises', 'index.html'), allExercises(exercises, slugs), 'utf8');

  const generatedUrls = [`${SITE_URL}/exercises/`];
  for (const taxonomy of TAXONOMIES) {
    const groups = buildGroups(exercises, slugs, taxonomy);
    const root = join(OUTPUT_DIR, taxonomy.path);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'index.html'), groupIndex(taxonomy, groups), 'utf8');
    generatedUrls.push(`${SITE_URL}/${taxonomy.path}/`);

    for (const group of groups) {
      const file = join(root, group.slug, 'index.html');
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, groupPage(taxonomy, group), 'utf8');
      generatedUrls.push(`${SITE_URL}/${taxonomy.path}/${group.slug}/`);
    }
    console.log(`Generated ${groups.length} ${taxonomy.path} groups.`);
  }

  const prefixes = TAXONOMIES.map((taxonomy) => `${SITE_URL}/${taxonomy.path}/`);
  const existingUrls = readSitemapUrls(sitemapXml).filter(
    (url) => url !== `${SITE_URL}/exercises/` && !prefixes.some((prefix) => url.startsWith(prefix)),
  );
  const sitemapUrls = [...new Set([...existingUrls, ...generatedUrls])];
  await writeFile(SITEMAP_FILE, renderSitemap(sitemapUrls), 'utf8');

  console.log(`Generated all-exercises index with ${exercises.length} links.`);
  console.log(`Sitemap contains ${sitemapUrls.length} URLs.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
