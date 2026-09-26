import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCatalog, validateCatalog, parseYaml } from '../scripts/catalog.mjs';
import { mergeCandidates } from '../scripts/import-photo.mjs';
import { createSearch, emptyFilters, matchesFilters, similarGames } from '../src/search.ts';
import type { Catalog } from '../src/types.ts';
const catalog = (await readCatalog()) as Catalog;

test('all migrated entries preserve their evidence, with bounded regions', async () => {
  assert.ok(catalog.games.length >= 162);
  assert.ok(catalog.photos.length >= 7);
  assert.ok(catalog.games.flatMap((g) => g.evidence).length >= 166);
  await validateCatalog(catalog);
});
test('rejects duplicate YAML keys, duplicate game keys, invalid ranges and dangling regions', async () => {
  assert.throws(() => parseYaml('revision: 1\nrevision: 2'));
  const duplicate = structuredClone(catalog);
  duplicate.games.push(duplicate.games[0]);
  await assert.rejects(validateCatalog(duplicate), /Duplicate game/);
  const invalid = structuredClone(catalog);
  invalid.games[0].evidence[0].region.width = 1;
  await assert.rejects(validateCatalog(invalid), /outside photo/);
  const missing = structuredClone(catalog);
  missing.games[0].evidence[0].photoId = 'missing';
  await assert.rejects(validateCatalog(missing), /unknown photo/);
  const range = structuredClone(catalog);
  range.games[0].players = { min: 8, max: 2 };
  await assert.rejects(validateCatalog(range), /invalid players range/);
});
test('live search finds titles, prefixes, misspellings, tags and explains matches', () => {
  const search = createSearch(catalog.games);
  for (const query of ['azul', 'azu', 'azull']) assert.equal(search(query)[0]?.game.key, 'azul');
  assert.match(search('azul')[0].reason, /Title matches/);
  assert.equal(search('dixit')[0].game.key, 'dixit');
  const cooperative = search('cooperative');
  assert.ok(cooperative.length > 5);
  assert.ok(cooperative.some((hit) => /Tag matches/.test(hit.reason)));
  assert.ok(search('zzzxqwy').length === 0);
});
test('group filters exclude unchecked data and uncertain sightings', () => {
  const azul = catalog.games.find((g) => g.key === 'azul')!;
  assert.ok(matchesFilters(azul, { ...emptyFilters, players: '4', minutes: '60' }));
  assert.equal(matchesFilters(azul, { ...emptyFilters, players: '7' }), false);
  assert.equal(
    matchesFilters({ ...azul, minutes: undefined }, { ...emptyFilters, minutes: '60' }),
    false,
  );
  assert.equal(matchesFilters({ ...azul, confidence: 'uncertain' }, emptyFilters), false);
  assert.ok(
    matchesFilters({ ...azul, confidence: 'uncertain' }, { ...emptyFilters, kind: 'review' }),
  );
  assert.equal(
    matchesFilters(azul, { ...emptyFilters, tags: ['Cooperative', 'Competitive'] }),
    false,
  );
});
test('similar suggestions explain shared tags and exclude self and unverified titles', () => {
  const game = catalog.games.find((g) => g.key === 'azul')!;
  const results = similarGames(game, catalog.games);
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.notEqual(result.game.key, game.key);
    assert.equal(result.game.confidence, 'confirmed');
    assert.ok(result.shared.every((tag) => game.tags.includes(tag)));
  }
});
test('photo imports append evidence without duplicating or overwriting existing games', async () => {
  const photo = { ...catalog.photos[0], id: 'new-photo', src: '/evidence/new-photo.webp' };
  const old = catalog.games[0];
  const candidate = {
    key: old.key,
    evidence: [{ photoId: photo.id, region: { x: 0, y: 0, width: 0.2, height: 0.2 } }],
  };
  const result = mergeCandidates(catalog, photo, [candidate]);
  assert.equal(result.games.length, catalog.games.length);
  assert.equal(result.games[0].evidence.length, old.evidence.length + 1);
  assert.equal(result.games[0].description, old.description);
  assert.equal(result.revision, catalog.revision + 1);
  await validateCatalog(result, { checkFiles: false });
  assert.throws(
    () => mergeCandidates(catalog, photo, [{ ...candidate, title: 'Overwrite' }]),
    /only key/,
  );
  assert.throws(() => mergeCandidates(catalog, catalog.photos[0], [candidate]), /already exists/);
  assert.equal(catalog.games[0].evidence.length, old.evidence.length);
});
test('public source and production entrypoint contain no retired branding or private reference', async () => {
  const source = await readFile('src/App.tsx', 'utf8');
  assert.ok(!source.includes('MY BOARD GAME SHELF'));
  assert.ok(!source.includes('/api/games'));
  assert.ok(!source.includes('Owner editing'));
});
