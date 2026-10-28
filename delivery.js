// Optional published settings and notices. No project data is fetched or sent.
const PROTECTED_KEYS=['tenken-pwa-environment-settings-v1','tenken-basic-draft-v1','tenken-basic-history-v1','tenken-admin-pin-v1','tenken-personal-settings-v1'];
export async function fetchPublishedJson(path,timeout=4000){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{const response=await fetch(new URL(path,location.href),{cache:'no-store',signal:abort.signal});if(!response.ok)return null;return await response.json()}finally{clearTimeout(timer)}
}
export async function bootstrapPublishedSettings(api){
  const untouched=()=>PROTECTED_KEYS.every(key=>localStorage.getItem(key)===null);
  try{
    if(!untouched()||await api.hasProjects())return false;
    const pack=await fetchPublishedJson('./initial-settings.json',2000);
    if(!pack)return false;
    if(pack.schemaVersion!==1)throw Error('未対応の基本セット形式');
    api.validate(pack);
    // A second tab may have saved settings while the request was in flight.
    if(await api.hasProjects()||!untouched())return false;
    return api.write(pack);
  }catch(error){console.warn('公開基本セットの初回読込を見送りました',error);return false}
}
export function newerVersion(candidate,current){
  const parse=value=>/^\d+\.\d+(?:\.\d+)?$/.test(String(value))?String(value).split('.').map(Number):null;
  const a=parse(candidate),b=parse(current);if(!a||!b)return false;
  for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0)}return false;
}
export function installAppDelivery(api){
  let registration=null,status=null,checking=false,updating=false,started=false,dismissed='',failure='',reloadReady=false;
  const host=document.createElement('aside');host.className='delivery-notice';host.hidden=true;host.setAttribute('aria-label','アプリのお知らせ');
  const heading=document.createElement('strong'),message=document.createElement('p'),result=document.createElement('p'),actions=document.createElement('div');
  result.setAttribute('role','status');actions.className='delivery-actions';
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='btn btn-light';b.textContent=label;b.onclick=action;return b};
  const update=button('保存して更新',applyUpdate),retry=button('更新を確認',()=>check(true)),later=button('あとで',()=>{dismissed=signature();render()});
  update.classList.add('btn-primary');actions.append(update,retry,later);host.append(heading,message,result,actions);document.body.append(host);
  const badge=button('お知らせ',()=>{dismissed='';render()});badge.hidden=true;badge.id='deliveryNoticeButton';document.querySelector('.top-actions')?.append(badge);
  function content(){
    const lines=[];
    if(status?.maintenance?.enabled===true)lines.push(String(status.maintenance.message||'公開ファイルを更新しています。入力は続けられます。'));
    if(typeof status?.notice?.message==='string'&&status.notice.message.trim())lines.push(status.notice.message.trim());
    if(registration?.waiting||reloadReady)lines.push('新しいアプリの準備ができました。入力画面を保存して閉じてから更新できます。');
    else if(newerVersion(status?.latestVersion,api.version))lines.push(`更新版 v${status.latestVersion} が公開されています。準備ができると更新ボタンを使えます。`);
    return lines;
  }
  function signature(){return JSON.stringify([content(),!!registration?.waiting,reloadReady])}
  function render(){
    const lines=content(),hasContent=lines.length>0;badge.hidden=!hasContent;host.hidden=!hasContent||dismissed===signature();
    heading.textContent=status?.maintenance?.enabled===true?'メンテナンスのお知らせ':'アプリのお知らせ';message.textContent=lines.join('\n');result.textContent=failure;
    update.hidden=!registration?.waiting&&!reloadReady;update.disabled=updating;retry.disabled=checking||updating;later.disabled=updating;
  }
  async function check(manual=false){
    if(checking||navigator.onLine===false)return;checking=true;if(manual)failure='';render();
    try{
      const checks=[fetchPublishedJson('./app-status.json')];if(registration)checks.push(registration.update());
      const results=await Promise.allSettled(checks);
      if(results[0].status==='fulfilled'){const value=results[0].value;status=value?.format==='tenken-pwa-status'&&value.schemaVersion===1?value:null}
      if(manual&&results.some(item=>item.status==='rejected')){failure='更新情報を確認できませんでした。通信状態を確認して再度お試しください。';api.toast(failure)}
      else if(manual&&!content().length)api.toast('新しいお知らせはありません');
    }finally{checking=false;render()}
  }
  function watch(reg){
    registration=reg;
    const observe=()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>setTimeout(render,0))};
    reg.addEventListener('updatefound',observe);observe();render();
    let controller=navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{const next=navigator.serviceWorker.controller;if(controller&&next!==controller)reloadReady=true;controller=next;setTimeout(render,0)});
  }
  async function applyUpdate(){
    if(updating||(!registration?.waiting&&!reloadReady))return;
    if(!api.canUpdate()){failure='開いている入力・設定画面を「保存」して閉じてから、もう一度「保存して更新」を押してください。';render();return}
    if(status?.maintenance?.enabled===true){failure='メンテナンス終了後に更新してください。現在の入力は続けられます。';render();return}
    updating=true;failure='端末内に保存しています…';api.setBusy(true);render();
    try{
      await api.save();
      if(reloadReady){api.reload();return}
      const worker=registration.waiting;if(!worker)throw Error('更新の準備状態が変わりました。更新を確認してください。');
      failure='保存しました。アプリを更新しています…';render();
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);worker.removeEventListener('statechange',stateChanged)};
        const changed=()=>{cleanup();resolve()};
        const stateChanged=()=>{if(worker.state==='redundant'){cleanup();reject(Error('更新に失敗しました。現在の画面で作業を続けられます。'))}};
        const timer=setTimeout(()=>{cleanup();reject(Error('更新を確認できません。通信を確認して再度お試しください。'))},15000);
        navigator.serviceWorker.addEventListener('controllerchange',changed);worker.addEventListener('statechange',stateChanged);
        worker.postMessage({type:'SKIP_WAITING'});
      });
      api.reload();
    }catch(error){failure='保存または更新を完了できなかったため、画面の切替を中止しました。'+(error.message||'案件を書き出して保管してください。')}
    finally{updating=false;api.setBusy(false);render()}
  }
  async function start(){
    if(started)return;started=true;
    if(window.isSecureContext&&'serviceWorker'in navigator){try{watch(await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}))}catch(error){console.warn('アプリ更新を確認できません',error)}}
    await check();
    window.addEventListener('online',()=>check());document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
    setInterval(()=>{if(!document.hidden)check()},120000);
  }
  return {start};
}
