import { database, mayEdit, readGames, reconcileCatalog } from '@/lib/catalog-store';
import catalog from '@/lib/catalog.json';
import type { Evidence } from '@/lib/catalog-types';

export const dynamic='force-dynamic';
const fail=(error:string,status=400)=>Response.json({error},{status});
function authorize(request:Request) {
  if(!mayEdit(request)) return fail('Only the catalog owner can save changes.',403);
  if(!request.headers.get('content-type')?.includes('application/json')) return fail('Send JSON.',415);
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return fail('Invalid request origin.',403);
  return null;
}
function validate(input:Record<string,unknown>) {
  if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200) throw new Error('Enter a title of up to 200 characters.');
  if(!Array.isArray(input.tags)||input.tags.length>20||input.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>60)) throw new Error('Use up to 20 short tags.');
  if(!['confirmed','uncertain'].includes(String(input.confidence))) throw new Error('Choose an identification status.');
  if(!['game','expansion','accessory','unknown'].includes(String(input.kind))) throw new Error('Choose an item type.');
  if(typeof input.notes!=='string'||input.notes.length>3000) throw new Error('Notes must be 3,000 characters or fewer.');
  if(typeof input.summary!=='string'||input.summary.length>240) throw new Error('The short description must be 240 characters or fewer.');
  if(typeof input.description!=='string'||input.description.length>3000) throw new Error('The full description must be 3,000 characters or fewer.');
  if(!Array.isArray(input.evidence)||input.evidence.length>20) throw new Error('Invalid photo evidence.');
  const evidence=input.evidence as Evidence[];
  if(evidence.some(e=>!e || !catalog.photos.some(p=>p.id===e.photoId)||typeof e.location!=='string'||e.location.length>500 || (e.region!==undefined && (!Number.isFinite(e.region.x)||!Number.isFinite(e.region.y)||!Number.isFinite(e.region.width)||!Number.isFinite(e.region.height)||e.region.x<0||e.region.y<0||e.region.width<=0||e.region.height<=0||e.region.x+e.region.width>1.00001||e.region.y+e.region.height>1.00001)))) throw new Error('Choose an existing evidence photo and a valid box region.');
  return {title:input.title.trim(),tags:[...new Set(input.tags.map(t=>(t as string).trim()))],confidence:String(input.confidence),kind:String(input.kind),notes:input.notes,summary:input.summary.trim(),description:input.description.trim(),evidence};
}
export async function GET() {
  try{return Response.json(await readGames(),{headers:{'Cache-Control':'no-store'}})}
  catch(error){console.error(error);return fail('The catalog is temporarily unavailable. Please try again.',503)}
}
export async function POST(request:Request) {
  const denied=authorize(request);if(denied)return denied;
  let data;
  try{data=validate(await request.json() as Record<string,unknown>)}catch(error){return fail(error instanceof Error?error.message:'Invalid game data.')}
  try{
    await reconcileCatalog();
    const result=await database().prepare("INSERT INTO games (title,category,tags,evidence,confidence,kind,notes,summary,description,position) VALUES (?,'Uncategorized',?,?,?,?,?,?,?,10000)")
      .bind(data.title,JSON.stringify(data.tags),JSON.stringify(data.evidence),data.confidence,data.kind,data.notes,data.summary,data.description).run();
    return Response.json({id:result.meta.last_row_id});
  }catch(error){console.error(error);return fail('Could not add this game. Your draft has been kept.',503)}
}
export async function PATCH(request:Request) {
  const denied=authorize(request);if(denied)return denied;
  let data,id;
  try{
    const input=await request.json() as Record<string,unknown>;
    if(!Number.isInteger(input.id)||Number(input.id)<=0) return fail('Invalid game ID.');
    id=input.id;data=validate(input);
  }catch(error){return fail(error instanceof Error?error.message:'Invalid game data.')}
  try{
    const result=await database().prepare("UPDATE games SET title=?,category='Uncategorized',tags=?,evidence=?,confidence=?,kind=?,notes=?,summary=?,description=? WHERE id=?")
      .bind(data.title,JSON.stringify(data.tags),JSON.stringify(data.evidence),data.confidence,data.kind,data.notes,data.summary,data.description,id).run();
    if(!result.meta.changes)return fail('That entry no longer exists.',404);
    return Response.json({ok:true});
  }catch(error){console.error(error);return fail('Could not save changes. Your draft has been kept.',503)}
}
export async function DELETE(request:Request) {
  const denied=authorize(request);if(denied)return denied;
  try{
    const {id}=await request.json() as {id:unknown};
    if(!Number.isInteger(id)||Number(id)<=0)return fail('Invalid game ID.');
    await database().prepare('UPDATE games SET archived=1 WHERE id=?').bind(id).run();
    return Response.json({ok:true});
  }catch(error){console.error(error);return fail('Could not remove this entry.',503)}
}
