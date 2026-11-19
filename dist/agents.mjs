import {job,log,plan,recover,reportFailure} from './engine.mjs?v=weather';

const memoryKey='farmos-last-checkpoint';
const rowText=point=>'row '+(Math.floor(point)+1)+', '+Math.round(point%1*100)+'% through';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function tractorTelemetry(s,t){
  const f=job(t.field||t.stopped?.field||t.finishedField);
  const progress=t.stopped?.progress??s.progress[f?.id];
  const position=f ? f.name+' · '+Math.floor(progress)+'/'+f.rows+' rows' : 'No active field';
  return {id:t.id,name:t.name,status:t.failed?'Offline':t.eta&&t.field?'En route':t.field?'Working':t.finishedField?'Complete':'Standby',
    fuel:Math.ceil(t.fuel),position};
}
export function publishTelemetry(s){
  for(const tractor of s.tractors){
    const t=tractorTelemetry(s,tractor);
    if(t.status==='Offline')continue;
    log(s,'telemetry',t.name+' · '+t.status,t.position+' · '+t.fuel+' L',t.id);
  }
}
export function recallLastCheckpoint(){
  try{return JSON.parse(localStorage.getItem(memoryKey));}catch{return null;}
}
function memoryAgent(s,incident) {
  const checkpoint={field:incident.field,point:incident.point,tractor:incident.tractor,reserve:s.reserve};
  let saved=false;
  if(checkpoint.field){
    try {localStorage.setItem(memoryKey,JSON.stringify(checkpoint));saved=true;}catch{}
  }
  return {checkpoint,saved};
}

export async function coordinateFailure(s,id,onUpdate,isCurrent,beat=550){
  const incident=reportFailure(s,id);
  if(!incident)return null;
  const update=()=>{if(isCurrent())onUpdate();};
  update();
  await delay(beat);
  if(!isCurrent())return null;
  const live=s.tractors.map(t=>tractorTelemetry(s,t));
  log(s,'agent','Tractor Agent · failure confirmed',live.filter(t=>t.status==='Offline').length+' offline across '+live.length+' tractor feeds. Requesting the checkpoint and fuel rule from Memory Agent.');
  update();
  await delay(beat);
  if(!isCurrent())return null;
  const {checkpoint,saved}=memoryAgent(s,incident);
  const field=job(checkpoint.field);
  const memoryText=field?field.name+' · '+rowText(checkpoint.point)+'. ':'No active field checkpoint. ';
  log(s,'memory','Memory Agent · checkpoint returned',memoryText+checkpoint.reserve+' L minimum fuel reserve.'+(saved?' Saved to browser memory.':''));
  update();
  await delay(beat);
  if(!isCurrent())return null;
  // Use the current fleet and the returned checkpoint and fuel rule for scoring.
  const view={...s,reserve:checkpoint.reserve,
    progress:field?{...s.progress,[field.id]:checkpoint.point}:s.progress};
  const plans=plan(view);
  const idForField=Object.keys(plans.best.p).find(id=>plans.best.p[id]===incident.field);
  const selected=s.tractors.find(t=>t.id===idForField);
  const reason=selected?selected.name+' selected · '+plans.best.end+' min fleet ETA · '+plans.best.misses+' deadlines at risk.':'Waiting for an eligible backup.';
  log(s,'agent','Tractor Agent · '+plans.count+' plans evaluated',reason);
  const result=recover(s,incident,plans);
  log(s,'agent','Dispatch Agent · '+(selected?'handoff confirmed':'handoff queued'),selected?selected.name+' now owns the '+field.name+' assignment. The saved coverage stays intact.':'The checkpoint remains available for the next assignment.',selected?.id);
  update();
  return result;
}
