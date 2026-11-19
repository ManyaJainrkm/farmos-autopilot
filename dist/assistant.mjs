import {assignmentForecast,fields,job} from './engine.mjs?v=weather';
import {tractorTelemetry} from './agents.mjs?v=weather';

const compass={north:'A',east:'B',south:'C',west:'D'};
const rounded=n=>Math.round(n*10)/10;
const spokenMinutes=n=>n<1?'under a minute':'about '+rounded(n)+' min';
const rowAt=n=>'row '+(Math.floor(n)+1)+', '+Math.round(n%1*100)+'% through';

export function understand(input,s,previous={}) {
  const text=input.trim().toLowerCase().replace(/[.!?]+$/,'');
  const named=s.tractors.find(t=>new RegExp('\\b'+t.name.toLowerCase()+'\\b').test(text));
  const number=text.match(/\btractor\s+0?([1-5])\b/);
  const compassWord=text.match(/\b(north|east|south|west)\b/);
  const fieldLetter=text.match(/\b(?:field|zone) ([abcd])\b/);
  const explicitField=compass[compassWord?.[1]]||fieldLetter?.[1].toUpperCase();
  const tractor=named||s.tractors.find(t=>number&&t.id==='0'+number[1])||
    (/\b(it|its|that tractor|this tractor)\b/.test(text)?s.tractors.find(t=>t.id===previous.tractor):undefined);
  const field=job(explicitField||(/\b(it|that field|that zone|there)\b/.test(text)&&!tractor?previous.field:null));
  const action=text
    .replace(/^(?:hey|hi|hello)(?:\s+farmos)?[,! ]+/,'')
    .replace(/^(?:(?:can|could|would|will) you (?:please )?|please |i(?:'d| would) like you to )/,'')
    .replace(/,? please$/,'').trim();
  let change;
  if(!/\b(if|unless|hypothetically|what happens|not|never)\b/.test(action)){
    if(/^(assign|send|move|put|place|dispatch|reassign|have|get)\b/.test(action)&&
       (/^(assign|send|move|put|place|dispatch|reassign)\b/.test(action)||tractor&&field)){
      change={type:'assign',tractor:tractor?.id,field:field?.id,start:/^(send|move|put|place|dispatch|get)\b/.test(action)};
    }
    else if(/^(?:simulate (?:a )?(?:breakdown|failure)(?: (?:for|on))?|fail|break(?: down)?)\b/.test(action))change={type:'fail',tractor:tractor?.id};
    else if(/^(?:remember|set|keep)\b/.test(action)&&/\b(fuel|reserve|at least)\b/.test(action)){
      const liters=action.match(/\b(\d{1,3})\b/);
      change=liters&&!/%|percent/.test(action)?{type:'command',text:'Remember fuel reserve '+liters[1]+' liters'}:{type:'reserveHelp'};
    }
    else if(/^(?:pause|stop|resume|start|run)(?: the)?(?: simulation)?$/.test(action))change={type:'command',text:action};
    else if(field&&/^prioriti[sz]e\b/.test(action))change={type:'command',text:'Prioritize '+field.name};
    else if(field&&/^(?:finish|schedule|complete)\b.*(?:before|by|due in|in) \d+ (?:minutes?|min)$/.test(action))change={type:'command',text:action};
  }
  return {text,tractor,field,change};
}

function fieldStatus(s,f) {
  const progress=s.progress[f.id];
  if(progress>=f.rows)return f.name+' is complete. All '+f.rows+' rows are done.';
  const t=s.tractors.find(t=>!t.failed&&t.field===f.id);
  const count=rounded(progress)+' of '+f.rows+' rows complete';
  if(!t)return f.name+' has '+count+' and no tractor assigned.';
  const {minutes}=assignmentForecast(s,t,f);
  return f.name+' has '+count+'. '+t.name+(t.eta?' is on the way.':' is '+f.task.toLowerCase()+'.')+
    ' Estimated finish in '+spokenMinutes(minutes)+' of simulation time.'+(s.running?'':' The simulation is paused.');
}
function available(s,f) {
  return s.tractors.filter(t=>!t.field&&assignmentForecast(s,t,f).eligible)
    .map(t=>({name:t.name,f:assignmentForecast(s,t,f)})).sort((a,b)=>a.f.minutes-b.f.minutes);
}
function recoveryStatus(s) {
  if(s.pendingRecovery)return 'The agents are checking tractor availability, saved row coverage and your '+s.reserve+' L fuel reserve.';
  const r=s.recovery;
  if(!r)return null;
  const failed=s.tractors.find(t=>t.id===r.failed),backup=s.tractors.find(t=>t.id===r.backup);
  const f=job(r.field);
  if(!f)return failed.name+' failed on standby. Its outage did not interrupt a field.';
  if(!backup)return failed.name+' went offline in '+f.name+' at '+rowAt(r.point)+'. The work is queued until an eligible tractor is available.';
  const nearest=s.tractors.find(t=>r.nearest.p[t.id]===f.id);
  const comparison=nearest&&nearest.id!==backup.id?' '+nearest.name+' was closer. The fleet was estimated to finish in '+
    r.best.end+' min with '+backup.name+' versus '+r.nearest.end+' min with '+nearest.name+
    (r.best.fuel!==r.nearest.fuel?' ('+rounded(Math.abs(r.best.fuel-r.nearest.fuel))+' L '+(r.best.fuel>r.nearest.fuel?'more':'less')+' fuel).':'.'):'';
  const status=s.progress[f.id]===f.rows?'has finished the remaining rows.':backup.eta>0?'is on the way to finish from that point.':'has resumed work from that point.';
  return failed.name+' stopped in '+f.name+' at '+rowAt(r.point)+'. '+backup.name+' '+status+comparison;
}
function tractorStatus(s,t) {
  const live=tractorTelemetry(s,t);
  return t.name+' is '+live.status.toLowerCase()+'. '+live.position+' · '+live.fuel+' L of fuel.'+
    (t.field&&t.eta?' Arrival in '+spokenMinutes(t.eta)+' of simulation time.':'');
}
function deadlineStatus(s) {
  const unfinished=fields.filter(f=>s.progress[f.id]<f.rows);
  if(!unfinished.length)return 'All zones are complete.';
  const risk=unfinished.flatMap(f=>{
    const t=s.tractors.find(t=>t.field===f.id&&!t.failed);
    if(!t)return [f.name+': unassigned'];
    return s.min+assignmentForecast(s,t,f).minutes>s.deadlines[f.id]?[f.name+': estimated finish after its deadline']:[];
  });
  return risk.length?'Check these zones: '+risk.join('; ')+'.':'All assigned zones are projected to finish before their deadlines.';
}
export function answerFarmQuestion({text,tractor,field},s,memory) {
  if(/^(hi|hello|hey)(?: farmos)?$|^(help|what can you do)(\b|$)/.test(text))return 'Ask which fields still need work, how much fuel a tractor has, or why a backup was chosen. To change work, say “Assign Ranger to North Field.”';
  if(/\b(reserve|minimum fuel)\b/.test(text))return 'Your current minimum fuel reserve is '+s.reserve+' L. New assignments must leave at least that much after travel and field work.';
  if(/\b(memory|remember|checkpoint)\b/.test(text)){
    const savedField=job(memory?.field);
    return savedField?'Memory Agent saved '+savedField.name+' at '+rowAt(memory.point)+' with a '+memory.reserve+' L fuel reserve.':'No breakdown checkpoint is saved yet. Your current fuel reserve is '+s.reserve+' L.';
  }
  if(/\b(weather|forecast|wind|rain|soil|moisture|irrigate|water the field)\b/.test(text))return 'FarmOS has tractor and row data for this demo. It has no weather or soil readings to support that decision.';
  if(/\b(if|would happen)\b.*\b(fail|fails|failure|break|breaks|offline|goes down)\b/.test(text)){
    const f=field||job(tractor?.field);
    if(!f)return 'FarmOS saves the row checkpoint on a working tractor, checks fuel and equipment, then chooses an eligible backup when one is available.';
    const candidates=available(s,f);
    return 'If work stops in '+f.name+', FarmOS keeps completed rows. '+(candidates.length?
      'Current compatible standbys: '+candidates.map(t=>t.name).join(', ')+'.':
      'There is no eligible standby for this zone right now.');
  }
  if(/\b(happened|breakdown|recovery|handoff|took over|take over|replaced|backup|chosen|picked|dispatched)\b/.test(text)){
    const recovery=recoveryStatus(s);
    if(recovery&&(!field||field.id===s.recovery?.field||s.pendingRecovery))return recovery;
    if(/\b(breakdown|recovery|handoff|took over|take over|replaced|happened)\b/.test(text))return 'No breakdown handoff has happened in this run. The Activity panel records the outage, saved row and replacement assignment when it happens.';
  }
  if(/\b(refuel|refueling|running low|low on fuel)\b/.test(text)){
    if(tractor?.failed)return tractor.name+' is offline with '+Math.floor(tractor.fuel)+' L remaining.';
    if(tractor&&!tractor.field)return tractor.name+' is on standby with '+Math.floor(tractor.fuel)+' L. Fuel needed depends on its next assignment.';
    const working=tractor?[tractor]:s.tractors.filter(t=>!t.failed&&t.field);
    if(!working.length)return 'No tractors are assigned. Fuel needs will depend on the work you assign.';
    const low=working.filter(t=>t.fuel-assignmentForecast(s,t,job(t.field)).fuel<s.reserve);
    if(low.length)return low.map(t=>t.name).join(', ')+' could drop below your '+s.reserve+' L reserve before finishing the current work.';
    return tractor?tractor.name+' is projected to finish with at least your '+s.reserve+' L reserve.':'All assigned tractors are projected to finish with at least your '+s.reserve+' L reserve.';
  }
  if(/\b(fuel|diesel|gas|liters|litres)\b/.test(text)){
    if(tractor)return tractor.name+' has '+Math.floor(tractor.fuel)+' L of fuel. Your reserve for new assignments is '+s.reserve+' L.';
    const sorted=[...s.tractors].sort((a,b)=>b.fuel-a.fuel);
    if(/\b(most|highest|least|lowest)\b/.test(text)){
      const t=/\b(least|lowest)\b/.test(text)?sorted.at(-1):sorted[0];
      return t.name+' has '+Math.floor(t.fuel)+' L, the '+(t===sorted[0]?'most':'least')+' in the fleet.';
    }
    return sorted.map(t=>t.name+' '+Math.floor(t.fuel)+' L').join(' · ')+'. Your reserve is '+s.reserve+' L.';
  }
  if(/\b(deadlines?|behind|overdue|on time|at risk)\b/.test(text)){
    if(field){
      const remaining=Math.max(0,s.deadlines[field.id]-s.min);
      const t=s.tractors.find(t=>!t.failed&&t.field===field.id);
      if(s.progress[field.id]>=field.rows)return field.name+' is already complete.';
      const timing=remaining?' is due in '+spokenMinutes(remaining)+'.':' is past its deadline.';
      if(!t)return field.name+timing+' It needs a tractor.';
      const predicted=assignmentForecast(s,t,field).minutes;
      return field.name+timing+' '+t.name+' needs '+spokenMinutes(predicted)+
        (predicted>remaining?' and is projected to finish late.':' and is projected to finish on time.');
    }
    return deadlineStatus(s);
  }
  if(field&&(/\b(assign|eligible|compatible|who can|who should|which tractor|backup|available|can .*handle)\b/.test(text)||tractor&&/\b(can|able|could)\b/.test(text))){
    if(s.progress[field.id]===field.rows)return field.name+' is already complete.';
    if(tractor){
      const result=assignmentForecast(s,tractor,field);
      if(!result.eligible)return tractor.name+' is '+(tractor.failed?'offline.':!tractor.tools.includes(field.task)?'not equipped for '+field.task.toLowerCase()+'.':'below the fuel needed to finish with the '+s.reserve+' L reserve.');
      return tractor.name+' has the right equipment and fuel for '+field.name+'. It would take '+spokenMinutes(result.minutes)+' and use '+rounded(result.fuel)+' L.'+
        (tractor.field&&tractor.field!==field.id?' It is currently assigned to '+job(tractor.field).name+'.':'');
    }
    const candidates=available(s,field);
    return candidates.length?'Available for '+field.name+': '+candidates.map(t=>t.name+' ('+spokenMinutes(t.f.minutes)+')').join(', ')+'.':
      'No standby tractor can finish '+field.name+' with its equipment and your current fuel reserve.';
  }
  if(field)return fieldStatus(s,field);
  if(tractor){
    if(/\b(equipment|implement|tools?|capable|can .*do)\b/.test(text))return tractor.name+' can do '+tractor.tools.map(t=>t.toLowerCase()).join(' and ')+'.';
    if(/\b(how long|when|eta|finish)\b/.test(text)&&tractor.field)return fieldStatus(s,job(tractor.field));
    return tractorStatus(s,tractor);
  }
  if(/\b(idle|standby|available|free)\b/.test(text)){
    const idle=s.tractors.filter(t=>!t.field&&!t.failed);
    return idle.length?'Available tractors: '+idle.map(t=>t.name+' ('+t.tools.map(x=>x.toLowerCase()).join(', ')+')').join(' · ')+'.':'No tractors are free right now.';
  }
  if(/\b(when|how long|eta)\b/.test(text)&&/\b(finish|done|complete|fleet|everything)\b/.test(text)){
    const remaining=fields.filter(f=>s.progress[f.id]<f.rows);
    if(!remaining.length)return 'All zones are complete.';
    const assignments=remaining.map(f=>({f,t:s.tractors.find(t=>!t.failed&&t.field===f.id)}));
    const unassigned=assignments.filter(a=>!a.t);
    if(unassigned.length)return 'The fleet finish time depends on assigning '+unassigned.map(a=>a.f.name).join(', ')+'.';
    const eta=Math.max(...assignments.map(({f,t})=>assignmentForecast(s,t,f).minutes));
    return 'The fleet is projected to finish in '+spokenMinutes(eta)+' of simulation time.'+(s.running?'':' The simulation is paused.');
  }
  if(/\b(next|recommend|prioriti[sz]e|what should i do)\b/.test(text)){
    const field=fields.filter(f=>s.progress[f.id]<f.rows&&!s.tractors.some(t=>t.field===f.id)).sort((a,b)=>s.deadlines[a.id]-s.deadlines[b.id])[0];
    if(!field)return deadlineStatus(s);
    const best=available(s,field)[0];
    return best?'Start with '+field.name+', the earliest unassigned deadline. '+best.name+' is the quickest eligible standby at '+spokenMinutes(best.f.minutes)+'.':
      'Start by checking '+field.name+'. It is unassigned, and no standby can finish within the fuel and equipment limits.';
  }
  if(/\b(fields?|zones?|rows?|jobs?|left|finish|progress|coverage|today|how far along)\b/.test(text)){
    const remaining=fields.filter(f=>s.progress[f.id]<f.rows);
    if(/\b(left|remaining|still|unfinished)\b/.test(text)){
      return remaining.length?remaining.map(f=>f.name+' has '+rounded(f.rows-s.progress[f.id])+' rows left').join(' · ')+'.':'All zones are complete.';
    }
    return fields.map(f=>f.name+' '+rounded(s.progress[f.id])+'/'+f.rows+' rows').join(' · ')+'.';
  }
  if(/\b(fleet|tractors?|status|running|working|overview)\b/.test(text))return s.tractors.map(t=>tractorStatus(s,t)).join('\n');
  return null;
}

export function farmContext(s) {
  return {simulated:true,running:s.running,reserve:s.reserve,
    tractors:s.tractors.map(t=>({...tractorTelemetry(s,t),equipment:t.tools})),
    zones:fields.map(f=>{
      const assigned=s.tractors.find(t=>!t.failed&&t.field===f.id)?.name;
      const complete=s.progress[f.id]>=f.rows;
      return {id:f.id,name:f.name,task:f.task,rows:f.rows,completedRows:rounded(s.progress[f.id]),
        status:complete?'complete':assigned?'assigned':'needs a tractor',assigned:assigned||null};
    }),
    handoff:recoveryStatus(s)};
}
