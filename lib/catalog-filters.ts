import type { Game } from './catalog-types';
export function filterGames(games:Game[],query:string,tags:string[],match:'all'|'any',kind:string) {
  const term=query.trim().toLowerCase();
  return games.filter(g=>
    (kind==='all'||(kind==='uncertain'?g.confidence==='uncertain':g.kind===kind)) &&
    (!term || [g.title,g.summary,g.description,g.notes,...g.tags].join(' ').toLowerCase().includes(term)) &&
    (!tags.length || (match==='all'?tags.every(t=>g.tags.includes(t)):tags.some(t=>g.tags.includes(t)))));
}
