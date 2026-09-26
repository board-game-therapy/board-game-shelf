'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, Search, SlidersHorizontal, X, Pencil, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import catalog from '@/lib/catalog.json';
import type { Game, Evidence } from '@/lib/catalog-types';
import { filterGames } from '@/lib/catalog-filters';

type Draft={title:string;tagsText:string;confidence:Game['confidence'];kind:Game['kind'];notes:string;summary:string;description:string;evidence:Evidence[]};
const blank:Draft={title:'',tagsText:'',confidence:'confirmed',kind:'game',notes:'',summary:'',description:'',evidence:[]};
const kindNames={game:'Game',expansion:'Expansion',accessory:'Accessory',unknown:'Unidentified box'};
const tagsFrom=(s:string)=>[...new Set(s.split(',').map(t=>t.trim()).filter(Boolean))];
type Photo=typeof catalog.photos[number];
function GamePhoto({photo,evidence,alt}:{photo:Photo;evidence?:Evidence;alt:string}) {
  const region=evidence?.region;
  const ratio=region?(photo.width*region.width)/(photo.height*region.height):photo.width/photo.height;
  return <div className="game-photo" style={{aspectRatio:`${ratio}`,maxWidth:`min(100%, ${ratio*52}dvh)`}}>
    <img src={photo.src} alt={alt} style={region?{position:'absolute',maxWidth:'none',width:`${100/region.width}%`,height:`${100/region.height}%`,left:`${-100*region.x/region.width}%`,top:`${-100*region.y/region.height}%`}:undefined}/>
  </div>;
}

export default function Shelf({canEdit,signInUrl}:{canEdit:boolean;signInUrl:string}) {
  const [games,setGames]=useState<Game[]>([]);
  const [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [query,setQuery]=useState(''), [tags,setTags]=useState<string[]>([]), [match,setMatch]=useState<'all'|'any'>('all');
  const [kind,setKind]=useState('all'),[showAllTags,setShowAllTags]=useState(false);
  const [editing,setEditing]=useState<number|'new'|null>(null),[draft,setDraft]=useState<Draft>(blank);
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
  const [evidenceGame,setEvidenceGame]=useState<Game|null>(null),[photoIndex,setPhotoIndex]=useState(0);
  const [selectedGame,setSelectedGame]=useState<Game|null>(null);
  const [gallery,setGallery]=useState(false),[help,setHelp]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
  const gamesRef=useRef(games); gamesRef.current=games;
  const refresh=useCallback(async()=>{
    try{
      const response=await fetch('/api/games',{cache:'no-store'});
      const data=await response.json() as Game[] & {error?:string};
      if(!response.ok)throw new Error(data.error||'Could not load the catalog.');
      setGames(data);setError('');return data;
    }catch(e){setError(e instanceof Error?e.message:'Could not load the catalog.');throw e}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void refresh().catch(()=>{})},[refresh]);
  const tagCounts=useMemo(()=>{
    const counts=new Map<string,number>(); games.forEach(g=>g.tags.forEach(t=>counts.set(t,(counts.get(t)||0)+1)));
    return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  },[games]);
  const visible=useMemo(()=>filterGames(games,query,tags,match,kind),[games,query,tags,match,kind]);
  const displayedTags=showAllTags?tagCounts:[...tagCounts.filter(([t])=>tags.includes(t)),...tagCounts.filter(([t])=>!tags.includes(t)).slice(0,10)];
  const verified=games.filter(g=>g.confidence==='confirmed');
  const uncertain=games.filter(g=>g.confidence==='uncertain');
  const evidenceList:Evidence[]=evidenceGame?.evidence || (gallery?catalog.photos.map(p=>({photoId:p.id,location:''})):[]);
  const currentEvidence=evidenceList[photoIndex];
  const currentPhoto=catalog.photos.find(p=>p.id===currentEvidence?.photoId);
  const selectedEvidence=selectedGame?.evidence.find(e=>e.region)||selectedGame?.evidence[0];
  const selectedPhoto=catalog.photos.find(p=>p.id===selectedEvidence?.photoId);
  const toggleTag=(tag:string)=>setTags(prev=>prev.includes(tag)?prev.filter(t=>t!==tag):[...prev,tag]);
  function start(game?:Game){
    setDraft(game?{title:game.title,tagsText:game.tags.join(', '),confidence:game.confidence,kind:game.kind,notes:game.notes,summary:game.summary,description:game.description,evidence:game.evidence.map(e=>({...e}))}:{...blank,evidence:[]});
    setEditing(game?game.id:'new');setSaveError('');setConfirmDelete(false);
  }
  async function mutate(method:string,body:unknown){
    const response=await fetch('/api/games',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json() as {error?:string;id?:number};
    if(!response.ok)throw new Error(data.error||'Could not save changes.');
    return data;
  }
  async function save(){
    setSaving(true);setSaveError('');
    try{
      const {tagsText,...fields}=draft;
      await mutate(editing==='new'?'POST':'PATCH',{...fields,tags:tagsFrom(tagsText),...(editing==='new'?{}:{id:editing})});
      setEditing(null);await refresh();
    }catch(e){setSaveError(e instanceof Error?e.message:'Could not save. Your draft has been kept.')}
    finally{setSaving(false)}
  }
  async function remove(){
    setSaving(true);setSaveError('');
    try{await mutate('DELETE',{id:editing});setEditing(null);await refresh()}
    catch(e){setSaveError(e instanceof Error?e.message:'Could not remove the entry.')}
    finally{setSaving(false)}
  }
  useEffect(()=>{
    type Tool={name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:any)=>unknown};
    const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const life=new AbortController();
    function register(tool:Tool){try{void Promise.resolve(context!.registerTool(tool,{signal:life.signal})).catch(()=>{})}catch{}}
    register({name:'read_game_catalog',title:'Read game catalog',description:'Read the saved games, tags, identification status and photo evidence.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({games:gamesRef.current,photos:catalog.photos})});
    register({name:'filter_game_catalog',title:'Filter game catalog',description:'Show games matching selected tags and optional search text; changes only the current view.',inputSchema:{type:'object',properties:{tags:{type:'array',items:{type:'string'}},match:{type:'string',enum:['all','any']},query:{type:'string'}},required:['tags'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:(input:{tags:string[];match?:'all'|'any';query?:string})=>{
      if(!input||!Array.isArray(input.tags)||input.tags.some(t=>typeof t!=='string')||(input.match&&!['all','any'].includes(input.match))||(input.query!==undefined&&typeof input.query!=='string'))throw new Error('Invalid filter.');
      setTags(input.tags);setMatch(input.match||'all');setQuery(input.query||'');setKind('all');
      return {matches:filterGames(gamesRef.current,input.query||'',input.tags,input.match||'all','all').map(g=>({id:g.id,title:g.title}))};
    }});
    if(canEdit)register({name:'set_game_tags',title:'Save game tags',description:'Replace tags on one existing game and refresh the visible catalog.',inputSchema:{type:'object',properties:{id:{type:'integer'},tags:{type:'array',items:{type:'string'},maxItems:20}},required:['id','tags'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:{id:number;tags:string[]})=>{
      if(!input||!Number.isInteger(input.id)||!Array.isArray(input.tags)||input.tags.some(t=>typeof t!=='string'||!t.trim())||input.tags.length>20)throw new Error('Invalid game tags.');
      const game=gamesRef.current.find(g=>g.id===input.id);if(!game)throw new Error('Game not found.');
      await mutate('PATCH',{...game,tags:input.tags});await refresh();return {id:input.id,tags:input.tags};
    }});
    return()=>life.abort();
  },[canEdit,refresh]);
  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="mark" aria-hidden="true"><i/><i/><i/></span><span>MY BOARD GAME SHELF</span></div><div className="top-actions"><button onClick={()=>{setGallery(true);setPhotoIndex(0)}}><Camera size={17}/> Photos</button><button onClick={()=>setHelp(true)}><BookOpen size={17}/> Updating</button></div></header>
    <div className="content">
      <div className="heading"><div><p className="eyebrow">THE COLLECTION</p><h1>Games on the shelf<span className="title-period">.</span></h1><p className="intro">Find the overlap. Follow the photos. Keep the collection growing.</p></div>{canEdit?<button className="primary" onClick={()=>start()}><Plus size={17}/> Add a game</button>:<a className="owner-link" href={signInUrl} target="_top">Owner editing</a>}</div>
      <div className="stats"><div><strong>{verified.filter(g=>g.kind==='game').length}</strong><span>games identified</span></div><div><strong>{verified.filter(g=>g.kind==='expansion').length}</strong><span>expansions</span></div><div><strong>{uncertain.length}</strong><span>to verify</span></div><div><strong>{catalog.photos.length}</strong><span>source photos</span></div></div>
      <section className="workspace" aria-label="Game catalog">
        <div className="toolbar"><label className="search"><Search size={18}/><input type="search" aria-label="Search games, tags or notes" placeholder="Search games, tags or notes" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="result-count">{visible.length} of {games.length} entries</span></div>
        <nav className="type-filters" aria-label="Item type">{[['all','All entries'],['game','Games'],['expansion','Expansions'],['accessory','Accessories'],['uncertain','To verify']].map(([v,l])=><button key={v} aria-pressed={kind===v} className={kind===v?'selected':''} onClick={()=>setKind(v)}>{l}</button>)}</nav>
        <div className="tag-controls"><div className="tag-heading"><span><SlidersHorizontal size={15}/> Filter by tags</span><div>{tags.length>0&&<button className="clear-link" onClick={()=>setTags([])}>Clear tags</button>}<button className="clear-link" onClick={()=>setShowAllTags(!showAllTags)}>{showAllTags?'Fewer tags':`All ${tagCounts.length} tags`}</button></div></div><div className="tag-filters">{displayedTags.map(([tag,count])=><button key={tag} aria-pressed={tags.includes(tag)} className={tags.includes(tag)?'active':''} onClick={()=>toggleTag(tag)}>{tag}<span>{count}</span></button>)}</div>
          {tags.length>1&&<RadioGroup className="match-control" value={match} onValueChange={v=>setMatch(v as 'all'|'any')} aria-label="Match tags"><label><RadioGroupItem value="all" id="match-all"/> Match all selected tags</label><label><RadioGroupItem value="any" id="match-any"/> Match any selected tag</label></RadioGroup>}
          {tags.length>0&&<p className="filter-summary">{match==='all'?'All of':'Any of'}: {tags.join(' · ')}</p>}
        </div>
        {error&&<div className="error" role="alert">{error} <button onClick={()=>{setLoading(true);void refresh().catch(()=>{})}}>Try again</button></div>}
        {loading?<p className="empty">Loading the collection…</p>:visible.length===0?<div className="empty"><p>No entries match these filters.</p><button className="secondary" onClick={()=>{setTags([]);setQuery('');setKind('all')}}>Clear all filters</button></div>:<div className="list">{visible.map(g=><article key={g.id} className={'game-row '+(g.confidence==='uncertain'?'uncertain':'')}>
          <div className={'spine '+(g.kind==='expansion'?'expansion':g.confidence==='uncertain'?'unverified':'')} aria-hidden="true"/>
          <div className="game-main"><div className="game-title"><button className="game-open" onClick={()=>setSelectedGame(g)}>{g.title}</button>{g.kind!=='game'&&<span className="kind-label">{kindNames[g.kind]}</span>}{g.confidence==='uncertain'&&<span className="verify">To verify</span>}</div><p className="game-summary">{g.summary||'Open for game details.'}</p><div className="game-tags">{g.tags.map(tag=><button key={tag} aria-pressed={tags.includes(tag)} className={tags.includes(tag)?'active':''} onClick={()=>toggleTag(tag)}>{tag}</button>)}</div></div>
          <div className="row-actions">{g.evidence.length?<button className="evidence-button" onClick={()=>{setEvidenceGame(g);setPhotoIndex(0)}} aria-label={`Evidence for ${g.title}`}><Camera size={15}/><span>Evidence</span><small>{g.evidence.length}</small></button>:null}{canEdit&&<button className="edit-link" aria-label={`Edit ${g.title}`} onClick={()=>start(g)}><Pencil size={14}/><span>Edit</span></button>}</div>
        </article>)}</div>}
      </section>
      <footer>Last photo review: September 25, 2026 · Titles and editions, not a count of physical copies.<br/>Tags describe play style and theme. “Family” is not a specific age recommendation.</footer>
    </div>
    <Dialog open={Boolean(selectedGame)} onOpenChange={open=>{if(!open)setSelectedGame(null)}}>
      <DialogContent className="game-detail-dialog"><DialogTitle>{selectedGame?.title}</DialogTitle><DialogDescription>{selectedGame?.summary||'Game details'}</DialogDescription>
        {selectedPhoto&&<figure className="detail-figure"><GamePhoto photo={selectedPhoto} evidence={selectedEvidence} alt={`${selectedGame?.title} in the collection`}/><figcaption>{selectedEvidence?.region?'Box highlighted from':'Photo from'} {selectedPhoto.label}. <button onClick={()=>{setPhotoIndex(selectedGame!.evidence.findIndex(e=>e.photoId===selectedEvidence?.photoId));setSelectedGame(null);setEvidenceGame(selectedGame)}}>See full photo and evidence →</button></figcaption></figure>}
        {selectedGame?.description&&<p className="detail-copy">{selectedGame.description}</p>}
        {selectedGame?.tags.length? <div className="detail-tags">{selectedGame.tags.map(tag=><span key={tag}>{tag}</span>)}</div>:null}
        {selectedGame?.notes&&<p className="detail-note"><strong>Catalog note:</strong> {selectedGame.notes}</p>}
        {!selectedPhoto&&<p className="detail-note">No matching collection photo is available yet.</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(evidenceGame)||gallery} onOpenChange={open=>{if(!open){setEvidenceGame(null);setGallery(false)}}}>
      <DialogContent className="evidence-dialog"><DialogTitle>{evidenceGame?evidenceGame.title:'Source photographs'}</DialogTitle><DialogDescription>{evidenceGame?'Photographic evidence for this entry.':'Seven photographs used to identify the collection.'}</DialogDescription>
        <div className="photo-tabs">{evidenceList.map((ev,i)=>{const p=catalog.photos.find(p=>p.id===ev.photoId);return <button key={ev.photoId+i} className={i===photoIndex?'active':''} onClick={()=>setPhotoIndex(i)}>{p?.label||ev.photoId}</button>})}</div>
        {currentPhoto&&<><p className="location"><strong>Look here:</strong> {currentEvidence?.location||currentPhoto.label}</p><div className="evidence-photo" style={{aspectRatio:`${currentPhoto.width}/${currentPhoto.height}`}}><img src={currentPhoto.src} alt={`${currentPhoto.label}: ${currentEvidence?.location||'board game collection'}`}/>{currentEvidence?.region&&<span className="photo-region" style={{left:`${currentEvidence.region.x*100}%`,top:`${currentEvidence.region.y*100}%`,width:`${currentEvidence.region.width*100}%`,height:`${currentEvidence.region.height*100}%`}} aria-hidden="true"/>}</div><a className="full-photo" href={currentPhoto.src} target="_blank" rel="noreferrer">Open full-size photo ↗</a></>}
        {evidenceGame&&evidenceGame.sources?.length? <div className="source-links">Title / game reference: {evidenceGame.sources.map((url,i)=><a href={url} target="_blank" rel="noreferrer" key={url}>Source {i+1} ↗</a>)}</div>:null}
      </DialogContent>
    </Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="help-dialog"><DialogTitle>Keep the shelf up to date</DialogTitle><DialogDescription>New photos can add games and improve existing entries.</DialogDescription><ol className="update-steps"><li><strong>Photograph the title.</strong> A front or readable spine is best. Include expansion subtitles.</li><li><strong>Send the photo here.</strong> Ask to update your board game shelf. New titles get descriptions, tags and photo evidence; familiar titles gain another photo.</li><li><strong>Check uncertain matches.</strong> Use “To verify” to find obscured boxes and editions that need another look.</li><li><strong>Fine-tune the details.</strong> The owner can edit descriptions, tags and notes directly. Multiple tags are separated by commas.</li></ol><p>Browsing and photo evidence are public. Saving edits is reserved for the catalog owner.</p><p>Multiple sightings of the same title share one entry; standalone editions and expansions have their own entries.</p></DialogContent></Dialog>
    <Dialog open={editing!==null} onOpenChange={open=>{if(!open&&!saving)setEditing(null)}}><DialogContent className="editor-dialog"><DialogTitle>{editing==='new'?'Add a game':'Edit entry'}</DialogTitle><DialogDescription>Use multiple tags to make this game appear in overlapping groups.</DialogDescription>
      <form className="editor" onSubmit={e=>{e.preventDefault();void save()}}>
        <label>Title<input value={draft.title} maxLength={200} autoFocus required onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label>Tags, separated by commas<input value={draft.tagsText} placeholder="Cooperative, Family, Deduction" onChange={e=>setDraft({...draft,tagsText:e.target.value})}/></label>
        <label>Short description<input value={draft.summary} maxLength={240} placeholder="What do players do?" onChange={e=>setDraft({...draft,summary:e.target.value})}/></label>
        <label>Full description<textarea value={draft.description} rows={3} maxLength={3000} placeholder="How does it play, and what makes it distinctive?" onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
        <div className="suggested-tags">{tagCounts.slice(0,12).map(([tag])=><button key={tag} type="button" onClick={()=>setDraft({...draft,tagsText:[...new Set([...tagsFrom(draft.tagsText),tag])].join(', ')})}>+ {tag}</button>)}</div>
        <fieldset><legend>Identification</legend><RadioGroup className="editor-radio" value={draft.confidence} onValueChange={v=>setDraft({...draft,confidence:v as Game['confidence']})}><label><RadioGroupItem value="confirmed"/> Identified</label><label><RadioGroupItem value="uncertain"/> To verify</label></RadioGroup></fieldset>
        <fieldset><legend>Item type</legend><RadioGroup className="editor-radio" value={draft.kind} onValueChange={v=>setDraft({...draft,kind:v as Game['kind']})}>{Object.entries(kindNames).map(([v,l])=><label key={v}><RadioGroupItem value={v}/>{l}</label>)}</RadioGroup></fieldset>
        <label>Notes<textarea value={draft.notes} rows={2} maxLength={3000} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
        <fieldset><legend>Photo evidence</legend><p className="field-hint">Select each photo that shows this box, then describe where to look.</p><div className="evidence-picker">{catalog.photos.map(p=>{const e=draft.evidence.find(e=>e.photoId===p.id);return <div key={p.id}><label><Checkbox checked={Boolean(e)} onCheckedChange={checked=>setDraft({...draft,evidence:checked?[...draft.evidence,{photoId:p.id,location:''}]:draft.evidence.filter(e=>e.photoId!==p.id)})}/>{p.label}</label>{e&&<input aria-label={`Box location in ${p.label}`} value={e.location} placeholder="e.g. Middle shelf, far left" maxLength={500} onChange={event=>setDraft({...draft,evidence:draft.evidence.map(ev=>ev.photoId===p.id?{...ev,location:event.target.value}:ev)})}/>}</div>})}</div></fieldset>
        {saveError&&<p className="error" role="alert">{saveError}</p>}
        <div className="editor-actions"><div>{editing!=='new'&&<button type="button" className="danger" disabled={saving} onClick={()=>setConfirmDelete(true)}>Remove</button>}</div><div><button type="button" className="secondary" disabled={saving} onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save game'}</button></div></div>
        {confirmDelete&&<div className="delete-confirm"><p>Remove this entry from the catalog?</p><button type="button" className="danger" disabled={saving} onClick={()=>void remove()}>Yes, remove entry</button><button type="button" className="secondary" onClick={()=>setConfirmDelete(false)}>Keep it</button></div>}
      </form>
    </DialogContent></Dialog>
  </main>;
}
