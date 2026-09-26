import { env } from 'cloudflare:workers';
import catalog from './catalog.json';
import type { Game, Evidence } from './catalog-types';

export function database() {
  if(!env.DB)throw new Error('Catalog database unavailable');
  return env.DB;
}
export function mayEdit(request:Request) {
  return Boolean(request.headers.get('oai-authenticated-user-id'))&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()==='johnlee3@gmail.com';
}
function parsed<T>(value:unknown,fallback:T):T {try{return JSON.parse(String(value)) as T}catch{return fallback}}
export async function reconcileCatalog() {
  const db=database(),revision=catalog.revision;
  if(await db.prepare('SELECT id FROM catalog_state WHERE id=?').bind(revision).first())return;
  const {results}=await db.prepare('SELECT * FROM games').all();
  const statements=[];
  for(const [position,game] of catalog.games.entries()) {
    const row=results.find(r=>r.catalog_key===game.key)||results.find(r=>r.catalog_key===null&&[game.title,...game.aliases].includes(String(r.title)));
    if(row) {
      const previous=parsed<Record<string,unknown>>(row.catalog_snapshot,{});
      const current={title:String(row.title),tags:parsed<string[]>(row.tags,[]),notes:String(row.notes),summary:String(row.summary),description:String(row.description),kind:String(row.kind),confidence:String(row.confidence),evidence:parsed<Evidence[]>(row.evidence,[])};
      // Three-way merge: advance unchanged baseline fields, preserve manual edits.
      const choose=(key:'title'|'tags'|'notes'|'kind'|'confidence'|'summary'|'description')=>{
        if(key in previous)return JSON.stringify(current[key])===JSON.stringify(previous[key])?game[key]:current[key];
        if(key==='notes'&&current.notes)return current.notes;
        if(key==='tags'&&current.tags.length)return current.tags;
        return game[key];
      };
      const evidence=[...current.evidence];
      for(const next of game.evidence){
        const index=evidence.findIndex(e=>e.photoId===next.photoId);
        const old=(previous.evidence as Evidence[]|undefined)?.find(e=>e.photoId===next.photoId);
        if(index<0)evidence.push(next);
        else if(!old||JSON.stringify(evidence[index])===JSON.stringify(old))evidence[index]=next;
      }
      statements.push(db.prepare(`UPDATE games SET catalog_key=?,title=?,tags=?,evidence=?,kind=?,confidence=?,notes=?,summary=?,description=?,catalog_snapshot=?
        WHERE id=? AND NOT EXISTS (SELECT 1 FROM catalog_state WHERE id=?)`)
        .bind(game.key,choose('title'),JSON.stringify(choose('tags')),JSON.stringify(evidence),choose('kind'),choose('confidence'),choose('notes'),choose('summary'),choose('description'),JSON.stringify(game),row.id,revision));
    }else{
      statements.push(db.prepare(`INSERT INTO games
        (catalog_key,title,category,tags,evidence,kind,confidence,notes,summary,description,position,catalog_snapshot)
        SELECT ?,?,'Uncategorized',?,?,?,?,?,?,?,?,?
        WHERE NOT EXISTS (SELECT 1 FROM games WHERE catalog_key=?)
        AND NOT EXISTS (SELECT 1 FROM catalog_state WHERE id=?)`)
        .bind(game.key,game.title,JSON.stringify(game.tags),JSON.stringify(game.evidence),game.kind,game.confidence,game.notes,game.summary,game.description,position,JSON.stringify(game),game.key,revision));
    }
  }
  for(const title of catalog.retiredPlaceholders){
    statements.push(db.prepare(`UPDATE games SET archived=1 WHERE title=? AND notes='' AND confidence='uncertain'
      AND catalog_key IS NULL AND NOT EXISTS (SELECT 1 FROM catalog_state WHERE id=?)`).bind(title,revision));
  }
  statements.push(db.prepare('INSERT OR IGNORE INTO catalog_state (id) VALUES (?)').bind(revision));
  await db.batch(statements);
}
export async function readGames():Promise<Game[]> {
  await reconcileCatalog();
  const {results}=await database().prepare("SELECT id,catalog_key,title,category,tags,evidence,kind,confidence,notes,summary,description,position FROM games WHERE archived=0 ORDER BY CASE confidence WHEN 'uncertain' THEN 1 ELSE 0 END,title COLLATE NOCASE").all();
  return results.map(row=>{
    const tags=parsed<string[]>(row.tags,[]);
    if(typeof row.category==='string'&&row.category!=='Uncategorized'&&!tags.includes(row.category))tags.push(row.category);
    const baseline=catalog.games.find(g=>g.key===row.catalog_key);
    return {...row,tags,evidence:parsed(row.evidence,[]),sources:baseline?.sources||[]} as unknown as Game;
  });
}
