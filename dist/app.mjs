import {assign,fields,job,initial,tick,log,command} from './engine.mjs?v=operator';
import {coordinateFailure,publishTelemetry,recallLastCheckpoint} from './agents.mjs?v=operator';
import {answerFarmQuestion,farmContext,understand} from './assistant.mjs?v=operator';
import {coordinates,fixSentences} from './agopengps.mjs?v=satellite';
import {imagePoint,pointAlong,rowPoint,transitRoute} from './plot.mjs?v=satellite';

const paths={
 sprout:'<path d="M12 22v-9M5 3c6 0 7 3 7 10C6 13 3 9 3 3h2ZM19 4c-5 0-7 3-7 9 6 0 9-4 9-9h-2Z"/>',
 reset:'<path d="M3 12a9 9 0 1 1 2 6M3 12V5m0 7h7"/>',pin:'<path d="M20 10c0 5-8 10-8 10s-8-5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 zap:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
 sat:'<path d="m9 7 8 8m-11-4 5-5 7 7-5 5zm11-7 3 3-3 3-3-3zM6 15l3 3-3 3-3-3zM14 20a5 5 0 0 0 6-6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',spark:'<path d="M12 2c1.5 6 3.5 8 10 10-6.5 2-8.5 4-10 10-2-6-4-8-10-10 6-2 8-4 10-10Z"/>',
 tractor:'<circle cx="7" cy="16" r="4"/><circle cx="19" cy="17" r="2.5"/><path d="M7 12V5h7l2 8h4v1M11 17h5M6 5h9M16 9h3v4"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1m-7 8v4m-3 0h6"/>',
 arrowup:'<path d="M12 20V4m-6 6 6-6 6 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
 x:'<path d="m6 6 12 12M6 18 18 6"/>',play:'<path d="m8 5 12 7-12 7z"/>',pause:'<path d="M9 5v14m6-14v14"/>',
 shield:'<path d="m12 2 8 4v6c0 4-4 8-8 10-4-2-8-6-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
 trend:'<path d="M3 17l6-6 4 4 8-8m-6 0h6v6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const $ = id => document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach(e=>e.insertAdjacentHTML('afterbegin',icon(e.dataset.icon)));
function preferences() {
  try {return JSON.parse(localStorage.getItem('farmos-preferences'))||{};}catch{return {};}
}
const tickMs=170;
const simMinutesPerSecond=1/9;
let previousSubject={}, questionPending=false, questionAbort, assistantProvider='farm';
let state, lastTelemetry=0, displayedEvent, focusId='01', voiceDraft=false;
let viewerReady=false, relayBusy=false, previousFix, modelEnabled=false, viewerUrl;
let lastTick=performance.now();
let followedId=null, guidanceMode=false, tilted=true;
const statusOf=t=>t.failed?'Offline':t.field?(t.eta>0?'En route':'Working'):t.finishedField?'Complete':'Standby';
function standbyPoint(t) {
  const f=job(t.at);
  if(t.finishedField)return rowPoint(job(t.finishedField),job(t.finishedField).rows);
  if(t.id==='05') return {x:68,y:205};
  return {x:f.x+f.w-31,y:f.y+f.h-26};
}
function tractorRoute(t) {
  return transitRoute(standbyPoint(t),rowPoint(job(t.field),state.progress[t.field]));
}
function tractorPoint(t) {
  if(t.stopped)return rowPoint(job(t.stopped.field),t.stopped.progress);
  if(!t.field || t.failed)return standbyPoint(t);
  if(t.eta>0)return pointAlong(tractorRoute(t),1-t.eta/t.trip);
  return rowPoint(job(t.field),state.progress[t.field]);
}
function chooseCamera(id){
  followedId=id;
  render();
}
function chooseMap(useGuidance){
  guidanceMode=useGuidance;
  $('guidance-tab').setAttribute('aria-pressed',useGuidance);
  $('satellite-tab').setAttribute('aria-pressed',!useGuidance);
  $('guidance-view').hidden=!useGuidance;
  if(useGuidance && viewerUrl)$('guidance').src=viewerUrl;
  if(!useGuidance)$('guidance').removeAttribute('src');
  $('guidance-footer').hidden=!useGuidance;
  $('satellite-view').hidden=useGuidance;
  $('camera-controls').hidden=useGuidance;
  $('map-title').textContent=useGuidance?'AgOpenWeb guidance':'Sonoran demo plot';
  $('viewer-caption').textContent=useGuidance?'Official guidance · one tractor feed at a time':'One plot · four work zones · five tractors';
  render();
}
function createCameraControls(){
  const buttonList=state.tractors.map(t=>`<button class="tractor-card" id="camera-${t.id}" data-follow="${t.id}" aria-pressed="false"><span class="camera-preview"><i></i></span><span class="camera-info"><b>${t.name}</b><small></small></span></button>`);
  $('tractor-views').innerHTML=buttonList.join('');
  $('tractor-markers').innerHTML=state.tractors.map(t=>`<button class="tractor-marker" id="marker-${t.id}" data-follow="${t.id}" aria-label="Follow ${t.name}">${icon('tractor')}<span>${t.name}</span></button>`).join('');
  document.querySelectorAll('[data-follow]').forEach(button=>button.onclick=()=>chooseCamera(button.dataset.follow));
}
function renderSatellite(recovery,backup) {
  const coords=new Map();
  for(const t of state.tractors) {
    const uv=imagePoint(tractorPoint(t));
    const x=uv.x/860*100,y=uv.y/465*100;
    coords.set(t.id,{x,y});
    const status=statusOf(t);
    const marker=$('marker-'+t.id),card=$('camera-'+t.id);
    marker.style.left=x+'%';marker.style.top=y+'%';
    const tone=status==='Offline'?'offline':t.id===recovery?.backup&&t.field?'backup':status==='Working'?'working':'standby';
    marker.dataset.tone=tone;card.dataset.tone=tone;
      card.querySelector('small').textContent=status;
    card.setAttribute('aria-pressed',t.id===followedId);
    marker.setAttribute('aria-pressed',t.id===followedId);
  }
  const follow=followedId && coords.get(followedId);
  const plane=$('plot-plane');
  plane.style.setProperty('--tilt',tilted?'30deg':'0deg');
  plane.style.setProperty('--map-zoom',follow?'2.05':tilted?'1.10':'1');
  plane.style.setProperty('--pan-x',follow?(50-follow.x)+'%':'0%');
  plane.style.setProperty('--pan-y',follow?(50-follow.y)+'%':'0%');
  $('camera-fleet').setAttribute('aria-pressed',!follow);
  $('camera-tilt').setAttribute('aria-pressed',tilted);
  $('camera-tilt').textContent=tilted?'3D':'2D';
  const selected=state.tractors.find(t=>t.id===followedId);
  $('camera-caption').textContent=selected?'Following '+selected.name+' · '+statusOf(selected):'Select a tractor to follow it';
  $('plot-zones').innerHTML=fields.map(f=>{
    const done=state.progress[f.id];
    const step=(f.w-36)/f.rows;
    const rows=Array.from({length:f.rows},(_,i)=>{
      const x=f.x+18+(i+.5)*step,y=f.y+50,end=f.y+f.h-9;
      const progress=Math.min(1,Math.max(0,done-i));
      const start=i%2?end:y,finish=start+(i%2?-1:1)*(end-y)*progress;
      return `<path d="M${x} ${y}V${end}" class="zone-row"/>${progress?`<path d="M${x} ${start}V${finish}" class="zone-worked"/>`:''}`;
    }).join('');
    return `<g class="${recovery?.field===f.id?'zone-hot':''}"><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="5" class="zone-box"/>${rows}<text x="${f.x+12}" y="${f.y+21}" class="zone-name">${f.name}</text><text x="${f.x+12}" y="${f.y+38}" class="zone-progress">${f.task} · ${Math.floor(done)}/${f.rows} rows</text></g>`;
  }).join('');
  const route=backup?.field&&backup.eta>0 ? tractorRoute(backup) : [];
  $('recovery-route').setAttribute('d',route.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' '));
  const checkpoint=$('checkpoint');
  checkpoint.setAttribute('visibility',recovery?.field?'visible':'hidden');
  if(recovery?.field){
    const point=rowPoint(job(recovery.field),recovery.point);
    checkpoint.setAttribute('cx',point.x);checkpoint.setAttribute('cy',point.y);
  }
}
function map() {
  const r=state.recovery;
  const backup=r?.backup&&state.tractors.find(t=>t.id===r.backup);
  renderSatellite(r,backup);
  const handoff=$('map-handoff');
  handoff.hidden=!r&&!state.pendingRecovery;
  if(state.pendingRecovery)handoff.textContent='Tractor offline · finding a backup';
  else if(r) {
    const phase=backup?.field ? (backup.eta?'en route':'working') : 'coverage complete';
    const eta=backup?.field && backup.eta>0 ? ' · '+Math.ceil(backup.eta/simMinutesPerSecond)+'s to field' : '';
    const message=backup ? backup.name+' '+phase+eta : 'Recovery queued';
    if(handoff.textContent!==message)handoff.textContent=message;
  }
  $('map-status').textContent=state.running?'LIVE SIM':isComplete()?'SIM COMPLETE':state.min===0?'SIM READY':'SIM PAUSED';
}
const dotText={fail:'!',agent:'↗',memory:'M',dispatch:'↗',tractor:'↗',telemetry:'•',ok:'•'};
function renderActivity(force=false){
  const event=state.events[0];
  if(!force&&displayedEvent===event)return;
  displayedEvent=event;
  if(!force&&event&&['fail','agent','memory','dispatch'].includes(event.kind)){
    $('activity-announcement').textContent=event.title+'. '+event.info;
  }
  const filter=$('event-filter').value;
  const feed=$('events');
  const previousHeight=feed.scrollHeight,previousScroll=feed.scrollTop;
  const list=state.events.filter(e=>!filter||
    (filter==='agents'?['agent','memory','dispatch'].includes(e.kind):e.source===filter));
  const nodes=list.map(e=>{
    const row=document.createElement('article');row.className='feed-event '+e.kind;
    const sig=document.createElement('span');sig.className='feed-dot';sig.textContent=dotText[e.kind]||'•';sig.setAttribute('aria-hidden','true');
    const body=document.createElement('div'),title=document.createElement('b'),info=document.createElement('p');
    title.textContent=e.title;info.textContent=e.info;body.append(title,info);
    const time=document.createElement('time');time.textContent='+'+Math.round(e.min/simMinutesPerSecond)+'s';
    row.append(sig,body,time);return row;
  });
  if(!nodes.length){const empty=document.createElement('p');empty.className='feed-empty';empty.textContent='No activity for this view yet.';nodes.push(empty);}
  feed.replaceChildren(...nodes);
  if(previousScroll>15&&!force)feed.scrollTop=previousScroll+feed.scrollHeight-previousHeight;
}
async function explainDecision(current,r){
  const start=performance.now();
  const name=id=>current.tractors.find(t=>t.id===id)?.name||'None';
  try{
    const response=await fetch('/demo/explain',{
      method:'POST',signal:AbortSignal.timeout(5500),
      body:JSON.stringify({field:r.field?job(r.field).name:'None',failed:name(r.failed),backup:name(r.backup),
        resumeRow:r.field?Math.floor(r.point)+1:0,percentThroughRow:r.field?Math.round((r.point%1)*100):0})
    });
    if(!response.ok)throw new Error('Model unavailable');
    const {summary}=await response.json();
    if(state===current)log(state,'agent','Model Agent · '+Math.round(performance.now()-start)+' ms',summary);
  }catch{
    if(state===current)log(state,'agent','Model Agent · summary unavailable','The tractor handoff already ran independently.');
  }
  if(state===current)renderActivity();
}
function isComplete(){return fields.every(f=>state.progress[f.id]===f.rows);}
function render(){
  const nextFocus=followedId||state.recovery?.backup||'01';
  if(nextFocus!==focusId)previousFix=undefined;
  focusId=nextFocus;
  map();
  renderActivity();
  const active=state.tractors.some(t=>t.field&&!t.failed);
  $('play').disabled=isComplete()||(!active&&!state.running);
  $('play').innerHTML=icon(state.running?'pause':'play')+(state.running?'Pause':'Run simulation');
  $('fail').disabled=Boolean(state.pendingRecovery||!state.tractors.some(t=>t.field&&!t.failed));
}
function reset(blank=false){
  lastTick=performance.now();
  state=initial();
  state.running=false;
  $('activity-announcement').textContent='';
  $('event-filter').value='';
  $('events').scrollTop=0;
  const saved=preferences().reserve;
  if(Number.isInteger(saved)&&saved>=0&&saved<=50)state.reserve=saved;
  if(blank){
    state.manualPlan=true;
    for(const f of fields)state.progress[f.id]=0;
    for(const t of state.tractors)t.field=null;
    state.events=[];
    log(state,'ok','Assignment plan ready','Choose tractors and work zones in Ask FarmOS, then run the simulation.');
  }
  $('reply').textContent='';
  questionAbort?.abort();
  questionPending=false;
  $('ask').querySelector('.send').disabled=false;
  $('conversation').replaceChildren();
  $('conversation').hidden=true;
  previousSubject={};
  voiceDraft=false;
  previousFix=undefined;
  lastTelemetry=0;focusId='01';followedId=null;
  createCameraControls();
  publishTelemetry(state);
  render();
}
async function breakTractor(id){
  const current=state;
  if(!current.tractors.some(t=>t.id===id&&t.field&&!t.failed))return 'That tractor has no active assignment to interrupt.';
  if(current.pendingRecovery)return 'A tractor handoff is already in progress.';
  followedId=null;
  lastTick=performance.now();
  current.running=true;
  $('event-filter').value='';
  $('events').scrollTop=0;
  const result=await coordinateFailure(current,id,render,()=>state===current);
  if(result&&modelEnabled&&state===current)explainDecision(current,result);
  return result ? 'Breakdown simulated. Follow the handoff in Activity.' : '';
}
function spokenReply(text){
  if(text&&voiceDraft&&window.speechSynthesis){
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  voiceDraft=false;
}
function showReply(text){$('reply').textContent=text;}
function addChat(role,text){
  const thread=$('conversation');
  const message=document.createElement('div');
  message.className='chat-message '+role;
  const label=document.createElement('b');label.textContent=role==='question'?'You':'FarmOS';
  const content=document.createElement('p');content.textContent=text;
  message.append(label,content);thread.append(message);
  while(thread.childElementCount>12)thread.firstElementChild.remove();
  thread.hidden=false;
  thread.scrollTop=thread.scrollHeight;
}
function pickBreakTarget(){
  return state.tractors.find(t=>t.field&&!t.failed&&(t.id===followedId||(!followedId&&t.id==='01')))||
    state.tractors.find(t=>t.field&&!t.failed&&!t.eta)||state.tractors.find(t=>t.field&&!t.failed);
}
async function applyChange(change){
  if(change.type==='assign'){
    const tractor=state.tractors.find(t=>t.id===change.tractor);
    const previous=tractor?.field;
    const reply=assign(state,change.tractor,change.field);
    if(change.start&&tractor&&tractor.field===change.field&&previous!==tractor.field){
      lastTick=performance.now();
      state.running=true;
      return reply+' '+tractor.name+' is en route.';
    }
    return reply;
  }
  if(change.type==='fail'){
    const target=change.tractor||pickBreakTarget()?.id;
    if(!target)return 'No tractor is working right now. Assign one before testing a breakdown.';
    showReply('Checking the fleet and saving the checkpoint…');
    return breakTractor(target);
  }
  if(change.type==='reserveHelp')return 'Give the reserve in liters, from 0 to 50. For example, “Set the fuel reserve to 20 liters.”';
  if(change.text.startsWith('Remember fuel reserve')){
    if(state.pendingRecovery)return 'The handoff is using the current fuel reserve. Try again once a backup is assigned.';
    if(Number(change.text.match(/(\d+)/)?.[1])>50)return 'The reserve must be 0–50 L.';
  }
  const result=command(state,change.text);
  if(state.running&&(isComplete()||!state.tractors.some(t=>t.field&&!t.failed)&&!state.pendingRecovery)){
    state.running=false;
    if(result==='Simulation resumed.')return 'Assign a tractor to an unfinished zone first.';
  }
  return result;
}
async function modelAnswer(question,current,signal,assignment){
  if(!['127.0.0.1','localhost'].includes(location.hostname))return null;
  try{
    const result=await fetch('/demo/ask',{method:'POST',signal,
      body:JSON.stringify({question,farm:farmContext(current),assignment})});
    if(result.ok)return await result.json();
  }catch{}
  return null;
}
async function loadAssistantProvider(){
  if(!['127.0.0.1','localhost'].includes(location.hostname))return;
  try{
    const response=await fetch('/demo/assistant',{signal:AbortSignal.timeout(1500)});
    if(!response.ok)return;
    const {provider,model}=await response.json();
    assistantProvider=provider;
    if(provider==='openai')$('ask-caption').textContent='OpenAI model configured · '+model;
    else if(provider==='local')$('ask-caption').textContent='Fleet commands and local AI';
  }catch{}
}
async function runAsk(input){
  const value=input.trim();
  if(!value)return;
  if(questionPending){showReply('FarmOS is answering the previous question.');return;}
  const current=state;
  const intent=understand(value,current,previousSubject);
  if(intent.tractor||intent.field)previousSubject={tractor:intent.tractor?.id,field:intent.field?.id};
  questionPending=true;
  questionAbort=new AbortController();
  const controller=questionAbort;
  const timeout=setTimeout(()=>controller.abort(),10500);
  $('ask').querySelector('.send').disabled=true;
  showReply('');
  addChat('question',value);
  let answer;
  try{
    if(intent.change){
      let change=intent.change;
      if(assistantProvider==='openai'&&change.type==='assign'&&change.tractor&&change.field){
        showReply('Checking the assignment with OpenAI…');
        const target={tractor:change.tractor,field:change.field};
        const proposal=await modelAnswer(value,current,controller.signal,target);
        if(state!==current)return;
        if(proposal?.assignment?.tractor===target.tractor&&proposal.assignment.field===target.field){
          change={...change,...target};
          log(current,'agent','Ask FarmOS · OpenAI request received','Applying the operator’s requested assignment through fleet checks.',target.tractor);
        }
      }
      answer=await applyChange(change);
    }else answer=answerFarmQuestion(intent,current,recallLastCheckpoint());
    if(!answer&&state===current){
      showReply('Checking the farm data…');
      const result=await modelAnswer(value,current,controller.signal);
      if(typeof result?.answer==='string'&&result.answer.trim())answer=result.answer;
    }
    if(state!==current)return;
    if(!answer)answer='I couldn’t answer that from this farm run. I can check row progress, finish estimates, fuel, tractor availability, and the last handoff. Try “When will North Field finish?”';
    showReply('');
    addChat('answer',answer);
    spokenReply(answer);
    render();
  }catch{
    if(state===current){
      showReply('');
      addChat('answer','I couldn’t finish that request. The assignment form and live Activity panel are available.');
    }
  }finally{
    clearTimeout(timeout);
    if(questionAbort===controller){
      questionPending=false;
      $('ask').querySelector('.send').disabled=false;
    }
  }
}
$('satellite-tab').onclick=()=>chooseMap(false);
$('guidance-tab').onclick=()=>chooseMap(true);
$('camera-fleet').onclick=()=>chooseCamera(null);
$('camera-tilt').onclick=()=>{tilted=!tilted;render();};
$('reset').onclick=()=>reset();
$('play').onclick=()=>{lastTick=performance.now();state.running=!state.running;render();};
$('fail').onclick=()=>{
  const tractor=pickBreakTarget();
  if(tractor)breakTractor(tractor.id);
};
$('event-filter').onchange=()=>renderActivity(true);
$('assign-form').onsubmit=e=>{
  e.preventDefault();
  showReply(assign(state,$('assign-tractor').value,$('assign-field').value));
  render();
};
$('empty-plan').onclick=()=>{
  reset(true);
  showReply('Blank plan ready. Assign tractors to zones, then run the simulation.');
};
for(const [id,body,title] of [['activity-toggle','activity-body','activity'],['ask-toggle','ask-body','Ask FarmOS']]){
  $(id).onclick=()=>{
    const target=$(body);target.hidden=!target.hidden;
    $(id).textContent=target.hidden?'+':'−';
    $(id).setAttribute('aria-expanded',!target.hidden);
    $(id).setAttribute('aria-label',(target.hidden?'Expand ':'Collapse ')+title);
  };
}
$('ask').onsubmit=e=>{
  e.preventDefault();
  if(questionPending)return;
  const input=$('command').value;
  $('command').value='';
  runAsk(input);
};
document.querySelectorAll('[data-example]').forEach(button=>button.onclick=()=>runAsk(button.dataset.example));
$('mic').onclick=()=>{
  const Voice=window.SpeechRecognition||window.webkitSpeechRecognition;
  const status=$('reply');
  if(!Voice){showReply('Voice input is unavailable here. Type your request or open FarmOS in Chrome.');return;}
  if($('mic').classList.contains('listening'))return;
  const voice=new Voice();
  voice.lang='en-US';
  voice.onstart=()=>{$('mic').classList.add('listening');showReply('Listening…');};
  voice.onresult=e=>{
    $('command').value=e.results[0][0].transcript;
    voiceDraft=true;
    showReply('Review your transcript and press Send.');
    $('command').focus();
  };
  voice.onerror=()=>showReply('Voice input could not transcribe. Check microphone access or type your request.');
  voice.onend=()=>{$('mic').classList.remove('listening');if(status.textContent==='Listening…')showReply('No speech detected.');};
  try{voice.start();}catch{showReply('Voice input could not start. You can type your request.');}
};
async function connectGuidance(){
  if(!['127.0.0.1','localhost'].includes(location.hostname)){
    $('relay-status').textContent='Local relay required';
    return;
  }
  try{
    const response=await fetch('/demo/agopenweb');
    if(!response.ok)throw new Error('AgOpenWeb unavailable');
    const {viewer,model}=await response.json();
    modelEnabled=model;

    viewerUrl=viewer;
    if(guidanceMode)$('guidance').src=viewer;
    $('guidance').hidden=false;
    $('viewer-setup').hidden=true;
    $('viewer-link').hidden=false;
    viewerReady=true;
    await relayPosition();
  }catch{
    $('relay-status').textContent='Waiting for the local AgOpenWeb host';
    setTimeout(connectGuidance,3000);
  }
}
async function relayPosition(){
  if(!viewerReady||relayBusy)return;
  relayBusy=true;
  const tractor=state.tractors.find(t=>t.id===focusId);
  const {x,y}=tractorPoint(tractor);
  const fix=coordinates(x,y);
  const now=new Date();
  const prior=previousFix?.id===tractor.id ? previousFix : {fix,at:now};
  const elapsed=Math.max((now-prior.at)/1000,.1);
  try{
    const response=await fetch('/demo/position',{
      method:'POST',body:fixSentences(fix,prior.fix,now,elapsed)
    });
    if(!response.ok)throw new Error('Relay unavailable');
    previousFix={id:tractor.id,fix,at:now};
    const status='Sending simulated GPS · '+tractor.name;
    if($('relay-status').textContent!==status)$('relay-status').textContent=status;
  }catch{
    $('relay-status').textContent='Local GPS relay unavailable';
  }finally{
    relayBusy=false;
  }
}
const setup=initial();
$('assign-tractor').replaceChildren(...setup.tractors.map(t=>new Option(t.name+' · '+t.tools.join(', '),t.id)));
$('assign-field').replaceChildren(...fields.map(f=>new Option(f.name+' · '+f.task,f.id)));
$('event-filter').append(...setup.tractors.map(t=>new Option(t.name,t.id)));
reset();
loadAssistantProvider();
connectGuidance();
setInterval(relayPosition,250);
setInterval(()=>{
  const now=performance.now();
  const elapsedSeconds=(now-lastTick)/1000;
  lastTick=now;
  if(!state.running)return;
  tick(state,elapsedSeconds*simMinutesPerSecond);
  if(state.min-lastTelemetry>=1.15||!state.running){lastTelemetry=state.min;publishTelemetry(state);}
  render();
},tickMs);
