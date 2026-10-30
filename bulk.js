// CSV editing and measurement comparisons. Import plans are pure: no original
// object is changed until the caller has previewed and persisted the plan.
const clone=value=>structuredClone(value);
const norm=value=>String(value??'').normalize('NFKC').trim();
export const FORM_NAMES={door:'危害防止測定',smokeOutlet:'排煙口',smokeWindow:'排煙窓',basic:'一般記録'};
export const HAZARD_SCOPE={unknown:'未確認',current:'現行基準適用',existing:'既存不適格確認済み',exempt:'対象外'};
const id=prefix=>prefix+'_'+crypto.randomUUID();
const cellText=value=>{const s=String(value??'');return /^[=+\-@\t\r]/.test(s)?"'"+s:s};
export function writeCsv(headers,rows){return '\ufeff'+[headers,...rows].map(row=>row.map(v=>'"'+cellText(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')}
export function parseCsv(text){
  text=String(text).replace(/^\ufeff/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
    if(c==='"'){if(value||closed)throw Error('CSVの引用符が不正です');quoted=true;continue}
    if(c===','||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[]}continue}
    if(closed)throw Error('引用符の後に区切り以外の文字があります');value+=c;
  }
  if(quoted)throw Error('CSVの引用符が閉じていません');if(value||row.length||closed){row.push(value);if(row.some(v=>v!==''))rows.push(row)}
  if(rows.length<2)throw Error('見出しとデータを1行以上用意してください');if(rows.length>10001)throw Error('一度に取り込めるのは10000行までです');
  const headers=rows.shift().map(norm);if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('見出しが空欄、または重複しています');
  return rows.map((cells,i)=>{if(cells.length!==headers.length)throw Error(`${i+2}行目：列数が見出しと一致しません`);return {line:i+2,values:Object.fromEntries(headers.map((h,j)=>[h,cells[j].replace(/^'(?=[=+\-@\t\r])/,'')]))}});
}
function present(row,key,clear){return Object.hasOwn(row,key)&&(clear||String(row[key]).trim()!=='')}
function number(value,label,{positive=false,min=0,max=Infinity,integer=false}={}){const s=norm(value);if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))throw Error(label+'は数値で入力してください');const n=Number(s);if(!Number.isFinite(n)||n<min||n>max||positive&&n<=0||integer&&!Number.isInteger(n))throw Error(label+'の範囲を確認してください');return n}
function bool(value,label){const s=norm(value).toLowerCase();if(['1','true','はい','有効','済'].includes(s))return true;if(['0','false','いいえ','無効','未'].includes(s))return false;throw Error(label+'は1か0で入力してください')}
function diff(old,next,label,changes){if(JSON.stringify(old)!==JSON.stringify(next))changes.push({label,before:String(old??''),after:String(next??'')})}
function knownHeaders(rows,allowed){for(const h of Object.keys(rows[0].values))if(!allowed.includes(h))throw Error('未対応の列名です：'+h)}
const ICON_COLUMNS={id:'アイコンID',name:'アイコン名',mark:'整理記号',glyph:'表示文字',paletteGroupId:'パレット分類ID',majorGroupId:'設備大分類ID',form:'入力画面',defaultSize:'標準サイズ',colorMode:'色の指定',color:'背景色',textColor:'文字色',components:'初期測定部位',extraFields:'追加記録項目',enabled:'配置メニューに表示',paletteFavorite:'常用に表示',countByDefault:'台数集計',countUnit:'数量単位',labelPosition:'番号位置',paletteOrder:'表示順',workCategoryIds:'作業区分ID',findingCategorySelection:'使用する区分',quickFindings:'常用ボタンJSON'};
export const ICON_HEADERS=[...Object.values(ICON_COLUMNS),'画像登録'];
export function iconCsv(pack,template=false){
  const types=template?[{id:'',name:'追加する防火扉',mark:'FD',glyph:'扉',paletteGroupId:pack.paletteGroupMaster[0]?.id,majorGroupId:pack.equipmentGroupMaster[0]?.id,form:'door',defaultSize:22,colorMode:'group',color:pack.paletteGroupMaster[0]?.color||'#1769aa',textColor:'#ffffff',components:['本扉','くぐり戸'],enabled:true,paletteFavorite:false,countByDefault:true,labelPosition:'bottom',paletteOrder:pack.types.length,workCategoryIds:[],extraFields:[],quickFindings:[]}]:pack.types;
  return writeCsv(ICON_HEADERS,types.map(t=>[...Object.keys(ICON_COLUMNS).map(k=>k==='form'?FORM_NAMES[t[k]]||t[k]:k==='quickFindings'?JSON.stringify(t[k]||[]):k==='findingCategorySelection'?(Array.isArray(t[k])?t[k].join('|'):'共通'):Array.isArray(t[k])?t[k].join('|'):typeof t[k]==='boolean'?Number(t[k]):t[k]),t.iconData?'あり（CSVでは画像を変更しません）':'なし']));
}
export function planIconCsv(pack,text,{clearBlanks=false,protectedIds=[]}={}){
  const rows=parseCsv(text);knownHeaders(rows,ICON_HEADERS);if(!Object.hasOwn(rows[0].values,'アイコン名'))throw Error('アイコン名の列が必要です');
  const next=clone(pack),changes=[],seen=new Set();let added=0,updated=0;
  for(const {line,values:r} of rows)try{
    const requested=norm(r['アイコンID']),old=requested?next.types.find(t=>t.id===requested):null;
    if(requested&&seen.has(requested))throw Error('同じアイコンIDが複数行あります');if(requested)seen.add(requested);
    const t=old?clone(old):{id:requested||id('type'),name:'',glyph:'設',mark:'',category:'other',paletteGroupId:next.paletteGroupMaster[0]?.id,majorGroupId:next.equipmentGroupMaster[0]?.id,form:'basic',defaultSize:22,sizeVersion:1,colorMode:'group',color:next.paletteGroupMaster[0]?.color||'#1769aa',textColor:'#ffffff',components:[],extraFields:[],workCategoryIds:[],quickFindings:[],enabled:true,countByDefault:true,paletteFavorite:false,labelPosition:'bottom',paletteOrder:next.types.length};
    for(const [key,column] of Object.entries(ICON_COLUMNS)){if(key==='id'||!present(r,column,clearBlanks))continue;let v=r[column];
      if(['components','extraFields','workCategoryIds'].includes(key))v=String(v).split(/[|\n]/).map(norm).filter(Boolean);
      else if(key==='findingCategorySelection')v=!v||norm(v)==='共通'?null:String(v).split(/[|\n]/).map(norm).filter(Boolean);
      else if(['enabled','paletteFavorite','countByDefault'].includes(key))v=bool(v,column);
      else if(key==='defaultSize')v=number(v,column,{min:12,max:90});
      else if(key==='paletteOrder')v=number(v,column,{integer:true});
      else if(key==='form'){v=norm(v);v=Object.entries(FORM_NAMES).find(([,name])=>name===v)?.[0]||(v==='扉測定'?'door':v);if(!Object.hasOwn(FORM_NAMES,v))throw Error('入力画面を確認してください')}
      else if(key==='quickFindings'){v=v?JSON.parse(v):[];if(!Array.isArray(v))throw Error('常用ボタンJSONは配列にしてください')}
      else v=String(v).trim();
      t[key]=v;
    }
    if(!t.name)throw Error('アイコン名が空欄です');
    if(!next.paletteGroupMaster.some(g=>g.id===t.paletteGroupId)||!next.equipmentGroupMaster.some(g=>g.id===t.majorGroupId))throw Error('分類IDがありません。先に分類を登録してください');
    if(!['group','custom'].includes(t.colorMode))throw Error('色の指定はgroupかcustomです');if(t.labelPosition&&!['top','bottom','left','right'].includes(t.labelPosition))throw Error('番号位置を確認してください');
    if(t.color&&!/^#[0-9a-f]{6}$/i.test(t.color)||t.textColor&&!/^#[0-9a-f]{6}$/i.test(t.textColor))throw Error('色は#と6桁の16進数で入力してください');
    if(!old&&t.form==='door'&&!t.components.length)t.components=['扉'];
    const partChanges=[];for(const key of Object.keys(ICON_COLUMNS).filter(k=>k!=='id'))diff(['components','extraFields','workCategoryIds','quickFindings'].includes(key)?old?.[key]||[]:key==='findingCategorySelection'?old?.[key]??null:old?.[key],['components','extraFields','workCategoryIds','quickFindings'].includes(key)?t[key]||[]:key==='findingCategorySelection'?t[key]??null:t[key],`${t.name}：${ICON_COLUMNS[key]}`,partChanges);
    if(old&&partChanges.length&&protectedIds.includes(old.id))throw Error('基本セットの項目です。管理者の基本セットCSVから変更してください：'+t.name);
    if(old){if(partChanges.length){next.types[next.types.findIndex(x=>x.id===old.id)]=t;updated++}}else{next.types.push(t);added++}
    changes.push(...partChanges);
  }catch(error){throw Error(`${line}行目：${error.message}`)}
  const names=new Set();for(const t of next.types){const name=norm(t.name).toLowerCase();if(names.has(name))throw Error('アイコン名が重複しています：'+t.name);names.add(name)}
  return {next,changes,added,updated};
}
export function adoptIcons(target,source,choices){
  const next=clone(target),changes=[],used=new Set();let added=0,updated=0;
  const mapGroup=(key,sourceId)=>{const incoming=source[key]?.find(g=>g.id===sourceId);if(!incoming)throw Error('取込元の分類がありません：'+sourceId);let match=next[key].find(g=>g.id===sourceId)||next[key].find(g=>norm(g.name)===norm(incoming.name));if(!match){match=clone(incoming);next[key].push(match)}return match.id};
  for(const choice of choices){const src=source.types.find(t=>t.id===choice.sourceId);if(!src)throw Error('取込元のアイコンがありません');const existing=choice.targetId?next.types.find(t=>t.id===choice.targetId):null;if(choice.targetId&&!existing)throw Error('差替先がありません');if(existing&&used.has(existing.id))throw Error('同じ差替先を複数回選択しています');if(existing)used.add(existing.id);
    const t=clone(src);t.id=existing?.id||(next.types.some(x=>x.id===src.id)?id('type'):src.id);t.paletteGroupId=mapGroup('paletteGroupMaster',src.paletteGroupId||src.category);t.majorGroupId=mapGroup('equipmentGroupMaster',src.majorGroupId);t.workCategoryIds=(src.workCategoryIds||[]).map(v=>mapGroup('workCategoryMaster',v));for(const q of t.quickFindings||[])q.workCategoryIds=(q.workCategoryIds||[]).map(v=>mapGroup('workCategoryMaster',v));
    for(const category of t.findingCategorySelection||[])if(!next.findingCategories.includes(category))next.findingCategories.push(category);
    if(existing){t.paletteOrder=existing.paletteOrder;next.types[next.types.findIndex(x=>x.id===existing.id)]=t;updated++}else{t.paletteOrder=next.types.length;next.types.push(t);added++}
    changes.push({label:src.name,before:existing?.name||'未登録',after:existing?'このアイコンで差し替え（IDを保持）':'新規追加'});
  }
  return {next,changes,added,updated};
}
export const EQUIPMENT_HEADERS=['設備ID','取込キー','アイコンID','設備種別','整理記号','整理番号','PDFページ','ページ名','設置位置メモ','測定部位ID','測定部位','高さ(m)','幅(m)','10J基準秒数','基準の条件・根拠','閉鎖時間(秒)','閉鎖力(N)','危害防止装置','基準の取扱い','取扱いの根拠メモ','点検済み','図面X','図面Y','未配置'];
export function equipmentCsv(project,types,template=false){
  const first=types.find(t=>t.form==='door')||types[0],markers=template?[{id:'',importKey:'NEW001',typeId:first.id,mark:first.mark,serial:'',page:1,memo:'1階 廊下',components:[{id:'',label:'本扉',height:'2.0',width:'0.9',tenJSeconds:'',tenJBasis:'Excelの計算条件を記載'}],unplaced:true}]:project.markers||[];
  const rows=[];for(const m of markers){const t=types.find(t=>t.id===m.typeId)||{name:m.typeId};for(const c of m.components?.length?m.components:[{}])rows.push([m.id,m.importKey||'',m.typeId,t.name,m.mark??t.mark,m.serial,m.floorNoteId?'':m.page,m.floorNoteId?'':project.pageLabels?.[m.page]||'',m.memo,c.id,c.label,c.height,c.width,c.tenJSeconds,c.tenJBasis,c.time,c.force,c.hazard,m.hazardScope?HAZARD_SCOPE[m.hazardScope]:'案件に従う',m.hazardScopeNote||'',m.checked?1:0,m.unplaced||m.floorNoteId?'':m.x,m.unplaced||m.floorNoteId?'':m.y,m.unplaced?1:0])}
  return writeCsv(EQUIPMENT_HEADERS,rows);
}
export function measurementSignature(c){return JSON.stringify([String(c.height??''),String(c.width??''),String(c.tenJBasis??'')])}
export function evaluateHazard(c){
  const valid=(v,positive=false)=>v!==''&&v!=null&&Number.isFinite(Number(v))&&(positive?Number(v)>0:Number(v)>=0);
  let energy='unmeasured',force='unmeasured';
  if(!valid(c.tenJSeconds,true))energy='no-reference';
  else if(c.tenJReference&&c.tenJReference!==measurementSignature(c))energy='stale-reference';
  else if(valid(c.time,true))energy=Number(c.time)<Number(c.tenJSeconds)?'exceeded':'within';
  if(valid(c.force))force=Number(c.force)>150?'exceeded':'within';
  return {energy,force};
}
export function scopeLabel(marker,project){return HAZARD_SCOPE[marker.hazardScope||project.hazardScope||'unknown']||HAZARD_SCOPE.unknown}
export function hazardText(marker,project){
  const alerts=[];for(const c of marker.components||[]){const result=evaluateHazard(c);if(result.energy==='exceeded')alerts.push(`${c.label||'部位'}：★10J超過`);if(result.force==='exceeded')alerts.push(`${c.label||'部位'}：★150N超過`);if(result.energy==='stale-reference')alerts.push(`${c.label||'部位'}：基準秒数を再確認`)}
  const scope=marker.hazardScope||project.hazardScope||'unknown',label=scope==='current'?'要是正／現行基準適用':scopeLabel(marker,project);return alerts.length?alerts.join(' ／ ')+`（${label}）`:'';
}
export function planEquipmentCsv(project,types,text,{clearBlanks=false,maxPage=0,createMarker}={}){
  const rows=parseCsv(text);knownHeaders(rows,EQUIPMENT_HEADERS);if(!['設備ID','取込キー'].some(k=>Object.hasOwn(rows[0].values,k)))throw Error('設備IDまたは取込キーの列が必要です');
  const next=clone(project),changes=[],seenParts=new Set(),newKeys=new Map(),metaByMarker=new Map(),updatedIds=new Set();let added=0;
  for(const {line,values:r} of rows)try{
    const markerId=norm(r['設備ID']),key=norm(r['取込キー']);let m=markerId?next.markers.find(m=>m.id===markerId):newKeys.get(key);
    if(markerId&&!m)throw Error('設備IDが見つかりません。新規追加は設備IDを空欄にし、取込キーを指定してください');
    const isNew=!m;const requestedType=norm(r['アイコンID']);let t=types.find(t=>t.id===(requestedType||m?.typeId));if(!t&&!requestedType&&r['設備種別']){const matches=types.filter(t=>t.name===r['設備種別']);if(matches.length===1)t=matches[0]}
    if(!t)throw Error('アイコンIDを確認してください');
    if(isNew){if(!key)throw Error('新規設備には取込キー（例：NEW001）が必要です');m=createMarker(t);m.serial=String(Math.max(0,...next.markers.filter(x=>(x.mark||'')===(m.mark||'')).map(x=>/^\d+$/.test(String(x.serial||''))?Number(x.serial):0))+1);m.unplaced=true;m.components=[];m.importKey=key;next.markers.push(m);newKeys.set(key,m);added++;changes.push({label:key,before:'未登録',after:'設備を新規追加'})}
    const original=project.markers.find(x=>x.id===m.id),before=JSON.stringify(m),meta=metaByMarker.get(m.id)||new Map();metaByMarker.set(m.id,meta);
    const setMeta=(name,value)=>{if(meta.has(name)&&JSON.stringify(meta.get(name))!==JSON.stringify(value))throw Error('同じ設備の'+name+'が行ごとに異なります');meta.set(name,value);diff(m[name],value,`${m.serial||key||m.id}：${name}`,changes);m[name]=value};
    if(requestedType&&requestedType!==m.typeId)setMeta('typeId',t.id);
    for(const [column,prop] of [['整理記号','mark'],['整理番号','serial'],['設置位置メモ','memo'],['取扱いの根拠メモ','hazardScopeNote']])if(present(r,column,clearBlanks))setMeta(prop,r[column]);
    if(present(r,'PDFページ',false)){if(m.floorNoteId){if(Number(r['PDFページ'])!==m.page)throw Error('フロアノートのページはCSVで変更できません')}else setMeta('page',number(r['PDFページ'],'PDFページ',{integer:true,min:1,max:maxPage||Infinity}))}
    if(present(r,'点検済み',clearBlanks))setMeta('checked',bool(r['点検済み'],'点検済み'));
    if(present(r,'基準の取扱い',clearBlanks)){const value=norm(r['基準の取扱い']),scope=value==='案件に従う'||value===''?'':Object.entries(HAZARD_SCOPE).find(([k,v])=>k===value||v===value)?.[0];if(scope===undefined)throw Error('基準の取扱いを確認してください');setMeta('hazardScope',scope)}
    const hasX=present(r,'図面X',false),hasY=present(r,'図面Y',false);if(hasX!==hasY)throw Error('図面X・Yは両方指定してください');
    if(hasX){if(m.floorNoteId)throw Error('フロアノートの枠は図面座標で変更できません');setMeta('x',number(r['図面X'],'図面X',{max:1}));setMeta('y',number(r['図面Y'],'図面Y',{max:1}));setMeta('unplaced',false)}
    if(present(r,'未配置',false)&&bool(r['未配置'],'未配置'))setMeta('unplaced',true);
    if(present(r,'ページ名',false)){const name=r['ページ名'];next.pageLabels=next.pageLabels||{};const token='page:'+m.page;if(metaByMarker.has(token)&&metaByMarker.get(token)!==name)throw Error('同じページのページ名が行ごとに異なります');metaByMarker.set(token,name);diff(next.pageLabels[m.page],name,`ページ ${m.page}：ページ名`,changes);next.pageLabels[m.page]=name}
    const componentData=['測定部位ID','測定部位','高さ(m)','幅(m)','10J基準秒数','基準の条件・根拠','閉鎖時間(秒)','閉鎖力(N)','危害防止装置'].some(k=>present(r,k,false));
    if(componentData){if(t.form!=='door')throw Error('危害防止測定以外のアイコンに扉測定値は取り込めません');m.components=m.components||[];const compId=norm(r['測定部位ID']),label=r['測定部位']||'',matches=m.components.filter(c=>c.label===label);let c=compId?m.components.find(c=>c.id===compId):matches.length===1?matches[0]:null;
      if(compId&&!c)throw Error('測定部位IDが見つかりません。新しい部位はIDを空欄にしてください');
      if(!c){c={id:id('leaf'),label:label||'扉',height:'',width:'',time:'',force:'',hazard:''};m.components.push(c)}
      const token=m.id+':'+c.id;if(seenParts.has(token))throw Error('同じ測定部位が複数行あります');seenParts.add(token);
      if(present(r,'測定部位',clearBlanks)){diff(c.label,r['測定部位'],`${m.serial||key}：測定部位`,changes);c.label=r['測定部位']||'扉'}
      for(const [column,prop,positive] of [['高さ(m)','height',true],['幅(m)','width',true],['10J基準秒数','tenJSeconds',true],['閉鎖時間(秒)','time',true],['閉鎖力(N)','force',false]])if(present(r,column,clearBlanks)){const value=r[column]===''?'':String(number(r[column],column,{positive}));diff(c[prop],value,`${m.serial||key}／${c.label}：${column}`,changes);c[prop]=value}
      for(const [column,prop] of [['基準の条件・根拠','tenJBasis'],['危害防止装置','hazard']])if(present(r,column,clearBlanks)){if(prop==='hazard'&&!['','良','否','未設置','対象外'].includes(r[column]))throw Error('危害防止装置の値を確認してください');diff(c[prop],r[column],`${m.serial||key}／${c.label}：${column}`,changes);c[prop]=r[column]}
      // A reference is approved for the dimensions supplied together with it.
      // Editing dimensions alone keeps the older signature and requests review.
      if(present(r,'10J基準秒数',clearBlanks))c.tenJReference=c.tenJSeconds?measurementSignature(c):'';
      if(!c.tenJReference&&c.tenJSeconds&&original?.components?.some(x=>x.id===c.id&&x.tenJSeconds))c.tenJReference=measurementSignature(original.components.find(x=>x.id===c.id));
    }
    if(JSON.stringify(m)!==before&&original)updatedIds.add(m.id);
  }catch(error){throw Error(`${line}行目：${error.message}`)}
  for(const m of next.markers){const t=types.find(t=>t.id===m.typeId);if(t?.form==='door'&&!m.components?.length)m.components=[{id:id('leaf'),label:t.components?.[0]||'扉',height:'',width:'',time:'',force:'',hazard:''}]}
  const previousTags=new Map(),tags=new Map();
  for(const m of project.markers){if(!m.serial)continue;const tag=(m.mark||'')+'\0'+m.serial;if(!previousTags.has(tag))previousTags.set(tag,new Set());previousTags.get(tag).add(m.id)}
  for(const m of next.markers){if(!m.serial)continue;const tag=(m.mark||'')+'\0'+m.serial;if(!tags.has(tag))tags.set(tag,[]);tags.get(tag).push(m)}
  for(const [tag,items] of tags)if(items.length>1&&items.some(m=>!previousTags.get(tag)?.has(m.id)))throw Error('整理記号・番号が重複します：'+items[0].mark+'-'+items[0].serial);

  return {next,changes,added,updated:updatedIds.size};
}
// DOM-only adapter shared by normal settings and the administrator's draft.
export function mountCsvPanel(parent,options){
  const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node},root=el('section');root.className='csv-panel';root.dataset.csvPanel=options.key;parent.append(root);root.append(el('h3',options.title),el('p',options.description));
  const actions=el('div');actions.className='csv-actions';root.append(actions);
  for(const [label,template] of [['現在の内容をCSV出力',false],['新規入力用CSVひな形',true]]){const b=el('button',label);b.type='button';b.className='btn btn-light';b.onclick=()=>options.download(new Blob([options.export(template)],{type:'text/csv;charset=utf-8'}),options.filename);actions.append(b)}
  const file=el('input');file.type='file';file.accept='.csv,text/csv';file.dataset.csvFile=options.key;root.append(file);
  const checkLabel=el('label'),clear=el('input');clear.type='checkbox';clear.dataset.csvClear=options.key;checkLabel.append(clear,document.createTextNode('空欄で既存値を消去する（通常はオフ：空欄は変更しません）'));root.append(checkLabel);
  const status=el('p');status.setAttribute('role','status');root.append(status);const preview=el('div');preview.className='csv-preview';root.append(preview);const apply=el('button','確認した内容を一括反映');apply.type='button';apply.className='btn btn-primary';apply.hidden=true;apply.dataset.csvApply=options.key;root.append(apply);let text='',plan;
  function prepare(){apply.hidden=true;plan=null;preview.replaceChildren();try{const candidate=options.prepare(text,{clearBlanks:clear.checked});plan=candidate;status.textContent=`追加 ${plan.added}件 ／ 更新 ${plan.updated}件。写真・不良記録は保持します。下の変更を確認して反映してください。`;for(const change of plan.changes.slice(0,150)){const row=el('p');row.textContent=`${change.label}：${change.before.slice(0,100)||'（空欄）'} → ${change.after.slice(0,100)||'（空欄）'}`;preview.append(row)}if(plan.changes.length>150)preview.append(el('p',`ほか ${plan.changes.length-150}項目`));apply.hidden=!plan.changes.length&&!plan.added;}
    catch(error){status.textContent='取込できません：'+error.message}}
  file.onchange=async()=>{const f=file.files?.[0];if(!f)return;apply.hidden=true;try{if(f.size>5*1024*1024)throw Error('CSVは5MB以内にしてください');const bytes=await f.arrayBuffer();text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd'))text=new TextDecoder('shift_jis').decode(bytes);prepare()}catch(error){status.textContent=error.message}};
  clear.onchange=()=>{if(text)prepare()};apply.onclick=async()=>{if(!plan)return;apply.disabled=true;file.disabled=true;clear.disabled=true;try{await options.apply(plan);status.textContent=options.success||'一括反映しました';apply.hidden=true;plan=null}catch(error){status.textContent='反映できません：'+error.message}finally{apply.disabled=false;file.disabled=false;clear.disabled=false}};
  return root;
}
