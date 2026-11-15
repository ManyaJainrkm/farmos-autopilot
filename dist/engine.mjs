export const fields = [
  {id:'A', name:'North Field', task:'Seeding', rows:12, deadline:27, x:84, y:74, w:338, h:161},
  {id:'B', name:'East Field', task:'Spraying', rows:14, deadline:19, x:455, y:65, w:321, h:171},
  {id:'C', name:'South Field', task:'Tillage', rows:10, deadline:46, x:101, y:270, w:320, h:140},
  {id:'D', name:'West Field', task:'Seeding', rows:12, deadline:60, x:456, y:272, w:315, h:132}
];
export const job = id => fields.find(f => f.id === id);
const fleet = [
  {id:'01', name:'Atlas', tools:['Seeding'], rate:0.8, speed:1.1, fuel:70, at:'A', field:'A'},
  {id:'02', name:'Scout', tools:['Spraying','Seeding'], rate:1, speed:1, fuel:62, at:'B', field:'B'},
  {id:'03', name:'Ranger', tools:['Seeding','Spraying'], rate:1.45, speed:1.6, fuel:84, at:'D', field:null},
  {id:'04', name:'Terra', tools:['Tillage'], rate:0.75, speed:0.9, fuel:55, at:'C', field:'C'},
  {id:'05', name:'Bison', tools:['Seeding'], rate:0.48, speed:0.85, fuel:67, at:'A', field:null}
];
export function initial() {
  return {min:0, running:true, progress:{A:6.5,B:4,C:3,D:12}, tractors:structuredClone(fleet),
    deadlines:Object.fromEntries(fields.map(f=>[f.id,f.deadline])), reserve:15, priority:'B', recovery:null,
    events:[{min:0,kind:'ok',title:'Fleet online',info:'Three assignments active. Two backup tractors ready.'}]};
}
export function log(s,kind,title,info,source) {
  s.events.unshift({min:s.min,kind,title,info,source});
  s.events.length=Math.min(s.events.length,150);
}
const distance = (t,f) => t.at===f.id ? (t.field===f.id ? 0 : 3) : 5 + Math.hypot(job(t.at).x-f.x,job(t.at).y-f.y)/90;
const round = n => Math.round(n*10)/10;
export function assignmentForecast(s,t,f) {
  const travel=t.field===f.id ? (t.eta||0) : distance(t,f)/t.speed;
  const rows=Math.max(0,f.rows-s.progress[f.id]);
  const fuel=rows+travel*.65;
  return {minutes:travel+rows/t.rate,fuel,eligible:!t.failed&&t.tools.includes(f.task)&&t.fuel-fuel>=s.reserve};
}
function canFinish(s,t,f) {
  return assignmentForecast(s,t,f).eligible;
}
export function assign(s,tractorId,fieldId){
  const t=s.tractors.find(t=>t.id===tractorId), f=job(fieldId);
  if(s.pendingRecovery)return 'Wait for the backup handoff to finish.';
  if(!t || !f)return 'Choose a tractor and a work zone.';
  if(t.failed)return t.name+' is offline. Choose another tractor.';
  if(s.progress[f.id]>=f.rows)return f.name+' is already complete.';
  if(t.field===f.id)return t.name+' is already assigned to '+f.name+'.';
  if(!t.tools.includes(f.task))return t.name+' cannot do '+f.task.toLowerCase()+'. Choose another tractor.';
  if(!canFinish(s,t,f))return t.name+' needs more fuel to finish with your '+s.reserve+' L reserve.';
  const previous=job(t.field);
  const old=s.tractors.find(other=>other.field===f.id);
  if(s.recovery?.backup===t.id||s.recovery?.backup&&s.recovery.backup===old?.id)s.recovery=null;
  if(old){
    old.field=null;old.eta=0;
    log(s,'tractor',old.name+' released',f.name+' transferred to '+t.name+'. Checkpoint kept.',old.id);
  }
  t.field=null;t.eta=0;
  dispatch(s,{[t.id]:f.id});
  const text=t.name+' assigned to '+f.name+'.';
  const work=f.task+' · '+Math.floor(s.progress[f.id])+'/'+f.rows+' rows complete.';
  log(s,'tractor',text,work+(previous?' '+previous.name+' is now unassigned.':''),t.id);
  return text;
}
function estimate(s,p) {
  let travel=0, fuel=0, end=0, misses=0, priorityMiss=0;
  for(const f of fields.filter(f=>s.progress[f.id]<f.rows)) {
    const t=s.tractors.find(t=>p[t.id]===f.id);
    if(!t){misses++;priorityMiss+=Number(f.id===s.priority);end=Math.max(end,90);continue;}
    const d=t.field===f.id ? t.eta||0 : distance(t,f)/t.speed;
    const rows=f.rows-s.progress[f.id];
    const finish=d+rows/t.rate;
    travel+=d;fuel+=d*0.65+rows;
    end=Math.max(end,finish);
    if(s.min+finish>s.deadlines[f.id]){misses++;priorityMiss+=Number(f.id===s.priority);}
  }
  return {p, travel:round(travel),fuel:round(fuel),end:round(end),misses,score:misses*250+priorityMiss*100+end*4+fuel+travel};
}
export function plan(s) {
  const open=fields.filter(f=>s.progress[f.id]<f.rows);
  const active=s.tractors.filter(t=>!t.failed);
  const locked=Object.fromEntries(active.filter(t=>t.field).map(t=>[t.id,t.field]));
  const pool=active.filter(t=>!t.field);
  const pending=open.filter(f=>!Object.values(locked).includes(f.id)&&(!s.manualPlan||f.id===s.pendingRecovery?.field)).sort((a,b)=>Number(b.id===s.priority)-Number(a.id===s.priority)||s.deadlines[a.id]-s.deadlines[b.id]);
  const feasible=(t,f)=>canFinish(s,t,f);
  const all=[];
  function evaluate(index,p) {
    if(index===pending.length){all.push(estimate(s,p));return;}
    const f=pending[index];
    evaluate(index+1,p);
    for(const t of pool.filter(t=>!p[t.id]&&feasible(t,f))) evaluate(index+1,{...p,[t.id]:f.id});
  }
  evaluate(0,locked);
  function greedy(by) {
    const p={...locked};
    for(const f of pending) {
      const t=pool.filter(t=>!p[t.id]&&feasible(t,f)).sort((a,b)=>by(a,f)-by(b,f))[0];
      if(t)p[t.id]=f.id;
    }
    return estimate(s,p);
  }
  return {best:all.reduce((a,b)=>a.score<=b.score?a:b),nearest:greedy(distance),
    fastest:greedy(t=>-t.rate),count:all.length};
}
function dispatch(s,p) {
  for(const t of s.tractors.filter(t=>!t.failed&&!t.field&&p[t.id])) {
    const f=job(p[t.id]);
    t.field=f.id;
    t.eta=distance({...t,field:null},f)/t.speed;
    t.trip=t.eta;
  }
}
export function reportFailure(s,id='01') {
  const t=s.tractors.find(t=>t.id===id);
  if(!t||t.failed||s.pendingRecovery)return null;
  const incident={tractor:t.id,field:t.field,point:t.field?s.progress[t.field]:0,startedAt:performance.now()};
  t.failed=true;t.field=null;
  t.stopped=incident.field && !t.eta ? {field:incident.field,progress:incident.point} : null;
  s.pendingRecovery=incident;
  log(s,'fail',t.name+' went offline',incident.field ? job(incident.field).name+' stopped at row '+(Math.floor(incident.point)+1)+'.' : 'Tractor was on standby.',t.id);
  return incident;
}
export function recover(s,incident,plans) {
  if(s.pendingRecovery!==incident)return null;
  const {tractor,field,point}=incident;
  const backup=s.tractors.find(t=>plans.best.p[t.id]===field);
  dispatch(s,plans.best.p);
  s.pendingRecovery=null;
  s.recovery={...plans,failed:tractor,backup:backup?.id,field,point};
  if(backup)log(s,'dispatch',backup.name+' dispatched',job(field).name+' · Resume from row '+(Math.floor(point)+1)+', '+Math.round(point%1*100)+'% through.',backup.id);
  else if(field)log(s,'fail','Assignment queued','No standby tractor meets the equipment and fuel requirements.');
  return s.recovery;
}
export function fail(s,id='01') {
  const incident=reportFailure(s,id);
  return incident&&recover(s,incident,plan(s));
}
export function tick(s, minutes=0.15) {
  if(!s.running)return;
  s.min+=minutes;
  let completed=false;
  for(const t of s.tractors.filter(t=>!t.failed&&t.field)) {
    let workTime=minutes;
    if(t.eta>0) {
      const travel=Math.min(workTime,t.eta);
      t.eta-=travel;t.fuel-=travel*0.65;workTime-=travel;
      if(t.eta<=1e-8){t.eta=0;t.at=t.field;log(s,'tractor',t.name+(s.recovery?.backup===t.id?' resumed work':' arrived'),job(t.field).name+' · Starting from row '+(Math.floor(s.progress[t.field])+1)+'.',t.id);}
    }
    const f=job(t.field);
    const worked=Math.min(f.rows-s.progress[f.id],workTime*t.rate);
    t.fuel-=worked;s.progress[f.id]+=worked;
    if(s.progress[f.id]>=f.rows-1e-8){
      s.progress[f.id]=f.rows;t.at=f.id;t.finishedField=f.id;t.field=null;completed=true;
      log(s,'tractor',t.name+' finished '+f.name,'All '+f.rows+' rows are complete.',t.id);
    }
  }
  if(completed&&!s.pendingRecovery&&!s.manualPlan)dispatch(s,plan(s).best.p);
  if(!s.pendingRecovery&&!s.tractors.some(t=>t.field&&!t.failed))s.running=false;
}
export function command(s,input) {
  const value=input.trim().toLowerCase().replace(/[.!?]+$/,'');
  if(/^(fail|break|simulate (a )?breakdown on) (atlas|tractor (0?1|one))$/.test(value)){
    if(s.tractors[0].failed)return 'Atlas is already offline.';
    if(!s.tractors[0].field)return 'Atlas has completed its assignment. Reset to replay the handoff.';
    fail(s);
    return 'Atlas breakdown applied.';
  }
  if(/^(pause|stop)( the)?( simulation)?$/.test(value)){s.running=false;return 'Simulation paused.';}
  if(/^(resume|start|run)( the)?( simulation)?$/.test(value)){s.running=true;return 'Simulation resumed.';}
  const fieldMatch=value.match(/(?:field ([abcd])\b|(north|east|south|west)(?: field)?\b)/);
  const f=fieldMatch && job((fieldMatch[1]||{north:'a',east:'b',south:'c',west:'d'}[fieldMatch[2]]).toUpperCase());
  const fuel=value.match(/^(?:remember )?(?:(?:keep (?:a )?)?(?:minimum )?fuel reserve(?: at| of)?|keep at least) (\d+)\s?(?:%|percent|liters|litres|l)?$/);
  if(fuel && +fuel[1]<=50){
    s.reserve=+fuel[1];
    try {
      localStorage.setItem('farmos-preferences',JSON.stringify({reserve:s.reserve}));
      return 'Saved. New assignments will keep at least '+s.reserve+' L in reserve.';
    } catch {
      return 'Set to '+s.reserve+' L for this session. Browser storage is unavailable.';
    }
  }
  if(f&&/^prioriti[sz]e /.test(value)){s.priority=f.id;return f.name+' is now the priority for new assignments.';}
  const deadline=value.match(/(?:before|by|due in|in) (\d+) (?:minutes?|min)$/);
  if(f&&deadline&&+deadline[1]>0&&/^(?:finish|schedule|complete) /.test(value)){
    s.deadlines[f.id]=s.min+Number(deadline[1]);
    return f.name+' deadline set for '+deadline[1]+' simulated minutes from now.';
  }
  return 'Try “Prioritize East Field”, “Finish North Field in 20 minutes”, or “Remember fuel reserve 20 liters”.';
}
