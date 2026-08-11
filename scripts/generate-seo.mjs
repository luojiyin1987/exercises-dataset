import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, '..');
const DATA_FILE = resolve(ROOT_DIR, 'data/exercises.json');
const OUTPUT_DIR = resolve(process.env.SEO_OUTPUT_DIR || ROOT_DIR);
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL || 'https://exercises.itea.fit');
const CSS_FILE = join(OUTPUT_DIR, 'assets', 'exercise-page.css');

const LOCALES = [
  {
    key: 'en',
    lang: 'en',
    hreflang: 'en',
    prefix: '',
    ogLocale: 'en_US',
    name: 'English',
    back: 'Browse all exercises',
    targetMuscle: 'Target muscle',
    muscleGroup: 'Muscle group',
    bodyPart: 'Body part',
    equipment: 'Equipment',
    secondaryMuscles: 'Secondary muscles',
    instructions: 'How to perform',
    notSpecified: 'Not specified',
    mediaAlt: 'exercise demonstration',
    title(name) {
      return `${name}: Muscles, Equipment & Instructions | Exercise Dataset`;
    },
    description(name, target, equipment) {
      return `${name} exercise guide with muscles, equipment, animation and step-by-step instructions. Target: ${target}. Equipment: ${equipment}.`;
    },
  },
  {
    key: 'zh',
    lang: 'zh-CN',
    hreflang: 'zh-CN',
    prefix: 'zh',
    ogLocale: 'zh_CN',
    name: '中文',
    back: '浏览全部动作',
    targetMuscle: '目标肌肉',
    muscleGroup: '肌群',
    bodyPart: '身体部位',
    equipment: '器械',
    secondaryMuscles: '辅助肌群',
    instructions: '动作步骤',
    notSpecified: '未指定',
    mediaAlt: '动作演示',
    title(name) {
      return `${name}：动作说明、目标肌群与器械 | Exercise Dataset`;
    },
    description(name, target, equipment) {
      return `${name} 动作指南，包含目标肌群、训练器械、动作动画和分步说明。目标肌肉：${target}。器械：${equipment}。`;
    },
  },
  {
    key: 'it',
    lang: 'it',
    hreflang: 'it',
    prefix: 'it',
    ogLocale: 'it_IT',
    name: 'Italiano',
    back: 'Sfoglia tutti gli esercizi',
    targetMuscle: 'Muscolo target',
    muscleGroup: 'Gruppo muscolare',
    bodyPart: 'Parte del corpo',
    equipment: 'Attrezzatura',
    secondaryMuscles: 'Muscoli secondari',
    instructions: 'Come eseguire',
    notSpecified: 'Non specificato',
    mediaAlt: 'dimostrazione dell’esercizio',
    title(name) {
      return `${name}: muscoli, attrezzatura e istruzioni | Exercise Dataset`;
    },
    description(name, target, equipment) {
      return `Guida all'esercizio ${name} con muscoli, attrezzatura, animazione e istruzioni passo passo. Muscolo target: ${target}. Attrezzatura: ${equipment}.`;
    },
  },
  {
    key: 'tr',
    lang: 'tr',
    hreflang: 'tr',
    prefix: 'tr',
    ogLocale: 'tr_TR',
    name: 'Türkçe',
    back: 'Tüm egzersizlere göz at',
    targetMuscle: 'Hedef kas',
    muscleGroup: 'Kas grubu',
    bodyPart: 'Vücut bölgesi',
    equipment: 'Ekipman',
    secondaryMuscles: 'İkincil kaslar',
    instructions: 'Nasıl yapılır',
    notSpecified: 'Belirtilmemiş',
    mediaAlt: 'egzersiz gösterimi',
    title(name) {
      return `${name}: kaslar, ekipman ve talimatlar | Exercise Dataset`;
    },
    description(name, target, equipment) {
      return `${name} egzersiz rehberi; kaslar, ekipman, animasyon ve adım adım talimatlar içerir. Hedef kas: ${target}. Ekipman: ${equipment}.`;
    },
  },
];

const CSS = `:root{color-scheme:light;--bg:#f4f4f5;--surface:#fff;--text:#18181b;--muted:#71717a;--line:#e4e4e7;--accent:#ea580c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}a{color:var(--accent)}.shell{width:min(920px,calc(100% - 32px));margin:0 auto;padding:28px 0 64px}.topbar{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:22px}.back{color:var(--muted);text-decoration:none}.back:hover{color:var(--text)}.languages{display:flex;gap:8px;flex-wrap:wrap}.languages a,.languages span{padding:4px 9px;border:1px solid var(--line);border-radius:999px;font-size:13px;text-decoration:none}.languages span{background:var(--surface);font-weight:650}article{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(20px,4vw,40px)}h1{margin:0 0 8px;font-size:clamp(30px,5vw,48px);line-height:1.08;text-transform:capitalize}.lede{margin:0 0 28px;color:var(--muted);font-size:17px}.media{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:28px;align-items:start}.media img{width:100%;height:auto;border-radius:14px;border:1px solid var(--line);background:#fafafa}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}.facts div{padding:14px;border:1px solid var(--line);border-radius:12px}.facts dt{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.facts dd{margin:4px 0 0;font-weight:650;text-transform:capitalize}section{margin-top:32px}h2{font-size:22px;margin:0 0 12px}ol{padding-left:24px}li+li{margin-top:8px}.secondary{color:var(--muted)}@media(max-width:700px){.media{grid-template-columns:1fr}.facts{grid-template-columns:1fr 1fr}}`;

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

function localizedPath(slug, locale) {
  const prefix = locale.prefix ? `/${locale.prefix}` : '';
  return `${prefix}/exercises/${slug}/`;
}

function localizedUrl(slug, locale) {
  return `${SITE_URL}${localizedPath(slug, locale)}`;
}

function outputFileFor(slug, locale) {
  const parts = locale.prefix ? [locale.prefix, 'exercises', slug, 'index.html'] : ['exercises', slug, 'index.html'];
  return join(OUTPUT_DIR, ...parts);
}

function makeDescription(exercise, locale, name) {
  const target = String(exercise.target || locale.notSpecified);
  const equipment = String(exercise.equipment || locale.notSpecified);
  return locale
    .description(name, target, equipment)
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim();
}

function instructionSteps(exercise, language) {
  const steps = exercise.instruction_steps?.[language];
  if (Array.isArray(steps) && steps.length) return steps.map(String).filter((step) => step.trim());

  const instructions = exercise.instructions?.[language];
  if (typeof instructions === 'string' && instructions.trim()) return [instructions.trim()];
  if (Array.isArray(instructions)) return instructions.map(String).filter((step) => step.trim());
  return [];
}

function renderSteps(title, steps, lang) {
  if (!steps.length) return '';
  return `<section lang="${lang}"><h2>${escapeHtml(title)}</h2><ol>${steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('')}</ol></section>`;
}

function renderAlternateLinks(alternateUrls) {
  const links = LOCALES.filter((locale) => alternateUrls.has(locale.key))
    .map(
      (locale) =>
        `<link rel="alternate" hreflang="${locale.hreflang}" href="${escapeHtml(alternateUrls.get(locale.key))}">`,
    );
  const defaultUrl = alternateUrls.get('en');
  if (defaultUrl) {
    links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(defaultUrl)}">`);
  }
  return links.join('\n  ');
}

function renderLanguageNav(currentLocale, alternateUrls) {
  const links = LOCALES.filter((locale) => alternateUrls.has(locale.key)).map((locale) => {
    if (locale.key === currentLocale.key) {
      return `<span lang="${locale.lang}" aria-current="page">${escapeHtml(locale.name)}</span>`;
    }
    return `<a href="${escapeHtml(alternateUrls.get(locale.key))}" hreflang="${locale.hreflang}" lang="${locale.lang}">${escapeHtml(locale.name)}</a>`;
  });
  return `<nav class="languages" aria-label="Language">${links.join('')}</nav>`;
}

function renderExercisePage(exercise, pageUrl, locale, alternateUrls) {
  const name = String(exercise.name || `Exercise ${exercise.id || ''}`).trim();
  const description = makeDescription(exercise, locale, name);
  const imageUrl = absoluteAssetUrl(exercise.image);
  const gifUrl = absoluteAssetUrl(exercise.gif_url);
  const primaryMediaUrl = gifUrl || imageUrl;
  const steps = instructionSteps(exercise, locale.key);
  const secondary = Array.isArray(exercise.secondary_muscles)
    ? exercise.secondary_muscles.join(', ')
    : exercise.secondary_muscles || '';
  const title = locale.title(name);
  const alternateLinks = renderAlternateLinks(alternateUrls);
  const alternateOgLocales = LOCALES.filter(
    (candidate) => candidate.key !== locale.key && alternateUrls.has(candidate.key),
  )
    .map((candidate) => `<meta property="og:locale:alternate" content="${candidate.ogLocale}">`)
    .join('\n  ');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: pageUrl,
    inLanguage: locale.hreflang,
    primaryImageOfPage: imageUrl || gifUrl || undefined,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Exercise Dataset',
      url: `${SITE_URL}/`,
    },
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="${locale.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  ${alternateLinks}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:locale" content="${locale.ogLocale}">
  ${alternateOgLocales}
  ${imageUrl || gifUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl || gifUrl)}">` : ''}
  <link rel="stylesheet" href="/assets/exercise-page.css">
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  <main class="shell">
    <div class="topbar">
      <a class="back" href="/">← ${escapeHtml(locale.back)}</a>
      ${renderLanguageNav(locale, alternateUrls)}
    </div>
    <article>
      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <div class="media">
        ${primaryMediaUrl ? `<img src="${escapeHtml(primaryMediaUrl)}" alt="${escapeHtml(`${name} ${locale.mediaAlt}`)}" width="180" height="180" decoding="async">` : '<div></div>'}
        <dl class="facts">
          <div><dt>${escapeHtml(locale.targetMuscle)}</dt><dd>${escapeHtml(exercise.target || locale.notSpecified)}</dd></div>
          <div><dt>${escapeHtml(locale.muscleGroup)}</dt><dd>${escapeHtml(exercise.muscle_group || locale.notSpecified)}</dd></div>
          <div><dt>${escapeHtml(locale.bodyPart)}</dt><dd>${escapeHtml(exercise.body_part || exercise.category || locale.notSpecified)}</dd></div>
          <div><dt>${escapeHtml(locale.equipment)}</dt><dd>${escapeHtml(exercise.equipment || locale.notSpecified)}</dd></div>
        </dl>
      </div>
      ${secondary ? `<section><h2>${escapeHtml(locale.secondaryMuscles)}</h2><p class="secondary">${escapeHtml(secondary)}</p></section>` : ''}
      ${renderSteps(locale.instructions, steps, locale.lang)}
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

  for (const locale of LOCALES) {
    const generatedDir = locale.prefix
      ? join(OUTPUT_DIR, locale.prefix, 'exercises')
      : join(OUTPUT_DIR, 'exercises');
    await rm(generatedDir, { recursive: true, force: true });
  }
  await mkdir(dirname(CSS_FILE), { recursive: true });
  await writeFile(CSS_FILE, `${CSS}\n`, 'utf8');

  const exerciseUrls = [];
  const localePageCounts = new Map(LOCALES.map((locale) => [locale.key, 0]));

  for (let i = 0; i < exercises.length; i += 1) {
    const exercise = exercises[i];
    const slug = slugs[i];
    const availableLocales = LOCALES.filter(
      (locale) => locale.key === 'en' || instructionSteps(exercise, locale.key).length > 0,
    );
    const alternateUrls = new Map(
      availableLocales.map((locale) => [locale.key, localizedUrl(slug, locale)]),
    );

    for (const locale of availableLocales) {
      const pageUrl = alternateUrls.get(locale.key);
      const outputFile = outputFileFor(slug, locale);
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, renderExercisePage(exercise, pageUrl, locale, alternateUrls), 'utf8');
      exerciseUrls.push(pageUrl);
      localePageCounts.set(locale.key, localePageCounts.get(locale.key) + 1);
    }
  }

  const sitemapUrls = [`${SITE_URL}/`, `${SITE_URL}/setup.html`, ...exerciseUrls];
  await writeFile(join(OUTPUT_DIR, 'sitemap.xml'), renderSitemap(sitemapUrls), 'utf8');
  await writeFile(
    join(OUTPUT_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'utf8',
  );

  for (const locale of LOCALES) {
    console.log(`Generated ${localePageCounts.get(locale.key)} ${locale.hreflang} exercise pages.`);
  }
  console.log(`Sitemap contains ${sitemapUrls.length} URLs.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
