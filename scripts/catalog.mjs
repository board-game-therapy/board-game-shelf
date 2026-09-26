import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import Ajv from 'ajv';

export const root = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(await fs.readFile(path.join(root, 'data/catalog.schema.json'), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);
export function parseYaml(source) {
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors.map((e) => e.message).join('\n'));
  return doc.toJS({ maxAliasCount: 0 });
}
export async function validateCatalog(catalog, { checkFiles = true } = {}) {
  if (!validate(catalog)) throw new Error(JSON.stringify(validate.errors, null, 2));
  const keys = new Set();
  const photos = new Map();
  for (const photo of catalog.photos) {
    if (photos.has(photo.id)) throw new Error(`Duplicate photo: ${photo.id}`);
    photos.set(photo.id, photo);
    if (checkFiles) await fs.access(path.join(root, 'public', photo.src));
  }
  for (const game of catalog.games) {
    if (keys.has(game.key)) throw new Error(`Duplicate game: ${game.key}`);
    keys.add(game.key);
    for (const field of ['players', 'minutes']) {
      if (game[field] && game[field].min > game[field].max)
        throw new Error(`${game.key}: invalid ${field} range`);
    }
    if ((game.players || game.minutes || game.minAge || game.image) && !game.reference) {
      throw new Error(`${game.key}: enriched metadata requires a reference`);
    }
    const regions = new Set();
    for (const evidence of game.evidence) {
      if (!photos.has(evidence.photoId))
        throw new Error(`${game.key}: unknown photo ${evidence.photoId}`);
      const { x, y, width, height } = evidence.region;
      if (x + width > 1.000001 || y + height > 1.000001)
        throw new Error(`${game.key}: region outside photo`);
      const signature = JSON.stringify([evidence.photoId, x, y, width, height]);
      if (regions.has(signature)) throw new Error(`${game.key}: duplicate evidence`);
      regions.add(signature);
    }
  }
  return catalog;
}
export async function readCatalog() {
  return validateCatalog(
    parseYaml(await fs.readFile(path.join(root, 'data/catalog.yaml'), 'utf8')),
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = await readCatalog();
  if (!process.argv.includes('--check')) {
    await fs.writeFile(path.join(root, 'src/catalog.generated.json'), JSON.stringify(catalog));
    await fs.copyFile(path.join(root, 'data/catalog.yaml'), path.join(root, 'public/catalog.yaml'));
    await fs.writeFile(
      path.join(root, 'public/catalog-index.json'),
      JSON.stringify(catalog.games.map(({ key, title }) => ({ key, title }))),
    );
  }
  console.log(
    `Validated ${catalog.games.length} entries, ${catalog.photos.length} photos, and ${catalog.games.flatMap((g) => g.evidence).length} bounded evidence regions.`,
  );
}
