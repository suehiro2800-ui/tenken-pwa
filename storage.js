// Photos/PDFs are immutable assets. Text commits and the previous checkpoints
// reference them instead of cloning every binary on each keystroke.
export function createProjectStorage({indexedDB,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID(),timeoutMs=15000}){
  let connection,opening,tail=Promise.resolve();
  const assetCache=new Map();
  const summary=p=>{
    const photos=new Set(Object.keys(p.mediaAssetIds||p.media||{}));for(const ph of [...(p.markers||[]).flatMap(m=>(m.findings||[]).flatMap(f=>f.photos||[])),...(p.fieldMarkers||[]).flatMap(m=>m.photos||[])])if(ph.blob)photos.add(ph.id);
    return {id:p.id,name:p.name||'名称未設定',updatedAt:p.updatedAt||'',markerCount:p.markers?.length||0,photoCount:photos.size};
  };
  function open(){
    if(connection)return Promise.resolve(connection);if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      let expired=false;const timer=setTimeout(()=>{expired=true;opening=null;reject(Error('保存領域を開けません。別の画面を閉じ、再試行してください。'))},timeoutMs);
      const request=indexedDB.open('tenken-pwa-local',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
        for(const [name,keyPath] of [['assets','id'],['history','projectId'],['summaries','id']])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath});
        // Keep all legacy records intact; only populate the lightweight index.
        const cursor=request.transaction.objectStore('projects').openCursor();
        cursor.onsuccess=()=>{if(cursor.result){request.transaction.objectStore('summaries').put(summary(cursor.result.value));cursor.result.continue()}};
      };
      request.onerror=()=>{clearTimeout(timer);opening=null;reject(request.error)};
      request.onsuccess=()=>{
        clearTimeout(timer);if(expired){request.result.close();return}
        connection=request.result;connection.onversionchange=()=>{connection.close();connection=null;opening=null};
        connection.onclose=()=>{connection=null;opening=null;assetCache.clear()};resolve(connection);
      };
    });return opening;
  }
  async function transaction(names,mode,run){
    const db=await open();return new Promise((resolve,reject)=>{
      let result;const tx=db.transaction(names,mode),timer=setTimeout(()=>{try{tx.abort()}catch{}reject(Error('保存が時間内に完了しませんでした。再試行またはZIPへ書き出してください。'))},timeoutMs);
      tx.oncomplete=()=>{clearTimeout(timer);resolve(result)};
      tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error||Error('端末内への保存が中断されました'))};
      const fail=error=>{clearTimeout(timer);try{tx.abort()}catch{}reject(error)};
      try{run(tx,value=>result=value,fail)}catch(error){fail(error)}
    });
  }
  const read=(store,key)=>transaction([store],'readonly',(tx,done)=>{const r=tx.objectStore(store).get(key);r.onsuccess=()=>done(r.result)});
  const list=()=>transaction(['summaries'],'readonly',(tx,done)=>{const r=tx.objectStore('summaries').getAll();r.onsuccess=()=>done((r.result||[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))});
  function stripPhotoBlobs(p){
    const clean=ph=>{const {blob,...rest}=ph;return rest};
    return {...p,markers:(p.markers||[]).map(m=>({...m,findings:(m.findings||[]).map(f=>({...f,photos:(f.photos||[]).map(clean)}))})),fieldMarkers:(p.fieldMarkers||[]).map(m=>({...m,photos:(m.photos||[]).map(clean)}))};
  }
  function encode(project,known,assets){
    const media={...(project.media||{})};
    for(const m of project.markers||[])for(const f of m.findings||[])for(const ph of f.photos||[])if(ph.blob&&!media[ph.id])media[ph.id]=ph.blob;
    for(const m of project.fieldMarkers||[])for(const ph of m.photos||[])if(ph.blob&&!media[ph.id])media[ph.id]=ph.blob;
    const saveAsset=(slot,blob)=>{
      if(!blob)return null;
      const prior=known.get(slot)?.get(blob)||assets.find(a=>a.slot===slot&&a.blob===blob)?.id;if(prior)return prior;
      const id=`${project.id}:${newId()}`;assets.push({id,projectId:project.id,slot,blob,createdAt:now()});return id;
    };
    const copy=stripPhotoBlobs(project);delete copy.pdfBlob;delete copy.media;
    copy.storageFormat=2;copy.pdfAssetId=saveAsset('pdf',project.pdfBlob);
    copy.mediaAssetIds=Object.fromEntries(Object.entries(media).filter(([,blob])=>blob).map(([id,blob])=>[id,saveAsset('photo:'+id,blob)]));
    return copy;
  }
  function put(project){
    // Take the text snapshot at invocation, before waiting on another commit.
    const snapshot=structuredClone(stripPhotoBlobs({...project,media:undefined,pdfBlob:undefined}));
    snapshot.pdfBlob=project.pdfBlob;snapshot.media={...(project.media||{})};
    for(const m of project.markers||[])for(const f of m.findings||[])for(const ph of f.photos||[])if(ph.blob&&!snapshot.media[ph.id])snapshot.media[ph.id]=ph.blob;
    const job=async()=>{
      const known=assetCache.get(project.id)||new Map(),assets=[];
      const current=encode(snapshot,known,assets);current.savedAt=now();
      await transaction(['projects','assets','history','summaries'],'readwrite',(tx,_done,fail)=>{
        const projects=tx.objectStore('projects'),histories=tx.objectStore('history');
        const old=projects.get(project.id),hist=histories.get(project.id);let previous,history,arrived=0;
        const commit=()=>{
          if(++arrived!==2)return;
          try{
          // Migrate a legacy predecessor inside the same atomic transaction.
          if(previous&&previous.storageFormat!==2)previous=encode(previous,new Map(),assets);
          let checkpoints=history?.checkpoints||[];
          // Keep the immediately previous commit plus spaced checkpoints so
          // continuous typing cannot erase the useful rollback window.
          if(previous){const spaced=checkpoints.slice(1),last=spaced[0];if(checkpoints[0]&&(!last||Date.parse(previous.savedAt||previous.updatedAt)-Date.parse(last.savedAt||last.updatedAt)>=60000))spaced.unshift(checkpoints[0]);checkpoints=[previous,...spaced]}
          histories.put({projectId:project.id,checkpoints:checkpoints.slice(0,4)});
          for(const asset of assets)tx.objectStore('assets').put(asset);
          projects.put(current);tx.objectStore('summaries').put(summary(current));
          }catch(error){fail(error)}
        };
        old.onsuccess=()=>{previous=old.result;commit()};hist.onsuccess=()=>{history=hist.result;commit()};
      });
      for(const asset of assets){if(!known.has(asset.slot))known.set(asset.slot,new WeakMap());known.get(asset.slot).set(asset.blob,asset.id)}
      assetCache.set(project.id,known);return current.savedAt;
    };
    const next=tail.then(job);tail=next.catch(()=>{});return next;
  }
  async function hydrate(record){
    if(!record)return null;if(record.storageFormat!==2)return record;
    const p={...record,media:{},pdfBlob:null},known=assetCache.get(record.id)||new Map();
    await transaction(['assets'],'readonly',(tx)=>{
      const load=(id,slot,apply)=>{if(!id)return;const r=tx.objectStore('assets').get(id);r.onsuccess=()=>{if(r.result?.blob){apply(r.result.blob);if(!known.has(slot))known.set(slot,new WeakMap());known.get(slot).set(r.result.blob,id)}}};
      load(record.pdfAssetId,'pdf',blob=>p.pdfBlob=blob);
      for(const [id,key] of Object.entries(record.mediaAssetIds||{}))load(key,'photo:'+id,blob=>p.media[id]=blob);
    });
    assetCache.set(p.id,known);delete p.storageFormat;delete p.pdfAssetId;delete p.mediaAssetIds;delete p.savedAt;return p;
  }
  const get=async id=>hydrate(await read('projects',id));
  async function history(id){return (await read('history',id))?.checkpoints||[]}
  async function photos(id){
    const found=new Map();
    // Include legacy media and embedded photos even when no current finding
    // references them. Never rewrite records while rescuing photos.
    const p=await read('projects',id);
    if(p){for(const [key,blob] of Object.entries(p.media||{}))if(blob)found.set('legacy:'+key,{id:key,blob});for(const ph of [...(p.markers||[]).flatMap(m=>(m.findings||[]).flatMap(f=>f.photos||[])),...(p.fieldMarkers||[]).flatMap(m=>m.photos||[])])if(ph.blob&&!found.has('legacy:'+ph.id))found.set('legacy:'+ph.id,{id:ph.id,blob:ph.blob})}
    await transaction(['assets'],'readonly',(tx)=>{const r=tx.objectStore('assets').openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;const a=cursor.value;if(a.projectId===id&&a.slot.startsWith('photo:'))found.set(a.id,{id:a.slot.slice(6),blob:a.blob,createdAt:a.createdAt});cursor.continue()}});
    return [...found.values()];
  }
  function remove(id){
    const job=()=>transaction(['projects','assets','history','summaries'],'readwrite',tx=>{
      for(const name of ['projects','history','summaries'])tx.objectStore(name).delete(id);
      const r=tx.objectStore('assets').openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.value.projectId===id)c.delete();c.continue()};assetCache.delete(id);
    });const next=tail.then(job);tail=next.catch(()=>{});return next;
  }
  return {open,put,get,list,history,hydrate,photos,remove};
}
