import {syncPaletteColors} from './reuse.js';
import {iconCsv,planIconCsv,adoptIcons,mountCsvPanel} from './bulk.js';
// Basic-pack editor. Holds its own draft; never borrows the active project's state.
export function installBasicPackManager(api) {
  const DRAFT='tenken-basic-draft-v1', HISTORY='tenken-basic-history-v1', PIN='tenken-admin-pin-v1';
  const clone=v=>structuredClone(v), norm=v=>String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  let unlocked=false, draft, tab='types', root, editor=null;
  const labels={types:'アイコン',paletteGroupMaster:'分類・表示',wordingSets:'文言セット',rules:'入力・報告設定',initial:'初期設定',transfer:'取込・更新',delivery:'配布・お知らせ'};
  const esc=api.escapeHtml;
  const imageCount=pack=>(pack.types||[]).filter(t=>!!t.iconData).length;
  const el=(tag,text,action)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(action)e.onclick=action;return e};
  const message=text=>{root.querySelector('[role=status]').textContent=text};
  function persist(pack=draft){try{localStorage.setItem(DRAFT,JSON.stringify(pack));message('下書き保存済みです。画像付きアイコン '+imageCount(pack)+' 種を含みます。「基本セットを一式更新」で確定後、公開用JSONをアップロードすると他端末にも反映します。');return true}catch{message('下書きを保存できません。空き容量を確認し、書き出してください。');return false}}
  const canLeave=text=>!editor?.dirty()||confirm(text);
  const noteEdit=()=>{if(editor)message(editor.dirty()?'未保存の変更があります。「保存」で下書きに保存してください。':'編集中の項目に未保存の変更はありません。')};
  function instructions(parent,title,steps,note){
    const box=el('section');box.className='settings-operation-guide';box.append(el('strong',title));
    const list=el('ol');for(const step of steps)list.append(el('li',step));box.append(list);if(note)box.append(el('p',note));parent.append(box);
  }
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
    syncPaletteColors(draft);
    root=el('div');root.className='basic-manager';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','基本セット管理');document.body.append(root);render();
  }
  function render(){
    editor=null;root.classList.remove('editing');root.replaceChildren();const box=el('section');box.className='basic-manager-box';root.append(box);
    const header=el('header');header.append(el('h2','基本セット管理'),el('button','閉じる',()=>{if(!canLeave('未保存の項目編集を破棄して閉じますか？'))return;if(!persist())return;root.remove();api.onClose?.()}),el('button','管理者モード終了',()=>{if(!canLeave('未保存の項目編集を破棄して終了しますか？'))return;if(!persist())return;unlocked=false;root.remove();api.onClose?.()}));box.append(header);
    const flow=el('div');flow.className='basic-save-flow';for(const text of ['① 項目を編集','②「保存」で下書き保存','③「基本セットを一式更新」で確定'])flow.append(el('span',text));box.append(flow);
    box.append(el('p','ここで作るのは共通のひな形です。公開後、各端末の基本セットを更新します。確定しただけでは他端末へ公開されません。公開用JSONをアップロードすると、各端末の個別追加を残して共通項目を更新します。'));
    box.append(el('p',`画像付きアイコン：下書き ${imageCount(draft)}種 ／ 確定済み ${imageCount(api.read())}種。登録画像は設定JSONに含めて渡します。`));
    const nav=el('nav');nav.setAttribute('aria-label','基本セットの設定');for(const [key,name]of Object.entries(labels)){const b=el('button',name,()=>{if(!canLeave('未保存の項目編集を破棄しますか？'))return;tab=key;render()});b.setAttribute('aria-pressed',String(tab===key));nav.append(b)}box.append(nav);
    const status=el('p','各項目の「保存」は下書き保存です。「基本セットを一式更新」で確定し、公開用JSONをアップロードします。');status.setAttribute('role','status');box.append(status);
    const body=el('div');body.className='basic-manager-content';box.append(body);
    if(tab==='types')instructions(body,'アイコンを設定する順番',[
      '使いたい所属先がない場合だけ、先に「分類・表示」で分類を追加します。登録済みの分類はそのまま選べます。',
      'アイコンを追加・編集し、名前・所属先・色・入力画面を設定します。',
      '編集画面の「保存」で下書き保存し、「一覧へ戻る」で確認します。',
      '設定が揃ったら、画面下の「基本セットを一式更新」で確定します。'
    ],'パレット分類＝配置メニューと分類色、設備大分類＝報告書のまとめ方、作業区分＝報告書の初期値です。コメント候補は作業区分に関係なく表示します。');
    if(tab==='paletteGroupMaster')instructions(body,'分類を先に用意する場合',[
      'パレット分類・設備大分類・作業区分のうち、必要なものだけ追加・編集して「保存」します。',
      '次に「アイコン」へ移り、使う分類を所属先として選びます。',
      'アイコンも保存したら「基本セットを一式更新」でまとめて確定します。'
    ],'「保存」だけなら下書きとして残ります。作業途中で一式更新する必要はありません。');
    if(tab==='wordingSets')instructions(body,'文言セットを設定する順番',[
      '文言を追加・編集し、設備大分類と区分を選んで「保存」します。',
      '「一覧へ戻る」で確認し、最後に「基本セットを一式更新」で確定します。'
    ],'すべての設備で使う文言は、設備大分類に「全設備共通」を選びます。');
    if(tab==='types')iconBulkTools(body);
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
    if(tab==='delivery')deliverySettings(body);
    const footer=el('footer');footer.append(el('button','下書きを保存',()=>editor?editor.save():persist()),el('button','基本セットを一式更新',commit));box.append(footer);
  }

  function iconBulkTools(parent){
    const panel=el('section');panel.className='settings-operation-guide';parent.append(panel);panel.append(el('strong','自分用アイコンを基本セットへ反映'),el('p','取込元を選び、使いたいアイコンと差替先を確認します。差替先のIDを残すので、その基本アイコンを使用中の案件にも新しい設定を反映できます。'));
    panel.append(el('button','現在の案件から選んで差し替え',()=>selectSourceIcons(api.projectPack(),'現在の案件')));
    const personal=el('button','自分用初期設定から選んで差し替え',()=>selectSourceIcons(api.personalPack(),'自分用初期設定'));personal.disabled=!api.personalPack?.();panel.append(personal);
    let snapshot;
    mountCsvPanel(parent,{key:'basic-icons',title:'基本セットのアイコンCSV',description:'下書きの設定をCSVで一括編集します。画像は既存IDのものを保持します。取込後に「基本セットを一式更新」で確定します。',filename:'基本セット_アイコン設定.csv',download:api.download,export:template=>iconCsv(draft,template),prepare:(text,options)=>{snapshot=JSON.stringify(draft);const plan=planIconCsv(draft,text,options);validate(plan.next);syncPaletteColors(plan.next);return plan},apply:plan=>{if(JSON.stringify(draft)!==snapshot)throw Error('下書きが変更されています。CSVを選び直してください。');if(!persist(plan.next))throw Error('下書きを保存できません');draft=plan.next;render();message('CSVを下書きへ反映しました。最後に「基本セットを一式更新」で確定してください。')},success:'CSVを下書きへ反映しました。'});
  }
  function selectSourceIcons(source,label){
    if(!source?.types?.length){message('取込元のアイコンがありません');return}
    const snapshot=JSON.stringify(draft),body=root.querySelector('.basic-manager-content');body.replaceChildren();body.append(el('h3',label+' → 基本セットの下書き'),el('p','左側で取込対象を選び、差替先を選択してください。同じIDまたは名前は候補を設定します。名前が違う個別アイコンで基本アイコンを置き換える場合は、差替先を選び直してください。未選択の基本アイコンは残します。'));
    const actions=el('div');body.append(actions);const choices=[];
    for(const checked of [true,false])actions.append(el('button',checked?'すべて選択':'すべて解除',()=>choices.forEach(c=>c.check.checked=checked)));
    for(const type of source.types){const row=el('section');row.className='basic-icon-replace-row';const check=el('input');check.type='checkbox';check.dataset.adoptSource=type.id;const name=el('label');name.append(check,document.createTextNode(type.name));const art=el('div');art.className='basic-preview';art.innerHTML=api.markerPreviewHtml(type);row.append(art,name);const select=el('select');select.setAttribute('aria-label',type.name+'の差替先');select.dataset.adoptTarget=type.id;const add=el('option','新規追加（既存を残す）');add.value='';select.append(add);for(const target of draft.types){const option=el('option','差替：'+target.name);option.value=target.id;select.append(option)}select.value=draft.types.find(t=>t.id===type.id)?.id||draft.types.find(t=>norm(t.name)===norm(type.name))?.id||'';row.append(select);body.append(row);choices.push({check,select,id:type.id})}
    const status=el('p');status.setAttribute('role','status');body.append(status);body.append(el('button','選択したアイコンを下書きへ反映',()=>{try{if(JSON.stringify(draft)!==snapshot)throw Error('下書きが変わりました。画面を開き直してください');const selected=choices.filter(c=>c.check.checked).map(c=>({sourceId:c.id,targetId:c.select.value}));if(!selected.length)throw Error('アイコンを選択してください');const plan=adoptIcons(draft,source,selected);validate(plan.next);syncPaletteColors(plan.next);if(!persist(plan.next))throw Error('下書きを保存できません');draft=plan.next;render();message(`追加 ${plan.added}件・差替 ${plan.updated}件を下書きへ反映しました。「基本セットを一式更新」で確定してください。`)}catch(error){status.textContent=error.message}}),el('button','戻る',render));
  }

  function input(parent,label,value,change,type='text',options){const wrap=el('label');wrap.className='field';wrap.append(el('span',label));const e=el(type==='textarea'?'textarea':type==='select'?'select':'input');e.setAttribute('aria-label',label);if(type!=='textarea'&&type!=='select')e.type=type;if(options){if(!options.some(([v])=>v===(value??''))){const o=el('option','現在の設定が見つかりません。選び直してください');o.value='';e.append(o)}for(const [v,n]of options){const o=el('option',n);o.value=v;e.append(o)}}e.value=options&&!options.some(([v])=>v===(value??''))?'':value??'';e.oninput=()=>{change(type==='number'?Number(e.value):e.value);noteEdit()};if(type==='select')e.onchange=e.oninput;wrap.append(e);parent.append(wrap);return e}
  function check(p,label,value,change){const w=el('label');w.className='basic-check';const e=el('input');e.type='checkbox';e.checked=value;e.onchange=()=>{change(e.checked);noteEdit()};w.append(e,document.createTextNode(label));p.append(w);return e}
  function stringList(p,label,values,change){input(p,label+'（1行に1項目）',(values||[]).join('\n'),v=>change([...new Set(v.split('\n').map(x=>x.trim()).filter(Boolean))]),'textarea')}
  const collectionNames={types:'アイコン',wordingSets:'文言',paletteGroupMaster:'分類',equipmentGroupMaster:'設備大分類',workCategoryMaster:'作業区分'};
  function list(p,key){const items=draft[key]||[];input(p,'検索','',v=>{for(const r of rows.children)r.hidden=!norm(r.textContent).includes(norm(v))});const rows=el('div');p.append(rows);
    items.forEach((item,i)=>{const row=el('div');row.className='basic-item';row.append(el('span',item.name||item.text||item.id),el('button','編集',()=>edit(key,i)));
      if(key==='types'){row.prepend(preview(item));for(const [d,n]of [[-1,'↑'],[1,'↓']])row.append(el('button',n,()=>{const j=i+d;if(j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];items.forEach((t,n)=>t.paletteOrder=n);persist();render()}))}
      row.append(el('button','削除',()=>{if(!confirm('基本セットの下書きから削除しますか？ 作成済み案件は変更されません。'))return;
        if(key==='types'&&items.length<=1){message('アイコンは1つ以上必要です。別のアイコンを追加してから削除してください。');return}
        if(key!=='types'&&key!=='wordingSets'&&(items.length<=1||draft.types.some(t=>key==='workCategoryMaster'&&(t.quickFindings||[]).some(q=>(q.workCategoryIds||[]).includes(item.id))||(key==='paletteGroupMaster'?(t.paletteGroupId||t.category):key==='equipmentGroupMaster'?t.majorGroupId:(t.workCategoryIds||[]).includes(item.id)?item.id:'')===item.id)||key==='equipmentGroupMaster'&&draft.wordingSets.some(w=>w.equipmentGroupId===item.id))){message('使用中、または最後の分類は削除できません。先に所属を変更してください。');return}
        items.splice(i,1);persist();render()}));rows.append(row)});
    p.append(el('button','＋ '+collectionNames[key]+'を追加',()=>edit(key,-1)));
  }
  function preview(t,full=false){t=syncPaletteColors({types:[clone(t)],paletteGroupMaster:draft.paletteGroupMaster}).types[0];const wrap=el('div');wrap.className='basic-preview';wrap.innerHTML=full?api.typePreviewHtml(t):api.markerPreviewHtml(t);return wrap}
  function edit(key,index){
    root.classList.add('editing');let items=draft[key]||(draft[key]=[]);const isType=key==='types';
    let item=index>=0?clone(items[index]):isType?{id:crypto.randomUUID(),name:'',glyph:'設',category:'other',paletteGroupId:draft.paletteGroupMaster[0].id,majorGroupId:draft.equipmentGroupMaster[0].id,form:'basic',colorMode:'group',color:'#1769aa',textColor:'#ffffff',defaultSize:22,mark:'',enabled:true,countByDefault:true,paletteFavorite:false,components:[],extraFields:[],quickFindings:[],workCategoryIds:[]}:{id:crypto.randomUUID(),...(key==='wordingSets'?{text:'',severity:'要是正',equipmentGroupId:''}:{name:'',...(key==='paletteGroupMaster'?{color:'#705ab0'}:{})})};
    const content=root.querySelector('.basic-manager-content');content.replaceChildren();
    instructions(content,'この画面での操作',[
      isType?'内容を入力・選択します。所属先は登録済みの分類から選んでください。':key==='wordingSets'?'文言を入力し、設備大分類と区分を選びます。':'分類の名前や色を入力します。',
      '「保存」で下書き保存します。続けて作る場合は「保存して次を追加」を使います。',
      '「一覧へ戻る」で確認し、最後に「基本セットを一式更新」で共通のひな形として確定します。'
    ],isType?'背景色は「分類の色に合わせる」なら分類色に連動、「このアイコンだけ別の色にする」なら個別指定です。':'保存と一式更新は役割が異なります。現在の案件を変更したい場合は、通常の環境設定で編集します。');
    const actions=el('div');content.append(el('h3',collectionNames[key]+'の編集'),actions);let previewHost,imageLoading=false,imageError='',imageSequence=0;
    const update=(k,v)=>{item[k]=v;if(isType)syncPaletteColors({types:[item],paletteGroupMaster:draft.paletteGroupMaster});if(previewHost)previewHost.replaceChildren(preview(item,true));noteEdit()};
    if(isType){item.paletteGroupId=item.paletteGroupId||(draft.paletteGroupMaster.some(g=>g.id===item.category)?item.category:draft.paletteGroupMaster[0].id);item.majorGroupId=item.majorGroupId||draft.equipmentGroupMaster[0].id;item.form=item.form||'basic';item.labelPosition=item.labelPosition||'bottom';syncPaletteColors({types:[item],paletteGroupMaster:draft.paletteGroupMaster});previewHost=el('div');previewHost.className='basic-preview-panel';previewHost.append(preview(item,true));content.append(previewHost)}
    input(content,key==='wordingSets'?'不良文言':'名前',item.text??item.name,v=>update(key==='wordingSets'?'text':'name',v),key==='wordingSets'?'textarea':'text');
    if(isType){
      for(const [k,n,type]of [['glyph','表示文字','text'],['mark','整理記号','text'],['textColor','文字色（個別設定）','color'],['defaultSize','標準サイズ（12～90）','number'],['countUnit','数量単位','text']])input(content,n,item[k],v=>update(k,v),type);
      const colorMode=input(content,'背景色の使い方',item.colorMode,v=>{update('colorMode',v);refreshColor()},'select',[['group','分類の色に合わせる'],['custom','このアイコンだけ別の色にする']]);
      const colorInput=input(content,'アイコン個別の背景色',item.color,v=>update('color',v),'color');
      function refreshColor(){colorInput.disabled=item.colorMode!=='custom';colorInput.value=item.color||'#1769aa';colorMode.value=item.colorMode}
      refreshColor();content.append(el('p','分類の色に合わせる場合、パレット分類の色変更がアイコンにも反映します。文字色は個別に設定できます。'));
      for(const [k,n,options]of [['paletteGroupId','パレット分類',draft.paletteGroupMaster.map(g=>[g.id,g.name])],['majorGroupId','設備大分類',draft.equipmentGroupMaster.map(g=>[g.id,g.name])],['form','入力画面',[['door','危害防止測定'],['smokeOutlet','排煙口'],['smokeWindow','排煙窓'],['basic','一般記録']]],['labelPosition','整理番号の位置',[['bottom','下'],['top','上'],['left','左'],['right','右']]]])input(content,n,item[k]||options[0][0],v=>{update(k,v);if(k==='paletteGroupId')refreshColor()},'select',options);
      for(const [k,n]of [['enabled','配置メニューに表示'],['paletteFavorite','常用に表示'],['countByDefault','数量集計に含める']])check(content,n,item[k]!==false&&(k!=='paletteFavorite'||!!item[k]),v=>update(k,v));
      stringList(content,'測定部位',item.components,v=>update('components',v));stringList(content,'追加記録項目',item.extraFields,v=>update('extraFields',v));
      const work=el('div');work.append(el('h4','旧設定の作業区分（コメント表示には使いません）'));content.append(work);for(const g of draft.workCategoryMaster)check(work,g.name,(item.workCategoryIds||[]).includes(g.id),v=>{const ids=new Set(item.workCategoryIds||[]);v?ids.add(g.id):ids.delete(g.id);item.workCategoryIds=[...ids]});
      for(const id of item.workCategoryIds||[])if(!draft.workCategoryMaster.some(g=>g.id===id))check(work,'参照先がない作業区分（'+id+'）— チェックを外して解除',true,v=>{item.workCategoryIds=v?[...new Set([...(item.workCategoryIds||[]),id])]:(item.workCategoryIds||[]).filter(x=>x!==id)});
      check(content,'調査区分は共通設定を使う',!Array.isArray(item.findingCategorySelection),v=>{item.findingCategorySelection=v?null:[...draft.findingCategories];categoryChoices()});
      const cats=el('div');content.append(cats);function categoryChoices(){cats.replaceChildren();if(Array.isArray(item.findingCategorySelection))for(const c of draft.findingCategories)check(cats,c,item.findingCategorySelection.includes(c),v=>{const ids=new Set(item.findingCategorySelection);v?ids.add(c):ids.delete(c);item.findingCategorySelection=[...ids]})}categoryChoices();
      const upload=input(content,'アイコン画像（PNG）','',async()=>{},'file');upload.accept='image/png';
      const imageStatus=el('small',item.iconData?'画像登録済みです。保存・一式更新後、設定JSONに画像も含まれます。':'画像は未登録です。画像を選択したら、読み込み完了後に保存してください。');imageStatus.setAttribute('aria-live','polite');content.append(imageStatus);
      upload.onchange=async()=>{
        const file=upload.files?.[0],sequence=++imageSequence,owner=editor;imageLoading=!!file;imageError='';if(!file)return;
        imageStatus.textContent='画像を読み込み中です。完了まで保存をお待ちください。';
        try{const data=await api.iconToDataUrl(file);if(sequence!==imageSequence||editor!==owner)return;imageLoading=false;update('iconData',data);imageStatus.textContent='画像を読み込みました。「保存」→「基本セットを一式更新」で画像も確定します。';message(imageStatus.textContent)}
        catch(e){if(sequence!==imageSequence||editor!==owner)return;imageLoading=false;imageError='画像を読み込めませんでした。選び直すか「登録画像を削除」で取り消してください。';imageStatus.textContent=imageError;message(imageError)}
      };
      content.append(el('button','登録画像を削除（表示文字に戻す）',()=>{imageSequence++;imageLoading=false;imageError='';upload.value='';update('iconData','');imageStatus.textContent='画像を削除する設定です。保存すると表示文字へ戻ります。'}));
      const q=el('div');content.append(q);function quick(){q.replaceChildren();q.append(el('h4','常用ボタン'));(item.quickFindings||[]).forEach((x,i)=>{const row=el('fieldset');q.append(row);for(const [k,n]of [['label','ボタン名'],['title','内容・概要'],['detail','補足'],['proposal','改善提案']])input(row,n,x[k]||'',v=>x[k]=v);x.severity=x.severity||'要是正';input(row,'区分',x.severity,v=>x.severity=v,'select',draft.findingCategories.map(c=>[c,c]));for(const id of x.workCategoryIds||[])if(!draft.workCategoryMaster.some(g=>g.id===id))check(row,'参照先がない作業区分（'+id+'）— チェックを外して解除',true,v=>{x.workCategoryIds=v?[...new Set([...(x.workCategoryIds||[]),id])]:(x.workCategoryIds||[]).filter(i=>i!==id)});row.append(el('button','削除',()=>{item.quickFindings.splice(i,1);quick();noteEdit()}))});q.append(el('button','＋ 常用ボタンを追加',()=>{(item.quickFindings||=[]).push({id:crypto.randomUUID(),label:'',title:'',detail:'',severity:'要是正'});quick();noteEdit()}))}quick();
    }else if(key==='wordingSets'){
      item.equipmentGroupId=item.equipmentGroupId||'';item.severity=item.severity||draft.findingCategories[0];input(content,'設備大分類',item.equipmentGroupId,v=>item.equipmentGroupId=v,'select',[['','全設備共通'],...draft.equipmentGroupMaster.map(g=>[g.id,g.name])]);input(content,'区分',item.severity,v=>item.severity=v,'select',draft.findingCategories.map(c=>[c,c]));
    }else if(key==='paletteGroupMaster')input(content,'分類の色（分類に合わせるアイコンへ反映）',item.color,v=>item.color=v,'color');
    let savedItem=JSON.stringify(item);
    function save(next=false){
      if(imageLoading){message('画像を読み込み中です。完了してから保存してください。');return false}
      if(imageError){message(imageError);return false}
      if(!(item.name||item.text||'').trim()){message('名前・文言を入力してください');return false}
      if(items.some((x,i)=>i!==index&&norm(x.name||x.text)===norm(item.name||item.text))){message('同じ名前・文言が登録されています。既存項目を編集してください。');return false}
      if(isType&&(!Number.isFinite(item.defaultSize)||item.defaultSize<12||item.defaultSize>90)){message('サイズは12～90で入力してください');return false}
      if(isType&&Array.isArray(item.findingCategorySelection)&&!item.findingCategorySelection.length){message('調査区分を1つ以上選んでください');return false}
      try{if(isType)validateType(draft,item);if(key==='wordingSets'&&item.equipmentGroupId&&!draft.equipmentGroupMaster.some(g=>g.id===item.equipmentGroupId))throw Error('文言の設備大分類を選び直してください。')}catch(e){message(e.message);return false}
      if(isType)item.sizeVersion=1;
      const candidate=clone(draft),nextIndex=index<0?candidate[key].length:index;if(index<0)candidate[key].push(clone(item));else candidate[key][index]=clone(item);syncPaletteColors(candidate);if(!persist(candidate))return false;draft=candidate;items=draft[key];index=nextIndex;savedItem=JSON.stringify(item);if(next)edit(key,-1);return true;
    }
    actions.append(el('button','保存',()=>save()),el('button','保存して次を追加',()=>save(true)),el('button','複製して作成',()=>{if(!save())return;const copy=clone(item);copy.id=crypto.randomUUID();if(key==='wordingSets')copy.text+='（複製）';else copy.name+='（複製）';items.push(copy);persist();edit(key,items.length-1)}),el('button','一覧へ戻る',()=>{if(canLeave('未保存の編集を破棄して一覧に戻りますか？'))render()}));
    editor={save,dirty:()=>imageLoading||!!imageError||JSON.stringify(item)!==savedItem};
    if(isType)actions.append(el('button','このアイコンを削除',()=>{
      if(items.length<=1){message('アイコンは1つ以上必要です。別のアイコンを追加してから削除してください。');return}
      if(!confirm('このアイコンを基本セットの下書きから削除しますか？ 作成済み案件は変更されません。'))return;
      if(index<0){render();return}items.splice(index,1);persist();render();
    }));
  }
  function validateType(pack,t){
    const has=(key,id)=>(pack[key]||[]).some(x=>x.id===id),name='「'+(t.name||'名前未入力')+'」';
    if(!has('paletteGroupMaster',t.paletteGroupId||t.category))throw Error(name+'のパレット分類を選び直してください。現在の所属先が見つかりません。');
    if(!has('equipmentGroupMaster',t.majorGroupId))throw Error(name+'の設備大分類を選び直してください。現在の所属先が見つかりません。');
    if((t.workCategoryIds||[]).some(id=>!has('workCategoryMaster',id)))throw Error(name+'の対象作業区分に削除済みの項目があります。該当するチェックを外してください。');
    if((t.quickFindings||[]).some(q=>(q.workCategoryIds||[]).some(id=>!has('workCategoryMaster',id))))throw Error(name+'の常用ボタンに削除済みの作業区分があります。該当するチェックを外してください。');
  }
  function validate(pack){
    if(pack?.format!=='tenken-pwa-settings'||!Array.isArray(pack.types)||!pack.types.length)throw Error('基本セットの形式が違います');
    for(const key of ['types','paletteGroupMaster','equipmentGroupMaster','workCategoryMaster','wordingSets']){const a=pack[key];if(!Array.isArray(a)||key!=='wordingSets'&&!a.length)throw Error('必須の設定がありません：'+key);const ids=new Set(),names=new Set();for(const x of a){if(!x.id||ids.has(x.id))throw Error('IDが重複しています：'+key);ids.add(x.id);const n=norm(x.name||x.text);if(!n||names.has(n))throw Error('名前・文言が空欄、または重複しています：'+key);names.add(n)}}
    const has=(key,id)=>pack[key].some(x=>x.id===id);
    if(!Array.isArray(pack.findingCategories)||!pack.findingCategories.length)throw Error('調査区分を1つ以上設定してください');
    if(Array.isArray(pack.findingCategorySelection)&&!pack.findingCategorySelection.length)throw Error('選択ボタンを1つ以上設定してください');
    for(const t of pack.types)validateType(pack,t);
    for(const w of pack.wordingSets)if(w.equipmentGroupId&&!has('equipmentGroupMaster',w.equipmentGroupId))throw Error('文言の設備大分類を確認してください');
    return pack;
  }
  function commit(){if(!unlocked)return;try{if(editor&&!editor.save())return;validate(draft);if(!confirm('基本セットを一式更新します。画面を閉じると現在の案件にも基本セットを反映します。点検記録・個別追加は保持します。他端末への配布は公開用JSONのアップロードが必要です。'))return;
      const before=api.read();const h=JSON.parse(localStorage.getItem(HISTORY)||'[]');h.unshift({date:new Date().toISOString(),pack:before});localStorage.setItem(HISTORY,JSON.stringify(h.slice(0,3)));
      const pack=clone(draft);pack.updatedAt=new Date().toISOString();if(!api.write(pack))return;draft=pack;const saved=persist();render();message(saved?'この端末の基本セットを確定しました。他端末へは公開用JSONを書き出してアップロードしてください。個別追加は保持します。':'基本セットの更新は完了しましたが、下書きの保存に失敗しました。空き容量を確認してください。');
    }catch(e){message(e.message)}}
  function deliverySettings(p){
    p.append(el('p',`配布する確定済みセットには画像付きアイコンが ${imageCount(api.read())} 種あります。下書きは ${imageCount(draft)} 種です。元PNGを別に同梱する必要はありません。`));
    p.append(el('h3','基本セットを全端末へ自動配布・更新'),el('p','「基本セットを一式更新」で確定した内容を書き出します。initial-settings.json をアプリと同じ公開フォルダへ置いてください。使用済みの端末も公開内容を確認し、個別追加を残して基本セットを自動反映します。通常の更新ZIPにこのファイルは含めません。'));
    p.append(el('button','確定済みセットを initial-settings.json に書き出す',()=>{try{const pack=api.read();validate(pack);api.download(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),'initial-settings.json');message(`画像付きアイコン ${imageCount(pack)} 種を含む設定JSONを書き出しました。`)}catch(e){message(e.message)}}));
    p.append(el('h3','メンテナンス・更新のお知らせ'),el('p','下の内容を app-status.json に書き出し、同じ公開フォルダへ置きます。メンテナンス中も入力・保存は続けられます。終了時はチェックを外したファイルを再公開してください。アプリを新しい版へ更新するときは、一式の配置が完了してから公開版数を変更します。'));
    let saved={};try{saved=JSON.parse(localStorage.getItem('tenken-delivery-notice-draft-v1')||'{}')}catch{}
    const version=input(p,'公開するアプリの版数',saved.latestVersion||document.querySelector('.brand small')?.textContent.match(/(\d+\.\d+(?:\.\d+)?)$/)?.[1]||'',()=>{});
    const maintenance=check(p,'メンテナンス中のお知らせを出す',saved.maintenance?.enabled===true,()=>{});
    const maintenanceText=input(p,'メンテナンスの説明',saved.maintenance?.message||'公開ファイルを更新しています。入力・保存は続けられます。終了後に更新してください。',()=>{},'textarea');
    const notice=input(p,'通常のお知らせ（任意）',saved.notice?.message||'',()=>{},'textarea');
    p.append(el('button','app-status.json を書き出す',()=>{if(!/^\d+\.\d+(?:\.\d+)?$/.test(version.value.trim())){message('版数は 0.61 や 0.61.1 の形式で入力してください');return}const data={format:'tenken-pwa-status',schemaVersion:1,latestVersion:version.value.trim(),maintenance:{enabled:maintenance.checked,message:maintenanceText.value.trim()},notice:{message:notice.value.trim()}};try{localStorage.setItem('tenken-delivery-notice-draft-v1',JSON.stringify(data))}catch{}api.download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'app-status.json');message('お知らせを書き出しました。公開フォルダへアップロードしてください。')}));
    p.append(el('p','オンライン起動時・画面へ戻った時・表示中は約2分ごとにお知らせを確認します。オフラインでは通常どおり使えます。作業中の画面は自動で再読み込みしません。入力を保存してから「保存して更新」で切り替えます。'));
  }
  function transfer(p){
    instructions(p,'画像付きの基本セットを別の端末へ渡す方法',['アイコン画像の読み込み完了を確認して「保存」し、「基本セットを一式更新」で確定します。','この画面で基本セットJSONを書き出し、別の端末で設定JSONとして読み込みます。','すでに同じアイコンがある場合は「既存の項目を更新する」を選びます。自分用初期設定として一式を揃えることもできます。'],'PNG画像はJSONに埋め込みます。アプリの更新ZIPだけでは、この端末で登録した基本セットは他の端末へ移りません。');
    p.append(el('h3','現在の案件から取り込む'),el('p','分類 → アイコン → 文言の順に取り込めます。同じID・名前・文言の項目は、追加前に比較します。'));
    for(const key of ['paletteGroupMaster','equipmentGroupMaster','workCategoryMaster','types','wordingSets']){const group=el('details');group.append(el('summary',collectionNames[key]));p.append(group);for(const x of api.projectPack()[key]||[]){const row=el('div');row.className='basic-item';const match=draft[key].find(y=>y.id===x.id||norm(y.name||y.text)===norm(x.name||x.text));row.append(el('span',(x.name||x.text)+(match?'（登録済み候補あり）':'')),el('button','比較して取込',()=>compare(key,x,match)));group.append(row)}}
    p.append(el('h3','ファイルと履歴'));p.append(el('button','公開用基本セットを書き出す（自動読込用）',()=>{try{const pack=api.read();validate(pack);api.download(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),'initial-settings.json');message('initial-settings.jsonをindex.htmlと同じ公開フォルダへ置いてください。画像も含まれます。')}catch(e){message(e.message)}}));
    p.append(el('button','下書きJSONを書き出す（手動読込用）',()=>{try{validate(draft);api.download(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),'基本セット.json');message(`画像付きアイコン ${imageCount(draft)} 種を含む設定JSONを書き出しました。`)}catch(e){message(e.message)}}));
    const file=input(p,'基本セットJSONを下書きへ読み込む','',()=>{},'file');file.accept='.json';file.onchange=async()=>{try{const data=JSON.parse(await file.files[0].text());validate(data);if(confirm('現在の下書きを読み込んだ内容に置き換えますか？')){draft=data;persist();render()}}catch(e){message('読み込めません：'+e.message)}};
    p.append(el('p','他の利用者へ自動反映するには「配布・お知らせ」から initial-settings.json を書き出し、アプリと同じ公開フォルダへ置きます。設定済み端末も共通項目を更新します。個別追加・点検記録は残します。'));
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
  return {open:login,isUnlocked:()=>unlocked,validate};
}
