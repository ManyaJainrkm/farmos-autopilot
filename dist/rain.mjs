// Simulated rain drawn over the satellite map: slanted streaks plus small splashes on the ground.
export function startRain(canvas){
  const ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drops=[], splashes=[], on=false, frame=0, width=0, height=0, last=0;
  function size(){
    const ratio=Math.min(devicePixelRatio||1,2);
    width=canvas.clientWidth;height=canvas.clientHeight;
    canvas.width=width*ratio;canvas.height=height*ratio;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const count=Math.round(width*height/(reduced?9000:2600));
    drops=Array.from({length:count},()=>drop(true));
  }
  function drop(anywhere){
    const depth=Math.random();
    return {x:Math.random()*(width+200)-100,y:anywhere?Math.random()*height:-20-Math.random()*80,
      len:9+depth*16,speed:520+depth*560,alpha:.16+depth*.34,width:.6+depth*.9};
  }
  function draw(now){
    if(!on)return;
    const dt=Math.min(.05,(now-(last||now))/1000);last=now;
    ctx.clearRect(0,0,width,height);
    ctx.lineCap='round';
    for(const d of drops){
      d.y+=d.speed*dt;d.x-=d.speed*dt*.18;
      if(d.y>height){
        if(Math.random()<.35)splashes.push({x:d.x,y:height*(.25+Math.random()*.7),r:0,life:1});
        Object.assign(d,drop(false));
      }
      ctx.strokeStyle=`rgba(214,230,222,${d.alpha})`;ctx.lineWidth=d.width;
      ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.len*.18,d.y-d.len);ctx.stroke();
    }
    for(const s of splashes){
      s.r+=dt*14;s.life-=dt*2.6;
      ctx.strokeStyle=`rgba(220,236,228,${Math.max(0,s.life)*.45})`;ctx.lineWidth=.8;
      ctx.beginPath();ctx.ellipse(s.x,s.y,s.r,s.r*.4,0,0,Math.PI*2);ctx.stroke();
    }
    splashes=splashes.filter(s=>s.life>0).slice(-160);
    frame=requestAnimationFrame(draw);
  }
  addEventListener('resize',()=>{if(on)size();});
  return {set(value){
    if(value===on)return;
    on=value;canvas.classList.toggle('on',on);
    cancelAnimationFrame(frame);
    if(on){size();last=0;frame=requestAnimationFrame(draw);}
    else{ctx.clearRect(0,0,width,height);splashes=[];}
  }};
}
