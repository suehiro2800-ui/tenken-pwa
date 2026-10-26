// Basic-pack editor. Holds its own draft; never borrows the active project's state.
export function installBasicPackManager(api) {
  const DRAFT='tenken-basic-draft-v1', HISTORY='tenken-basic-history-v1', PIN='tenken-admin-pin-v1';
  const clone=v=>structuredClone(v), norm=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  let unlocked=false, draft, tab='types', root;
  const labels={types:'アイコン',paletteGroupMaster:'分類・表示',wordingSets:'文言セット',rules:'入力・報告設定',initial:'初期設定',transfer:'取込・更新'};
  const esc=api.escapeHtml;
  const el=(tag,text,action)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(action)e.onclick=action;return e};
  const message=text=>{root.querySelector('[role=status]').textContent=text};
  function persist(){try{localStorage.setItem(DRAFT,JSON.stringify(draft));message('下書きを保存しました')}catch{message('下書きを保存できません。空き容量を確認し、書き出してください。')}}
  async function digest(value,salt){const bytes=new TextEncoder().encode(salt+value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
  async function login(){
    if(unlocked)return open();
    let config;try{config=JSON.parse(localStorage.getItem(PIN)||'null')}catch{}
    const first=!config;
    api.showModal(first?'管理者暗証番号を設定':'管理者モード',`<p>この端末での基本セットの誤変更を防ぐための制限です。案件用の編集は通常どおり使えます。</p><label class="field">暗証番号（4文字以上）<input id="adminPin" type="password" autocomplete="off"></label>${first?'<label class="field">確認用<input id="adminPinAgain" type="password" autocomplete="off"></label>':''}<p id="adminPinError" role="status"></p>`,async()=>{
      const value=document.querySelector('#adminPin').value;
      const error=document.querySelector('#adminPinError');
      if(first){if(value.length<4||value!==document.querySelector('#adminPinAgain').value){error.textContent='4文字以上で、同じ暗証番号を2回入力してください';return}
        const salt=crypto.randomUUID();try{localStorage.setItem(PIN,JSON.stringify({salt,hash:await digest(value,salt)}))}catch{error.textContent='暗証番号を保存できません';return}
      }else if(await digest(value,config.salt)!==config.hash){error.textContent='暗証番号が違います';return}
      unlocked=true;api.closeModal();open();
    });
  }
  function open(){
    if(!unlocked)return login();
    try{draft=JSON.parse(localStorage.getItem(DRAFT)||'null')}catch{draft=null}
    if(!draft||draft.format!=='tenken-pwa-settings')draft=clone(api.read());
    root=el('div');root.className='basic-manager';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','基本セット管理');document.body.append(root);render();
  }
  function render(){
    root.classList.remove('editing');root.replaceChildren();const box=el('section');box.className='basic-manager-box';root.append(box);
    const header=el('header');header.append(el('h2','基本セット管理'),el('button','閉じる',()=>{if(root.classList.contains('editing')&&!confirm('未保存の項目編集を破棄して閉じますか？'))return;persist();root.remove()}),el('button','管理者モード終了',()=>{if(root.classList.contains('editing')&&!confirm('未保存の項目編集を破棄して終了しますか？'))return;persist();unlocked=false;root.remove()}));box.append(header);
    box.append(el('p','基本セット専用の下書きです。編集は現在の案件に反映されません。「一式更新」後、新規案件から適用します。'));
    const nav=el('nav');nav.setAttribute('aria-label','基本セットの設定');for(const [key,name]of Object.entries(labels)){const b=el('button',name,()=>{if(root.classList.contains('editing')&&!confirm('未保存の項目編集を破棄しますか？'))return;tab=key;render()});b.setAttribute('aria-pressed',String(tab===key));nav.append(b)}box.append(nav);
    const status=el('p','編集中の内容は下書きとして端末に保存します。');status.setAttribute('role','status');box.append(status);
    const body=el('div');body.className='basic-manager-content';box.append(body);
    if(tab==='types'||tab==='wordingSets')list(body,tab);
    if(tab==='paletteGroupMaster')for(const key of ['paletteGroupMaster','equipmentGroupMaster','workCategoryMaster']){body.append(el('h3',({paletteGroupMaster:'パレット分類',equipmentGroupMaster:'設備大分類',workCategoryMaster:'作業区分'})[key]));list(body,key)}
    if(tab==='rules'){
      body.append(el('p','共通の区分、選択ボタン、報告書の掲載初期値を設定します。'));
      stringList(body,'調査区分',draft.findingCategories,v=>{draft.findingCategories=v;persist()});
      const selection=draft.findingCategorySelection;
      const useAll=check(body,'選択ボタンに全区分を表示',!Array.isArray(selection),v=>{draft.findingCategorySelection=v?null:[...draft.findingCategories];persist();render()});
      for(const cat of draft.findingCategories){const row=el('div');row.className='basic-rule';row.append(el('strong',cat));body.append(row);
        if(!useAll.checked)check(row,'選択ボタンに表示',selection.includes(cat),v=>{const s=new Set(draft.findingCategorySelection);v?s.add(cat):s.delete(cat);draft.findingCategorySelection=[...s];persist()});
        const current={...api.reportDefaults(cat),...(draft.findingReportDefaults?.[cat]||{})};
        for(const [key,name] of [['summary','速報版'],['photo','写真報告書']])check(row,name,current[key]===true,v=>{draft.findingReportDefaults=Object.fromEntries(Object.entries(draft.findingReportDefaults||{}).filter(([k])=>k!==cat).concat([[cat,{...current,[key]:v}]]));current[key]=v;persist()});
      }
    }
    if(tab==='initial'){
      input(body,'基本セット名',draft.name,v=>{draft.name=v;persist()});
      input(body,'速報版の作業内容 初期値',draft.reportDefaults?.workContent||'',v=>{draft.reportDefaults={...draft.reportDefaults,workContent:v};persist()},'textarea');
      body.append(el('p','配置時のサイズ・整理記号・常用・入力画面は「アイコン」タブで設定します。図面や設備の配置座標は基本セットに含めません。'));
    }
    if(tab==='transfer')transfer(body);
    const footer=el('footer');footer.append(el('button','下書きを保存',persist),el('button','基本セットを一式更新',commit));box.append(footer);
  }
  function input(parent,label,value,change,type='text',options){const wrap=el('label');wrap.className='field';wrap.append(el('span',label));const e=el(type==='textarea'?'textarea':type==='select'?'select':'input');if(type!=='textarea'&&type!=='select')e.type=type;if(options)for(const [v,n]of options){const o=el('option',n);o.value=v;e.append(o)}e.value=value??'';e.oninput=()=>change(type==='number'?Number(e.value):e.value);wrap.append(e);parent.append(wrap);return e}
  function check(p,label,value,change){const w=el('label');w.className='basic-check';const e=el('input');e.type='checkbox';e.checked=value;e.onchange=()=>change(e.checked);w.append(e,document.createTextNode(label));p.append(w);return e}
  function stringList(p,label,values,change){input(p,label+'（1行に1項目）',(values||[]).join('\n'),v=>change([...new Set(v.split('\n').map(x=>x.trim()).filter(Boolean))]),'textarea')}
  const collectionNames={types:'アイコン',wordingSets:'文言',paletteGroupMaster:'分類',equipmentGroupMaster:'設備大分類',workCategoryMaster:'作業区分'};
  function list(p,key){const items=draft[key]||[];input(p,'検索','',v=>{for(const r of rows.children)r.hidden=!norm(r.textContent).includes(norm(v))});const rows=el('div');p.append(rows);
    items.forEach((item,i)=>{const row=el('div');row.className='basic-item';row.append(el('span',item.name||item.text||item.id),el('button','編集',()=>edit(key,i)));
      if(key==='types'){row.prepend(preview(item));for(const [d,n]of [[-1,'↑'],[1,'↓']])row.append(el('button',n,()=>{const j=i+d;if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];items.forEach((t,n)=>t.paletteOrder=n);persist();render()}))}
      row.append(el('button','削除',()=>{if(!confirm('基本セットの下書きから削除しますか？ 作成済み案件は変更されません。'))return;
        if(key==='types'&&api.defaultTypeIds.includes(item.id)){message('標準アイコンは「配置メニューに表示」をオフにしてください。');return}
        if(key!=='types'&&key!=='wordingSets'&&(items.length<=1||draft.types.some(t=>(key==='paletteGroupMaster'?(t.paletteGroupId||t.category):key==='equipmentGroupMaster'?t.majorGroupId:(t.workCategoryIds||[]).includes(item.id)?item.id:'')===item.id)||key==='equipmentGroupMaster'&&draft.wordingSets.some(w=>w.equipmentGroupId===item.id))){message('使用中、または最後の分類は削除できません。先に所属を変更してください。');return}
        items.splice(i,1);persist();render()}));rows.append(row)});
    p.append(el('button','＋ '+collectionNames[key]+'を追加',()=>edit(key,-1)));
  }
  function preview(t){const wrap=el('div');wrap.className='basic-preview';const art=el('span');art.className='palette-art';art.dataset.category=t.category||'other';art.style.setProperty('--type-color',t.color||'#1769aa');art.style.color=t.textColor||'#ffffff';art.style.width=art.style.height=(Math.max(12,Math.min(90,Number(t.defaultSize)||22)))+'px';
    if(/^data:image\/png;base64,/.test(t.iconData||'')){const img=el('img');img.src=t.iconData;img.className='custom-icon';img.alt='';art.append(img)}else art.textContent=t.glyph||'設';wrap.append(art,el('small',(t.mark||'')+'1'));wrap.dataset.labelPosition=t.labelPosition||'bottom';return wrap}
  function edit(key,index){
    root.classList.add('editing');const items=draft[key]||(draft[key]=[]),isType=key==='types';
    let item=index>=0?clone(items[index]):isType?{id:crypto.randomUUID(),name:'',glyph:'設',category:'other',paletteGroupId:draft.paletteGroupMaster[0].id,majorGroupId:draft.equipmentGroupMaster[0].id,form:'basic',color:'#1769aa',textColor:'#ffffff',defaultSize:22,mark:'',enabled:true,countByDefault:true,paletteFavorite:false,components:[],extraFields:[],quickFindings:[],workCategoryIds:[]}:{id:crypto.randomUUID(),...(key==='wordingSets'?{text:'',severity:'要是正',equipmentGroupId:''}:{name:'',...(key==='paletteGroupMaster'?{color:'#705ab0'}:{})})};
    const content=root.querySelector('.basic-manager-content');content.replaceChildren();const actions=el('div');content.append(el('h3',collectionNames[key]+'の編集'),actions);let previewHost;
    const update=(k,v)=>{item[k]=v;if(previewHost)previewHost.replaceChildren(preview(item))};
    if(isType){previewHost=el('div');previewHost.className='basic-preview-panel';previewHost.append(preview(item));content.append(previewHost)}
    input(content,key==='wordingSets'?'不良文言':'名前',item.text??item.name,v=>update(key==='wordingSets'?'text':'name',v),key==='wordingSets'?'textarea':'text');
    if(isType){
      for(const [k,n,type]of [['glyph','表示文字','text'],['mark','整理記号','text'],['color','背景色','color'],['textColor','文字色','color'],['defaultSize','標準サイズ（12～90）','number'],['countUnit','数量単位','text']])input(content,n,item[k],v=>update(k,v),type);
      for(const [k,n,options]of [['paletteGroupId','パレット分類',draft.paletteGroupMaster.map(g=>[g.id,g.name])],['majorGroupId','設備大分類',draft.equipmentGroupMaster.map(g=>[g.id,g.name])],['form','入力画面',[['door','扉測定'],['smokeOutlet','排煙口'],['smokeWindow','排煙窓'],['basic','一般記録']]],['labelPosition','整理番号の位置',[['bottom','下'],['top','上'],['left','左'],['right','右']]]])input(content,n,item[k]||options[0][0],v=>update(k,v),'select',options);
      for(const [k,n]of [['enabled','配置メニューに表示'],['paletteFavorite','常用に表示'],['countByDefault','数量集計に含める']])check(content,n,item[k]!==false&&(k!=='paletteFavorite'||!!item[k]),v=>update(k,v));
      stringList(content,'測定部位',item.components,v=>update('components',v));stringList(content,'追加記録項目',item.extraFields,v=>update('extraFields',v));
      const work=el('div');work.append(el('h4','常用文言の対象作業区分'));content.append(work);for(const g of draft.workCategoryMaster)check(work,g.name,(item.workCategoryIds||[]).includes(g.id),v=>{const ids=new Set(item.workCategoryIds||[]);v?ids.add(g.id):ids.delete(g.id);item.workCategoryIds=[...ids]});
      check(content,'調査区分は共通設定を使う',!Array.isArray(item.findingCategorySelection),v=>{item.findingCategorySelection=v?null:[...draft.findingCategories];categoryChoices()});
      const cats=el('div');content.append(cats);function categoryChoices(){cats.replaceChildren();if(Array.isArray(item.findingCategorySelection))for(const c of draft.findingCategories)check(cats,c,item.findingCategorySelection.includes(c),v=>{const ids=new Set(item.findingCategorySelection);v?ids.add(c):ids.delete(c);item.findingCategorySelection=[...ids]})}categoryChoices();
      const upload=input(content,'アイコン画像（PNG）','',async()=>{},'file');upload.accept='image/png';upload.onchange=async()=>{try{if(upload.files[0])update('iconData',await api.iconToDataUrl(upload.files[0]))}catch{message('画像を読み込めませんでした')}};
      content.append(el('button','標準画像に戻す',()=>update('iconData','')));
      const q=el('div');content.append(q);function quick(){q.replaceChildren();q.append(el('h4','常用ボタン'));(item.quickFindings||[]).forEach((x,i)=>{const row=el('fieldset');q.append(row);for(const [k,n]of [['label','ボタン名'],['title','内容・概要'],['detail','補足'],['proposal','改善提案']])input(row,n,x[k]||'',v=>x[k]=v);input(row,'区分',x.severity||'要是正',v=>x.severity=v,'select',draft.findingCategories.map(c=>[c,c]));row.append(el('button','削除',()=>{item.quickFindings.splice(i,1);quick()}))});q.append(el('button','＋ 常用ボタンを追加',()=>{(item.quickFindings||=[]).push({id:crypto.randomUUID(),label:'',title:'',detail:'',severity:'要是正'});quick()}))}quick();
    }else if(key==='wordingSets'){
      input(content,'設備大分類',item.equipmentGroupId,v=>item.equipmentGroupId=v,'select',[['','全設備共通'],...draft.equipmentGroupMaster.map(g=>[g.id,g.name])]);input(content,'区分',item.severity,v=>item.severity=v,'select',draft.findingCategories.map(c=>[c,c]));
    }else if(key==='paletteGroupMaster')input(content,'目印色',item.color,v=>item.color=v,'color');
    function save(next=false){
      if(!(item.name||item.text||'').trim()){message('名前・文言を入力してください');return false}
      if(items.some((x,i)=>i!==index&&norm(x.name||x.text)===norm(item.name||item.text))){message('同じ名前・文言が登録されています。既存項目を編集してください。');return false}
      if(isType&&(!Number.isFinite(item.defaultSize)||item.defaultSize<12||item.defaultSize>90)){message('サイズは12～90で入力してください');return false}
      if(isType&&Array.isArray(item.findingCategorySelection)&&!item.findingCategorySelection.length){message('調査区分を1つ以上選んでください');return false}
      if(index<0){items.push(clone(item));index=items.length-1}else items[index]=clone(item);persist();if(next)edit(key,-1);return true;
    }
    actions.append(el('button','保存',()=>save()),el('button','保存して次を追加',()=>save(true)),el('button','複製して作成',()=>{if(!save())return;const copy=clone(item);copy.id=crypto.randomUUID();if(key==='wordingSets')copy.text+='（複製）';else copy.name+='（複製）';items.push(copy);persist();edit(key,items.length-1)}),el('button','一覧へ戻る',()=>{if(confirm('未保存の編集を破棄して一覧に戻りますか？'))render()}));
  }
  function validate(pack){
    if(pack?.format!=='tenken-pwa-settings'||!Array.isArray(pack.types)||!pack.types.length)throw Error('基本セットの形式が違います');
    for(const key of ['types','paletteGroupMaster','equipmentGroupMaster','workCategoryMaster','wordingSets']){const a=pack[key];if(!Array.isArray(a)||key!=='wordingSets'&&!a.length)throw Error('必須の設定がありません：'+key);const ids=new Set(),names=new Set();for(const x of a){if(!x.id||ids.has(x.id))throw Error('IDが重複しています：'+key);ids.add(x.id);const n=norm(x.name||x.text);if(!n||names.has(n))throw Error('名前・文言が空欄、または重複しています：'+key);names.add(n)}}
    const has=(key,id)=>pack[key].some(x=>x.id===id);
    if(!Array.isArray(pack.findingCategories)||!pack.findingCategories.length)throw Error('調査区分を1つ以上設定してください');
    if(Array.isArray(pack.findingCategorySelection)&&!pack.findingCategorySelection.length)throw Error('選択ボタンを1つ以上設定してください');
    for(const t of pack.types){if(!has('paletteGroupMaster',t.paletteGroupId||t.category)||!has('equipmentGroupMaster',t.majorGroupId)||(t.workCategoryIds||[]).some(id=>!has('workCategoryMaster',id)))throw Error('アイコンの所属先を確認してください：'+t.name)}
    for(const w of pack.wordingSets)if(w.equipmentGroupId&&!has('equipmentGroupMaster',w.equipmentGroupId))throw Error('文言の設備大分類を確認してください');
    return pack;
  }
  function commit(){if(!unlocked||root.classList.contains('editing'))return;try{validate(draft);if(!confirm('基本セットを一式更新します。次の新規案件から適用します。現在の案件は変更しません。'))return;
      const before=api.read();const h=JSON.parse(localStorage.getItem(HISTORY)||'[]');h.unshift({date:new Date().toISOString(),pack:before});localStorage.setItem(HISTORY,JSON.stringify(h.slice(0,3)));
      const pack=clone(draft);pack.updatedAt=new Date().toISOString();if(!api.write(pack))return;draft=pack;persist();message('基本セットを一式更新しました。新規案件から適用されます。');
    }catch(e){message(e.message)}}
  function transfer(p){
    p.append(el('h3','現在の案件から取り込む'),el('p','分類 → アイコン → 文言の順に取り込めます。同じID・名前・文言の項目は、追加前に比較します。'));
    for(const key of ['paletteGroupMaster','equipmentGroupMaster','workCategoryMaster','types','wordingSets']){const group=el('details');group.append(el('summary',collectionNames[key]));p.append(group);for(const x of api.projectPack()[key]||[]){const row=el('div');row.className='basic-item';const match=draft[key].find(y=>y.id===x.id||norm(y.name||y.text)===norm(x.name||x.text));row.append(el('span',(x.name||x.text)+(match?'（登録済み候補あり）':'')),el('button','比較して取込',()=>compare(key,x,match)));group.append(row)}}
    p.append(el('h3','ファイルと履歴'));
    p.append(el('button','基本セットを書き出す',()=>{try{validate(draft);api.download(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),'基本セット.json')}catch(e){message(e.message)}}));
    const file=input(p,'基本セットJSONを下書きへ読み込む','',()=>{},'file');file.accept='.json';file.onchange=async()=>{try{const data=JSON.parse(await file.files[0].text());validate(data);if(confirm('現在の下書きを読み込んだ内容に置き換えますか？')){draft=data;persist();render()}}catch(e){message('読み込めません：'+e.message)}};
    p.append(el('p','他の利用者への配布は、書き出したJSONをGitHubへアップロードします。この画面での更新はこの端末に適用されます。'));
    let history=[];try{history=JSON.parse(localStorage.getItem(HISTORY)||'[]')}catch{}
    for(const entry of history)p.append(el('button',new Date(entry.date).toLocaleString('ja-JP')+' の更新前を下書きに復元',()=>{if(confirm('この履歴を下書きに戻しますか？ 一式更新するまでは初期設定は変わりません。')){draft=clone(entry.pack);persist();render()}}));
    p.append(el('button','確定済み基本セットから下書きを作り直す',()=>{if(confirm('編集途中の下書きを破棄しますか？')){draft=clone(api.read());persist();render()}}));
    p.append(el('button','管理者暗証番号を変更',()=>{unlocked=false;root.remove();const old=localStorage.getItem(PIN); // Verify old PIN before permitting replacement.
      api.showModal('暗証番号の変更','<label class="field">現在の暗証番号<input id="oldAdminPin" type="password"></label><label class="field">新しい暗証番号<input id="newAdminPin" type="password"></label><label class="field">確認用<input id="againAdminPin" type="password"></label><p id="pinChangeError"></p>',async()=>{const c=JSON.parse(old),value=document.querySelector('#newAdminPin').value;if(await digest(document.querySelector('#oldAdminPin').value,c.salt)!==c.hash||value.length<4||value!==document.querySelector('#againAdminPin').value){document.querySelector('#pinChangeError').textContent='現在の暗証番号と、新しい暗証番号の確認が必要です';return}try{const salt=crypto.randomUUID();localStorage.setItem(PIN,JSON.stringify({salt,hash:await digest(value,salt)}));unlocked=true;api.closeModal();open()}catch{document.querySelector('#pinChangeError').textContent='保存できませんでした'}})
    }));
  }
  function compare(key,source,match){source=clone(source);const sourcePack=api.projectPack();const mapId=(collection,id)=>{const src=(sourcePack[collection]||[]).find(g=>g.id===id);return draft[collection].find(g=>g.id===id)?.id||(src?draft[collection].find(g=>norm(g.name)===norm(src.name))?.id:null)||id};if(key==='types'){source.paletteGroupId=mapId('paletteGroupMaster',source.paletteGroupId||source.category);source.majorGroupId=mapId('equipmentGroupMaster',source.majorGroupId);source.workCategoryIds=(source.workCategoryIds||[]).map(id=>mapId('workCategoryMaster',id));for(const q of source.quickFindings||[])q.workCategoryIds=(q.workCategoryIds||[]).map(id=>mapId('workCategoryMaster',id))}if(key==='wordingSets'&&source.equipmentGroupId)source.equipmentGroupId=mapId('equipmentGroupMaster',source.equipmentGroupId);const p=root.querySelector('.basic-manager-content');p.replaceChildren();p.append(el('h3','取り込み内容の比較'));const grid=el('div');grid.className='basic-compare';for(const [name,value]of [['基本セットの既存項目',match],['案件の項目',source]]){const col=el('div');col.append(el('h4',name));const pre=el('pre',value?JSON.stringify(value,null,2):'該当なし');col.append(pre);grid.append(col)}p.append(grid);
    const accept=replace=>{if(replace&&match){const i=draft[key].indexOf(match);draft[key][i]={...clone(source),id:match.id}}else{const item=clone(source);if(draft[key].some(x=>x.id===item.id||norm(x.name||x.text)===norm(item.name||item.text))){const name=prompt('重複を避けるため、別の名前・文言を入力してください',item.name||item.text);if(!name?.trim())return;if(draft[key].some(x=>norm(x.name||x.text)===norm(name))){message('同じ名前・文言が存在します');return}item.id=crypto.randomUUID();if(key==='wordingSets')item.text=name.trim();else item.name=name.trim()}draft[key].push(item)}persist();render()};
    if(match)p.append(el('button','既存を更新',()=>accept(true)));p.append(el('button',match?'別として追加':'新規追加',()=>accept(false)),el('button','取り込まない',render));
  }
  return {open:login,isUnlocked:()=>unlocked};
}
