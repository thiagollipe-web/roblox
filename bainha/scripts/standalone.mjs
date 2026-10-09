import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(project, '../prototipo');
let html = await readFile(resolve(output, 'index.html'), 'utf8');

async function asset(url) {
  const path = resolve(output, url);
  if (relative(output, path).startsWith('..')) throw new Error('Asset outside the build directory');
  return readFile(path, 'utf8');
}

const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error('Expected one bundled JavaScript entry point');
const javascript = await asset(scripts[0][1]);
if (/\bimport\s*\(/.test(javascript) || /\bimport\.meta\b/.test(javascript)) {
  throw new Error('The bundle needs additional modules; cannot claim a standalone HTML');
}
html = html.replace(scripts[0][0], () => `<script type="module">\n${javascript.replace(/<\/script/gi, '<\\/script')}\n</script>`);

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/g)];
if (styles.length !== 1) throw new Error('Expected one bundled stylesheet');
for (const style of styles) {
  const css = await asset(style[1]);
  if (/@import\b|url\(\s*['"]?(?:https?:|\.\/|\.\.\/)/i.test(css)) {
    throw new Error('The stylesheet requires external assets');
  }
  html = html.replace(style[0], () => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`);
}

const notices = await readFile(resolve(output, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
html = html.replace('</body>', `<template id="third-party-notices"><pre>${escape(notices)}</pre></template>\n</body>`);
const target = resolve(output, 'BAINHA.html');
await writeFile(target, html);
console.log(`Standalone HTML: ${target} (${Buffer.byteLength(html)} bytes)`);
