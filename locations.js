// Location hints are case-local; existing free text is never split or replaced.
export const DEFAULT_PLACES=['廊下','階段室','エントランス','管理室','共用部','屋外'];
export const STANDARD_FLOORS=['B2','B1',...Array.from({length:10},(_,i)=>`${i+1}階`),'屋上'];
const text=value=>String(value??'').trim();
export function markerFloor(project,marker){return text(marker.floor??marker.floorOverride)}
export function floorChoices(project){return [...new Set([project.lastFloor,...[...(project.markers||[])].reverse().map(m=>markerFloor(project,m)),...STANDARD_FLOORS].map(text).filter(Boolean))]}
export function quickFloorChoices(project,marker){return [...new Set([markerFloor(project,marker),project.lastFloor,...[...(project.markers||[])].reverse().map(m=>markerFloor(project,m)),...['1階','2階','3階','B1','屋上']].map(text).filter(Boolean))].slice(0,6)}
export function placeCandidates(project,marker,limit=8){
  const seen=new Set(),result=[],floor=markerFloor(project,marker),marks=[...(project.markers||[])].reverse();
  const add=value=>{const raw=text(value),key=raw.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();if(!raw||seen.has(key)||raw===text(marker.memo))return;seen.add(key);result.push(raw)};
  for(const m of marks)if(m.id!==marker.id&&floor&&markerFloor(project,m)===floor)add(m.memo);
  for(const m of marks)if(m.id!==marker.id&&m.page===marker.page)add(m.memo);
  for(const m of marks)if(m.id!==marker.id)add(m.memo);
  for(const place of DEFAULT_PLACES)add(place);
  return result.slice(0,limit);
}
export function locationParts(project,marker,pageName=''){
  return [...new Set([text(pageName),markerFloor(project,marker),text(marker.memo)].filter(Boolean))];
}
export function parseWindowCount(value){
  const s=text(value).normalize('NFKC');if(!s)return '';
  if(!/^\d+(?:\.0+)?$/.test(s))throw Error('排煙窓枚数は1～9999の整数で入力してください');
  const n=Number(s);if(!Number.isSafeInteger(n)||n<1||n>9999)throw Error('排煙窓枚数は1～9999の整数で入力してください');return n;
}
export function windowSummary(markers){
  let total=0,known=0,unknown=0;
  for(const m of markers){try{const count=parseWindowCount(m.windowCount);if(count===''){unknown++;continue}total+=count;known++}catch{unknown++}}
  return {locations:markers.length,total,known,unknown};
}
export function windowSummaryText(summary){return `${summary.locations}箇所 ／ ${summary.unknown?'入力済み合計 ' :''}${summary.total}枚${summary.unknown?`（枚数未入力・要確認 ${summary.unknown}箇所）`:''}`}
