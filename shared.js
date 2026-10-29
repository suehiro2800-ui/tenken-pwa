import {cleanSettingsPack,SETTING_COLLECTIONS,syncPaletteColors} from './reuse.js';
export const SHARED_BASE_CACHE_KEY='tenken-published-base-v1';
const copy=x=>structuredClone(x);
const norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
// Published definitions win by ID; locally added definitions and records survive.
export function mergeManagedBase(local,base){
  const result=cleanSettingsPack(local),shared=cleanSettingsPack(base);
  for(const key of SETTING_COLLECTIONS){
    const localItems=result[key],ids=new Set(shared[key].map(x=>x.id)),names=new Set(shared[key].map(x=>norm(x.name||x.text)));
    const managed=shared[key].map(item=>{
      const next=copy(item),old=localItems.find(x=>x.id===item.id);
      if(key==='types'&&old){
        for(const k of ['paletteFavorite','enabled'])if(old[k]!==undefined)next[k]=old[k];
        next.quickFindings=[...(next.quickFindings||[]),...(old.quickFindings||[]).filter(q=>!(next.quickFindings||[]).some(x=>x.id===q.id))];
        next.extraFields=[...new Set([...(next.extraFields||[]),...(old.extraFields||[])])];
      }
      return next;
    });
    const extras=localItems.filter(x=>!ids.has(x.id)).map(item=>{
      const next=copy(item);
      if(key!=='wordingSets'&&names.has(norm(next.name))){let name=next.name+'（個別）',i=2;while(names.has(norm(name)))name=next.name+`（個別${i++}）`;next.name=name}
      names.add(norm(next.name||next.text));return next;
    });
    result[key]=[...managed,...extras];
  }
  // Alias equivalent scoped phrases; callers remap references while retaining
  // the text already stored in findings.
  const aliases=new Map(),phrases=[];
  for(const w of result.wordingSets){const found=phrases.find(x=>norm(x.text)===norm(w.text)&&(x.equipmentGroupId||'')===(w.equipmentGroupId||'')&&(x.severity||'要是正')===(w.severity||'要是正'));if(found)aliases.set(w.id,found.id);else phrases.push(w)}
  result.wordingSets=phrases;
  for(const t of result.types){for(const q of t.quickFindings||[]){if(aliases.has(q.phraseId))q.phraseId=aliases.get(q.phraseId)}t.workCategoryIds=(t.workCategoryIds||[]).filter(id=>result.workCategoryMaster.some(g=>g.id===id));for(const q of t.quickFindings||[])q.workCategoryIds=(q.workCategoryIds||[]).filter(id=>result.workCategoryMaster.some(g=>g.id===id))}
  result.types.forEach((t,i)=>t.paletteOrder=i);
  result.findingCategories=[...new Set([...shared.findingCategories,...result.findingCategories])];
  result.findingReportDefaults={...shared.findingReportDefaults,...result.findingReportDefaults};
  return {pack:cleanSettingsPack(syncPaletteColors(result)),phraseAliases:aliases};
}
export function installPublishedBaseSync(api){
  let running=false,applying=false,pending=null,started=false,state={kind:'idle',message:'公開基本セットを確認します。',path:'./initial-settings.json'};
  const update=next=>{state={...state,...next};api.onStatus?.(state)};
  async function get(path){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2200);
    try{const response=await fetch(new URL(path,location.href),{cache:'no-store',signal:controller.signal});if(response.status===404)return null;if(!response.ok)throw Error('公開ファイルを取得できません（'+response.status+'）。');return await response.json()}finally{clearTimeout(timer)}
  }
  async function flush(){
    if(applying||!pending||!api.canApply())return false;applying=true;
    const work=pending;
    try{if(!work.stored){await api.store(work.pack,work.record);work.stored=true}if(!api.canApply()||await api.apply()===false){update({kind:'waiting',message:'基本セットを受信しました。入力・設定画面を閉じると反映します。',path:work.record.path});return false}if(pending===work)pending=null;update({kind:'ready',message:`基本セット反映済み：アイコン ${work.pack.types.length}種（画像付き ${work.pack.types.filter(t=>t.iconData).length}種）`,path:work.record.path,checkedAt:work.record.checkedAt});return true}
    catch(e){update({kind:'error',message:'基本セットを保存・反映できませんでした。'+e.message});return false}finally{applying=false}
  }
  async function check(){
    if(running)return false;running=true;
    try{
      if(navigator.onLine===false){update({kind:'offline',message:'オフラインです。前回の基本セットと個別追加を使います。'});return false}
      update({kind:'checking',message:'公開基本セットを確認しています。'});
      let path='./initial-settings.json',data=await get(path);
      if(!data){path='./基本セット.json';data=await get(path)}
      if(!data){update({kind:'missing',message:'公開基本セットが見つかりません。確定後に initial-settings.json を書き出し、index.htmlと同じ公開フォルダへ置いてください。',path:'./initial-settings.json'});return false}
      const pack=api.prepare(data),old=api.cache();
      const text=JSON.stringify(pack);let revision;if(crypto.subtle?.digest)revision=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');else{let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i)}revision=(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+text.length}
      const record={pack,revision,path,checkedAt:new Date().toISOString()};
      pending={pack,record,stored:old?.revision===revision};
      if(!await flush())if(state.kind!=='error')update({kind:'waiting',message:'新しい基本セットを確認しました。入力・設定画面を閉じると、個別追加を残して反映します。',path});
      return true;
    }catch(e){update({kind:'error',message:'公開基本セットを読み込めません。前回の設定を保持します。ファイル名・公開先を確認してください。',detail:e.message});return false}finally{running=false}
  }
  function start(){if(started)return;started=true;window.addEventListener('online',()=>check());window.addEventListener('focus',()=>check());document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)check()});setInterval(()=>{if(!document.hidden)check()},120000);flush()}
  return {check,flush,start,status:()=>copy(state)};
}
