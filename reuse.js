// Reusable settings contain definitions only. Project records never enter a pack.
export const PERSONAL_SETTINGS_KEY='tenken-personal-settings-v1';
export const SETTING_COLLECTIONS=['paletteGroupMaster','equipmentGroupMaster','workCategoryMaster','wordingSets','types'];
const clone=value=>structuredClone(value);
const norm=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const strings=value=>Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.trim()))]:[];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,clone(value[k])]));
const TYPE_FIELDS=['id','name','category','paletteGroupId','majorGroupId','workCategoryIds','glyph','form','mark','color','colorMode','textColor','defaultSize','sizeVersion','components','extraFields','enabled','paletteFavorite','paletteOrder','countByDefault','countUnit','labelPosition','recordKind','iconData','findingCategorySelection'];
const QUICK_FIELDS=['id','label','severity','title','detail','proposal','phraseId','workCategoryIds'];
export function syncPaletteColors(pack){
  for(const t of pack.types||[]){
    const group=pack.paletteGroupMaster?.find(g=>g.id===(t.paletteGroupId||t.category));
    if(!group)continue;
    if(!['group','custom'].includes(t.colorMode))t.colorMode=!t.color||String(t.color).toLowerCase()===String(group.color).toLowerCase()?'group':'custom';
    if(t.colorMode==='group')t.color=group.color;
  }
  return pack;
}
export function cleanSettingsPack(value){
  if(value?.format!=='tenken-pwa-settings'||value.schemaVersion!==1)throw Error('対応する設定ファイルではありません。');
  const pack={format:'tenken-pwa-settings',schemaVersion:1,name:String(value.name||'自分用 初期設定'),updatedAt:String(value.updatedAt||'')};
  for(const key of SETTING_COLLECTIONS){
    if(!Array.isArray(value[key])||(key!=='wordingSets'&&!value[key].length))throw Error('設定項目が不足しています：'+key);
    pack[key]=value[key].map(item=>key==='types'?{...pick(item,TYPE_FIELDS),quickFindings:(Array.isArray(item?.quickFindings)?item.quickFindings:[]).map(q=>pick(q,QUICK_FIELDS))}:pick(item,key==='wordingSets'?['id','text','severity','equipmentGroupId']:key==='paletteGroupMaster'?['id','name','color']:['id','name']));
    const ids=new Set(),names=new Set();
    for(const item of pack[key]){
      const name=norm(item.name||item.text);
      if(typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)||!name)throw Error('名前・IDが空欄、またはIDが重複しています。');
      const identity=key==='wordingSets'?JSON.stringify([name,item.equipmentGroupId||'',item.severity||'要是正']):name;
      if(names.has(identity))throw Error('同じ名前・文言が重複しています。別名にしてください。');
      ids.add(item.id);names.add(identity);
      if(key==='types'&&item.iconData&&!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(item.iconData))throw Error('アイコン画像はPNGを使用してください。');
    }
  }
  pack.findingCategories=strings(value.findingCategories);
  if(!pack.findingCategories.length)throw Error('調査区分を1つ以上設定してください。');
  pack.findingCategorySelection=Array.isArray(value.findingCategorySelection)?strings(value.findingCategorySelection):null;
  pack.findingReportDefaults=Object.fromEntries(Object.entries(value.findingReportDefaults||{}).map(([key,v])=>[key,pick(v,['summary','photo'])]));
  pack.reportDefaults={workContent:String(value.reportDefaults?.workContent||'')};
  const has=(key,id)=>pack[key].some(x=>x.id===id);
  for(const t of pack.types){
    if(!has('paletteGroupMaster',t.paletteGroupId||t.category)||!has('equipmentGroupMaster',t.majorGroupId))throw Error('アイコンの分類を確認してください：'+t.name);
    if(!Number.isFinite(t.defaultSize)||t.defaultSize<12||t.defaultSize>90)throw Error('アイコンのサイズは12～90で設定してください。');
    if(!['door','smokeOutlet','smokeWindow','basic'].includes(t.form))throw Error('アイコンの入力画面を確認してください。');
    if((t.workCategoryIds||[]).some(id=>!has('workCategoryMaster',id))||(t.quickFindings||[]).some(q=>(q.workCategoryIds||[]).some(id=>!has('workCategoryMaster',id))))throw Error('常用ボタン・アイコンの作業区分を確認してください。');
  }
  for(const w of pack.wordingSets)if(w.equipmentGroupId&&!has('equipmentGroupMaster',w.equipmentGroupId))throw Error('文言の設備大分類を確認してください。');
  return syncPaletteColors(pack);
}
export function settingMatches(pack,key,item,source){
  const sameGroup=x=>{
    if((x.equipmentGroupId||'')===(item.equipmentGroupId||''))return true;
    const from=source?.equipmentGroupMaster.find(g=>g.id===item.equipmentGroupId),to=pack.equipmentGroupMaster.find(g=>g.id===x.equipmentGroupId);
    return !!from&&!!to&&norm(from.name)===norm(to.name);
  };
  return pack[key].filter(x=>x.id===item.id||norm(x.name||x.text)===norm(item.name||item.text)&&(key!=='wordingSets'||sameGroup(x)&&(x.severity||'要是正')===(item.severity||'要是正')));
}
export function mergeSettings(target,source,choices=[],includeGeneral=false,newId=()=>crypto.randomUUID()){
  const result=cleanSettingsPack(target),incoming=cleanSettingsPack(source),changes=[],done=new Map();
  const token=(key,id)=>JSON.stringify([key,id]);
  const selected=new Map(choices.map(c=>[token(c.key,c.id),c]));
  const category=value=>{if(value&&!result.findingCategories.includes(value))result.findingCategories.push(value)};
  function take(key,id,required=false){
    if(!id)return '';
    const ref=token(key,id);if(done.has(ref))return done.get(ref);
    const original=incoming[key].find(x=>x.id===id);
    if(!original)throw Error('取り込み元の参照先がありません。');
    const choice=selected.get(ref)||{action:'skip'},matches=settingMatches(result,key,original,incoming);
    if(choice.action==='skip'){
      if(!required)return '';
      if(matches.length>1)throw Error('参照する分類・文言の候補が複数あります。先に取り込み方法を選んでください。');
      if(matches.length===1){done.set(ref,matches[0].id);return matches[0].id}
    }
    if(!['skip','add','update','copy'].includes(choice.action))throw Error('取り込み方法を選んでください。');
    let item=clone(original),match;
    if(choice.action==='update'){
      match=matches.find(x=>x.id===choice.targetId)||(matches.length===1?matches[0]:null);
      if(!match)throw Error('更新する既存項目を選んでください。');
    }
    if(choice.action==='copy'){
      const name=String(choice.name||'').trim();if(!name)throw Error('別名で追加する名前・文言を入力してください。');
      item[key==='wordingSets'?'text':'name']=name;
    }else if(!match&&matches.length)throw Error('重複する項目は更新・別名追加、または取り込まないを選んでください。');
    item.id=match?match.id:result[key].some(x=>x.id===item.id)||choice.action==='copy'?newId():item.id;
    done.set(ref,item.id);
    if(key==='wordingSets'){item.equipmentGroupId=item.equipmentGroupId?take('equipmentGroupMaster',item.equipmentGroupId,true):'';category(item.severity)}
    if(key==='types'){
      item.paletteGroupId=take('paletteGroupMaster',item.paletteGroupId||item.category,true);
      item.majorGroupId=take('equipmentGroupMaster',item.majorGroupId,true);
      item.workCategoryIds=(item.workCategoryIds||[]).map(id=>take('workCategoryMaster',id,true));
      for(const q of item.quickFindings||[]){
        q.workCategoryIds=(q.workCategoryIds||[]).map(id=>take('workCategoryMaster',id,true));
        q.phraseId=q.phraseId&&incoming.wordingSets.some(w=>w.id===q.phraseId)?take('wordingSets',q.phraseId,true):'';
        category(q.severity);
      }
      for(const c of item.findingCategorySelection||[])category(c);
      item.paletteOrder=match?match.paletteOrder:Math.max(-1,...result.types.map((x,i)=>Number.isFinite(Number(x.paletteOrder))?Number(x.paletteOrder):i))+1;
    }
    const index=match?result[key].findIndex(x=>x.id===match.id):-1;
    if(index>=0)result[key][index]=item;else result[key].push(item);
    changes.push({key,id:item.id,name:item.name||item.text,action:match?'update':'add',automatic:choice.action==='skip'});
    return item.id;
  }
  for(const key of SETTING_COLLECTIONS)for(const item of incoming[key])if(selected.get(token(key,item.id))?.action!=='skip'&&selected.has(token(key,item.id)))take(key,item.id);
  if(includeGeneral){
    for(const c of incoming.findingCategories)category(c);
    result.findingCategorySelection=clone(incoming.findingCategorySelection);
    result.findingReportDefaults=clone(incoming.findingReportDefaults);
    result.reportDefaults=clone(incoming.reportDefaults);
    changes.push({key:'general',name:'入力・報告設定の初期値',action:'update'});
  }
  result.updatedAt=new Date().toISOString();
  return {pack:cleanSettingsPack(result),changes};
}

const LABELS={types:'アイコン',wordingSets:'文言セット',paletteGroupMaster:'パレット分類',equipmentGroupMaster:'設備大分類',workCategoryMaster:'作業区分',general:'入力・報告設定'};
export function installSettingsReuse(api){
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const button=(text,action)=>{const n=el('button',text);n.type='button';n.className='btn btn-light';n.onclick=action;return n};
  const option=(select,value,text)=>{const n=el('option',text);n.value=value;select.append(n)};
  function describe(key,x,pack){
    if(!x)return '該当なし';
    const group=(key,id)=>pack[key].find(g=>g.id===id)?.name||id||'共通';
    if(key==='types')return `${x.name}\n表示：${x.iconData?'登録画像（JSONに含む）':x.glyph||'画像'} ／ 記号：${x.mark||'なし'} ／ サイズ：${x.defaultSize}\n入力画面：${({door:'扉測定',smokeOutlet:'排煙口',smokeWindow:'排煙窓',basic:'一般記録'})[x.form]}\n分類：${group('paletteGroupMaster',x.paletteGroupId)}\n設備大分類：${group('equipmentGroupMaster',x.majorGroupId)}\n作業区分：${(x.workCategoryIds||[]).map(id=>group('workCategoryMaster',id)).join('、')||'共通'}\n背景色：${x.color||'標準'}（${x.colorMode==='group'?'分類に連動':'個別色'}） ／ 文字色：${x.textColor||'標準'}\n測定部位：${(x.components||[]).join('、')||'なし'}\n追加項目：${(x.extraFields||[]).join('、')||'なし'}\n配置メニュー：${x.enabled!==false?'表示':'非表示'} ／ 常用：${x.paletteFavorite?'表示':'非表示'}\n集計：${x.countByDefault!==false?'含める':'除外'} ／ 単位：${x.countUnit||'台'}\n番号位置：${({top:'上',bottom:'下',left:'左',right:'右'})[x.labelPosition||'bottom']}\n調査区分：${x.findingCategorySelection?.join('、')||'共通設定'}\n常用ボタン：\n${(x.quickFindings||[]).map(q=>`${q.label||q.title}［${q.severity}］\n${q.title||''}\n${q.detail||''}\n改善提案：${q.proposal||'なし'}\n対象作業：${(q.workCategoryIds||[]).map(id=>group('workCategoryMaster',id)).join('、')||'共通'}`).join('\n\n')||'なし'}`;
    if(key==='wordingSets')return `${x.severity||'要是正'} ／ ${group('equipmentGroupMaster',x.equipmentGroupId)}\n${x.text}`;
    return x.name+(x.color?' ／ '+x.color:'');
  }
  function open(){
    let source=null,sourceName='',targetKind='project',target,choices=[],includeGeneral=false,review,replaceWhole=false;
    api.showModal('設定を取り込む','<p class="settings-import-flow">取り込み元を選ぶ → 取り込み先を選ぶ → 必要な項目を選ぶ → 内容を確認 → 確定</p><div id="settingsReuseBody"></div><p id="settingsReuseStatus" role="status"></p>',()=>{});
    const body=document.querySelector('#settingsReuseBody'),status=document.querySelector('#settingsReuseStatus'),save=document.querySelector('#modalSave');
    const back=()=>api.back();document.querySelector('#modalCancel').onclick=back;document.querySelector('#modalClose').onclick=back;
    const error=e=>{status.textContent=e.message||String(e)};
    function sourcePicker(){
      source=null;body.replaceChildren();save.hidden=true;
      body.append(el('p','設定だけを選んで取り込みます。図面・配置・点検記録・写真は取り込みません。'));
      const load=async(value,name)=>{try{source=api.prepare(value);sourceName=name;target=api.readTarget(targetKind);choices=SETTING_COLLECTIONS.flatMap(key=>source[key].map(item=>({key,id:item.id,action:'skip',targetId:'',name:''})));selection()}catch(e){error(e)}};
      const file=el('input');file.type='file';file.accept='.json,.zip,application/json,application/zip';file.onchange=async()=>{if(!file.files?.[0])return;try{const f=file.files[0];await load(await api.readFile(f),f.name)}catch(e){error(e)}finally{file.value=''}};
      const field=el('label');field.className='field';field.append(el('span','設定JSON・案件ZIPから選ぶ'),file);body.append(field);
      body.append(button('管理者の基本セットから選ぶ',()=>load(api.basic(),'管理者の基本セット')));
      const personal=api.personal();if(personal)body.append(button('自分用初期設定から選ぶ',()=>load(personal,'自分用初期設定')));
      const list=el('div');list.className='reuse-project-list';body.append(el('h3','この端末の別の案件から選ぶ'),list);
      api.projects().then(projects=>{
        if(source||!body.isConnected)return;
        if(!projects.length)list.append(el('p','別の保存案件はありません。設定JSONまたは案件ZIPから取り込めます。'));
        for(const p of projects)list.append(button(p.name||'名称未設定',()=>load(p,p.name||'保存案件')));
      }).catch(error);
    }
    function selection(){
      status.textContent='';body.replaceChildren();save.hidden=false;save.disabled=false;save.textContent='取り込み内容を確認';save.onclick=()=>{replaceWhole=false;preview()};
      body.append(el('p','取り込み元：'+sourceName),el('p',`画像付きアイコン：取り込み元 ${source.types.filter(t=>t.iconData).length} 種 ／ 取り込み先 ${target.types.filter(t=>t.iconData).length} 種。画像は設定JSONに含まれます。`));
      const select=el('select');option(select,'project','この案件へ取り込む');option(select,'personal','自分用初期設定へ取り込む（次の新規案件から）');select.value=targetKind;
      select.onchange=()=>{targetKind=select.value;target=api.readTarget(targetKind);choices.forEach(c=>{c.action='skip';c.targetId='';c.name=''});selection()};
      const field=el('label');field.className='field';field.append(el('span','取り込み先'),select);body.append(field);
      body.append(el('p','必要な項目を選んでください。必要な分類・参照文言は未登録なら一緒に追加します。登録済みの分類は選択しない限り変更しません。同じアイコンに画像を反映する場合は「既存の項目を更新する」を選びます。'));
      body.append(button('未登録の項目だけ選ぶ',()=>{for(const c of choices)c.action=settingMatches(target,c.key,source[c.key].find(x=>x.id===c.id),source).length?'skip':'add';selection()}),button('すべての選択を解除',()=>{choices.forEach(c=>c.action='skip');includeGeneral=false;selection()}),button('取り込み元を選び直す',sourcePicker));
      if(targetKind==='personal')body.append(button('この一式を自分用初期設定にする',()=>{replaceWhole=true;preview()}),el('p','一式保存は自分用初期設定を置き換えます。非表示・削除したアイコンや並び順も、取り込み元と揃えます。現在の案件は変わりません。'));
      for(const key of ['types','wordingSets','paletteGroupMaster','equipmentGroupMaster','workCategoryMaster']){
        const section=el('details');section.open=key==='types';section.append(el('summary',`${LABELS[key]}（${source[key].length}件）`));body.append(section);
        for(const item of source[key]){
          const c=choices.find(c=>c.key===key&&c.id===item.id),matches=settingMatches(target,key,item,source),row=el('div');row.className='reuse-item';section.append(row);
          row.append(el('strong',item.name||item.text));
          const action=el('select');action.setAttribute('aria-label',(item.name||item.text)+'の取り込み方法');
          option(action,'skip','取り込まない（今の設定を残す）');if(!matches.length)option(action,'add','追加する');if(matches.length)option(action,'update','既存の項目を更新する');option(action,'copy','別名で追加する');action.value=c.action;
          const matchSelect=el('select');matchSelect.setAttribute('aria-label','更新する既存項目');option(matchSelect,'','更新する項目を選択');for(const m of matches)option(matchSelect,m.id,m.name||m.text);matchSelect.value=c.targetId||(matches.length===1?matches[0].id:'');
          const name=el('input');name.type='text';name.placeholder=key==='wordingSets'?'追加する別の文言':'追加する別の名前';name.value=c.name;name.setAttribute('aria-label','別名で追加する名前・文言');
          const update=()=>{c.action=action.value;c.targetId=matchSelect.value;c.name=name.value;name.hidden=c.action!=='copy';matchSelect.hidden=c.action!=='update'||matches.length<2};action.onchange=update;name.oninput=update;matchSelect.onchange=update;update();
          row.append(action,matchSelect,name);
          const details=el('details');details.append(el('summary','今の設定と取り込み元を比較'));const grid=el('div');grid.className='reuse-comparison';
          for(const [label,values,pack]of [['今の設定',matches,target],['取り込み元',[item],source]]){const column=el('div');column.append(el('strong',label));if(!values.length)column.append(el('p','該当なし'));for(const x of values){column.append(el('p',describe(key,x,pack)));if(key==='types')column.append(api.iconPreview(x))}grid.append(column)}details.append(grid);row.append(details);
        }
      }
      const label=el('label');label.className='basic-check';const general=el('input');general.type='checkbox';general.checked=includeGeneral;general.onchange=()=>includeGeneral=general.checked;label.append(general,document.createTextNode('入力・報告設定の初期値も更新する'));body.append(label,el('p','このチェックは区分の選択ボタン・区分別の掲載初期値・速報版の作業内容を更新します。既存の記録は書き換えません。'));
      const generalDetail=el('details');generalDetail.append(el('summary','入力・報告設定の初期値を比較'));for(const [label,p]of [['今の設定',target],['取り込み元',source]])generalDetail.append(el('strong',label),el('p',`選択ボタン：${p.findingCategorySelection?.join('、')||'全区分'}\n作業内容：${p.reportDefaults.workContent||'未設定'}\n掲載初期値：${Object.entries(p.findingReportDefaults).map(([k,v])=>`${k}（速報${v.summary?'○':'×'}・写真${v.photo?'○':'×'}）`).join('、')||'標準'}`));body.append(generalDetail);
    }
    function preview(){try{
      if(JSON.stringify(api.readTarget(targetKind))!==JSON.stringify(target))throw Error('取り込み先の設定が変わりました。取り込み先を選び直してください。');
      review=replaceWhole&&targetKind==='personal'?{pack:cleanSettingsPack(source),changes:[{key:'general',name:'取り込み元の設定一式で自分用初期設定を置き換える',action:'update'}]}:mergeSettings(target,source,choices,includeGeneral);
      if(!review.changes.length)throw Error('取り込む項目を選んでください。');
      body.replaceChildren();status.textContent='';body.append(el('h3','取り込み内容の確認'),el('p','取り込み先：'+(targetKind==='project'?'現在の案件':'自分用初期設定（次の新規案件から）')));
      body.append(el('p',`取り込み後の画像付きアイコン：${review.pack.types.filter(t=>t.iconData).length} 種`));const list=el('ul');for(const c of review.changes)list.append(el('li',`${LABELS[c.key]}：${c.name} ／ ${c.action==='update'?'更新':'追加'}${c.automatic?'（必要な参照先を追加）':''}`));body.append(list);
      if(replaceWhole){for(const key of SETTING_COLLECTIONS)body.append(el('p',`${LABELS[key]}：${target[key].length}件 → ${source[key].length}件`));const omitted=target.types.filter(x=>!source.types.some(y=>y.id===x.id));if(omitted.length)body.append(el('p','新しい自分用初期設定には含まれないアイコン：'+omitted.map(x=>x.name).join('、')))}
      if(targetKind==='project')body.append(el('p','配置済みで使用しているアイコンを更新すると、この案件の見た目・以後の入力設定にも反映します。図面・配置座標・入力済み測定値・指摘本文・写真は保持します。'));
      body.append(button('選択画面へ戻る',selection));save.textContent='この内容で取り込む';save.onclick=apply;
    }catch(e){error(e)}}
    async function apply(){save.disabled=true;try{
      if(JSON.stringify(api.readTarget(targetKind))!==JSON.stringify(target))throw Error('取り込み先の設定が変わりました。選択画面へ戻り、取り込み先を選び直してください。');
      await api.applyTarget(targetKind,review.pack);api.back();api.toast('選択した設定を取り込みました');
    }catch(e){error(e)}finally{save.disabled=false}}
    sourcePicker();
  }
  return {open};
}
