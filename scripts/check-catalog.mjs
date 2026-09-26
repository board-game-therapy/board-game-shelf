import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const catalog=JSON.parse(fs.readFileSync('lib/catalog.json','utf8'));
assert.equal(new Set(catalog.games.map(g=>g.key)).size,catalog.games.length);
const photoIds=new Set(catalog.photos.map(p=>p.id));
for(const p of catalog.photos){assert(fs.existsSync(path.join('public',p.src)),'Missing photo '+p.src);assert(p.width>0&&p.height>0)}
for(const g of catalog.games){assert(g.title.trim());assert(g.summary.trim());assert(g.description.trim());assert(g.summary.length<=240);assert(g.evidence.every(e=>photoIds.has(e.photoId)&&(!e.region||(e.region.x>=0&&e.region.y>=0&&e.region.width>0&&e.region.height>0&&e.region.x+e.region.width<=1.00001&&e.region.y+e.region.height<=1.00001))));assert(g.tags.length<=20);}
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const statement=(query,args=[])=>({
 bind(...values){return statement(query,values)},
 async first(){return sql.prepare(query).get(...args)||null},
 async all(){return {results:sql.prepare(query).all(...args)}},
 async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
});
const db={prepare:statement,async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const context=vm.createContext({console,Response,Request,URL});
const modules=new Map();
async function moduleFor(name){
 if(modules.has(name))return modules.get(name);
 let module;
 if(name==='cloudflare:workers')module=new vm.SyntheticModule(['env'],function(){this.setExport('env',{DB:db})},{context});
 else if(name.endsWith('catalog.json'))module=new vm.SyntheticModule(['default'],function(){this.setExport('default',catalog)},{context});
 else {
  const file=name==='store'?'lib/catalog-store.ts':name==='api'?'app/api/games/route.ts':'lib/catalog-filters.ts';
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  module=new vm.SourceTextModule(code,{context,identifier:name});
 }
 modules.set(name,module);
 await module.link(async spec=>moduleFor(spec.includes('catalog-store')?'store':spec));
 return module;
}
// Simulate the original 43-row catalog, including a manual category and note.
const initial=fs.readFileSync('lib/initial-games.ts','utf8');
for(const match of initial.matchAll(/\["([^"]+)","([^"]+)"(?:,"([^"]+)")?\]/g)){
 const [,title,confidence,kind]=match;
 sql.prepare('INSERT INTO games(title,category,confidence,kind,notes) VALUES (?,?,?,?,?)').run(title,title==='Azul'?'Favorites':'Uncategorized',confidence,kind||'game',title==='Azul'?'Owner note':'');
}
sql.exec('INSERT INTO catalog_state(id) VALUES (1)');
const store=await moduleFor('store');await store.evaluate();
let games=await store.namespace.readGames();
assert.equal(games.length,catalog.games.length);
const azul=games.find(g=>g.title==='Azul');assert(azul.tags.includes('Favorites'));assert.equal(azul.notes,'Owner note');
assert(!games.some(g=>g.title==='Brainspin'));assert(games.some(g=>g.title==='Spirit Island: Branch & Claw'));
assert.equal((await store.namespace.readGames()).length,games.length,'Second load duplicated entries');
const api=await moduleFor('api');await api.evaluate();
const anon=await api.namespace.POST(new Request('https://example.test/api/games',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));assert.equal(anon.status,403);
const request=(method,body)=>new Request('https://example.test/api/games',{method,headers:{'Content-Type':'application/json','oai-authenticated-user-id':'test-owner','oai-authenticated-user-email':'johnlee3@gmail.com'},body:JSON.stringify(body)});
assert.equal((await api.namespace.PATCH(request('PATCH',{...azul,tags:['My tag'],summary:'Owner-written summary'}))).status,200);
assert.equal((await api.namespace.PATCH(request('PATCH',{...azul,tags:[42]}))).status,400);
const removed=games.find(g=>g.title==='7 Wonders');assert.equal((await api.namespace.DELETE(request('DELETE',{id:removed.id}))).status,200);
catalog.revision+=1;
catalog.games.find(g=>g.title==='Azul').tags.push('New default tag');
catalog.games.find(g=>g.title==='Azul').summary='New released summary';
catalog.games.find(g=>g.title==='Camel Up').notes='New release note';
catalog.games.find(g=>g.title==='Camel Up').description='A revised game description.';
games=await store.namespace.readGames();
assert(!games.some(g=>g.id===removed.id),'Archived entry came back');
assert.equal(games.find(g=>g.title==='Azul').tags.join(','),'My tag','Owner tags overwritten');
assert.equal(games.find(g=>g.title==='Azul').notes,'Owner note');
assert.equal(games.find(g=>g.title==='Azul').summary,'Owner-written summary');
assert.equal(games.find(g=>g.title==='Camel Up').notes,'New release note');
assert.equal(games.find(g=>g.title==='Camel Up').description,'A revised game description.');
const filter=await moduleFor('filter');await filter.evaluate();
const all=filter.namespace.filterGames(games,'',['Cooperative','Family'],'all','all');
const any=filter.namespace.filterGames(games,'',['Cooperative','Family'],'any','all');
assert(all.length>0&&any.length>all.length);assert(all.every(g=>g.tags.includes('Cooperative')&&g.tags.includes('Family')));
console.log('PASS: photo references, legacy import, idempotence, owner edits, archived entries, anonymous write rejection, input validation, and tag union/intersection.');
