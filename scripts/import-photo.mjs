import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { stringify } from 'yaml';
import { parseYaml, readCatalog, root, validateCatalog } from './catalog.mjs';

export function mergeCandidates(catalog, photo, candidates) {
  const next = structuredClone(catalog);
  if (next.photos.some((p) => p.id === photo.id || p.src === photo.src))
    throw new Error(`Photo ${photo.id} already exists; use another ID.`);
  if (!Array.isArray(candidates) || !candidates.length)
    throw new Error('Candidates must be a non-empty YAML list.');
  next.photos.push(photo);
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || !candidate.key || seen.has(candidate.key))
      throw new Error('Missing or duplicate candidate key.');
    seen.add(candidate.key);
    if (
      !Array.isArray(candidate.evidence) ||
      !candidate.evidence.length ||
      candidate.evidence.some((e) => e.photoId !== photo.id)
    )
      throw new Error(`${candidate.key}: provide regions for this new photo.`);
    const existing = next.games.find((g) => g.key === candidate.key);
    if (existing) {
      if (Object.keys(candidate).some((key) => !['key', 'evidence'].includes(key)))
        throw new Error(
          `${candidate.key}: existing games accept only key and new evidence. Edit catalog metadata separately.`,
        );
      existing.evidence.push(...candidate.evidence);
    } else next.games.push(candidate);
  }
  next.revision += 1;
  next.updatedAt = new Date().toISOString().slice(0, 10);
  return next;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      photo: { type: 'string' },
      id: { type: 'string' },
      label: { type: 'string' },
      candidates: { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
  });
  if (
    !values.photo ||
    !values.id ||
    !values.label ||
    !values.candidates ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.id)
  )
    throw new Error(
      'Use --photo file --id unique-slug --label "Photo label" --candidates candidates.yaml [--apply]',
    );
  const catalog = await readCatalog();
  // Normalize orientation and strip EXIF/GPS. The annotator uses the same displayed orientation.
  const { data, info } = await sharp(values.photo, { limitInputPixels: 100000000 })
    .rotate()
    .webp({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  const photo = {
    id: values.id,
    label: values.label,
    src: `/evidence/${values.id}.webp`,
    filename: path.basename(values.photo),
    width: info.width,
    height: info.height,
    addedAt: new Date().toISOString().slice(0, 10),
  };
  const candidates = parseYaml(await fs.readFile(values.candidates, 'utf8'));
  const next = mergeCandidates(catalog, photo, candidates);
  await validateCatalog(next, { checkFiles: false });
  const destination = path.join(root, 'public', photo.src);
  try {
    await fs.access(destination);
    throw new Error('Photo file already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const added = next.games.length - catalog.games.length;
  console.log(
    `${values.apply ? 'Applying' : 'Preview only:'} ${added} new entries; ${candidates.length - added} existing games gain evidence; revision ${next.revision}.`,
  );
  if (values.apply) {
    const temporary = path.join(root, 'data/catalog.yaml.next');
    await fs.writeFile(
      temporary,
      '# yaml-language-server: $schema=./catalog.schema.json\n' +
        stringify(next, { lineWidth: 100 }),
      { flag: 'wx' },
    );
    try {
      await fs.writeFile(destination, data, { flag: 'wx' });
      await fs.rename(temporary, path.join(root, 'data/catalog.yaml'));
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
    console.log(
      'Saved normalized photo and catalog. Review the diff, run npm test and npm run build, then commit and push.',
    );
  } else console.log('Nothing written. Review candidates, then repeat with --apply.');
}
