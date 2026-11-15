// Plot positions share the aerial image's 860 × 465 coordinate system.
export const imagePoint = ({x,y}) => ({x:37+.89*x,y:62+.69*y});

export function rowPoint(f,progress) {
  const row=Math.min(Math.floor(progress),f.rows-1);
  const fraction=progress>=f.rows?1:progress%1;
  const dx=(f.w-36)/f.rows;
  const turn=row<f.rows-1 ? Math.max(0,(fraction-.88)/.12) : 0;
  const along=row<f.rows-1 ? (fraction<=.5?fraction:Math.min(1,.5+(fraction-.5)*.5/.38)) : fraction;
  const vertical=row%2?1-along:along;
  return {x:f.x+18+(row+.5+turn)*dx,y:f.y+50+vertical*(f.h-59)};
}

export function transitRoute(from,to) {
  return [from,{x:438,y:from.y},{x:438,y:252},{x:to.x,y:252},to];
}
export function pointAlong(points,progress) {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,progress));
  for(let i=0;i<lengths.length;i++){
    if(remaining<=lengths[i] && lengths[i]>0){
      const a=points[i],b=points[i+1],fraction=remaining/lengths[i];
      return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
    }
    remaining-=lengths[i];
  }
  return points.at(-1);
}
