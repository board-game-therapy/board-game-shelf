import MiniSearch from 'minisearch';
import type { Game } from './types.ts';

export type Filters = {
  players: string;
  minutes: string;
  tags: string[];
  kind: string;
  query: string;
};
export const emptyFilters: Filters = {
  players: '',
  minutes: '',
  tags: [],
  kind: 'game',
  query: '',
};
export type Match = { game: Game; reason: string; terms: string[] };
const labels: Record<string, string> = {
  title: 'Title',
  aliases: 'Alternate title',
  tags: 'Tag',
  summary: 'Description',
  description: 'Description',
};
export function createSearch(games: Game[]) {
  const byKey = new Map(games.map((g) => [g.key, g]));
  const search = new MiniSearch({
    idField: 'key',
    fields: ['title', 'aliases', 'tags', 'summary', 'description'],
    extractField: (document, field) =>
      ['tags', 'aliases'].includes(field) ? (document[field] || []).join(' ') : document[field],
    searchOptions: {
      boost: { title: 6, tags: 3, summary: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  });
  search.addAll(games);
  return (query: string): Match[] => {
    if (!query.trim()) return games.map((game) => ({ game, reason: '', terms: [] }));
    const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const exact = normalized(query);
    return search
      .search(query)
      .sort(
        (a, b) =>
          Number(normalized(byKey.get(String(b.id))!.title) === exact) -
          Number(normalized(byKey.get(String(a.id))!.title) === exact),
      )
      .map((hit) => {
        const matches = Object.entries(hit.match);
        const preferred =
          matches.find(([, fields]) => fields.includes('title')) ||
          matches.find(([, fields]) => fields.includes('tags')) ||
          matches[0];
        const reason = preferred
          ? `${labels[preferred[1][0]] || 'Description'} matches “${preferred[0]}”`
          : 'Related text';
        return { game: byKey.get(String(hit.id))!, reason, terms: hit.terms };
      });
  };
}
export function matchesFilters(game: Game, filters: Filters) {
  if (filters.kind === 'review') {
    if (game.confidence !== 'uncertain') return false;
  } else if (
    filters.kind !== 'all' &&
    (game.confidence !== 'confirmed' || game.kind !== filters.kind)
  )
    return false;
  if (
    filters.players &&
    (!game.players ||
      Number(filters.players) < game.players.min ||
      Number(filters.players) > game.players.max)
  )
    return false;
  if (filters.minutes && (!game.minutes || game.minutes.max > Number(filters.minutes)))
    return false;
  return filters.tags.every((tag) => game.tags.includes(tag));
}
export function similarGames(game: Game, games: Game[]) {
  return games
    .filter(
      (other) =>
        other.key !== game.key && other.confidence === 'confirmed' && other.kind === 'game',
    )
    .map((other) => {
      const broad = ['Competitive', 'Family', 'Strategy'];
      const shared = other.tags
        .filter((tag) => game.tags.includes(tag))
        .sort((a, b) => Number(broad.includes(a)) - Number(broad.includes(b)));
      // Specific mechanics carry more weight than very broad categories.
      const score = shared.reduce(
        (n, tag) => n + (['Competitive', 'Family', 'Strategy'].includes(tag) ? 1 : 3),
        0,
      );
      return { game: other, shared, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title))
    .slice(0, 3);
}
