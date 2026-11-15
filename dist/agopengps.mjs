// AgOpenWeb accepts checksummed NMEA GPS fixes and course/speed over UDP.
import {imagePoint} from './plot.mjs?v=satellite';
export function coordinates(x,y) {
  const uv=imagePoint({x,y});
  return {lat:32.45421-uv.y/465*.00578,lon:-111.252151696+uv.x/860*.010689892};
}
function nmea(body) {
  const sum=Array.from(body).reduce((a,b)=>a^b.charCodeAt(0),0);
  return '$'+body+'*'+sum.toString(16).toUpperCase().padStart(2,'0');
}
function decimalMinutes(value,digits) {
  const degrees=Math.floor(Math.abs(value));
  return String(degrees).padStart(digits,'0')+((Math.abs(value)-degrees)*60).toFixed(5).padStart(8,'0');
}
export function fixSentences(p,previous,at,seconds=1) {
  const time=at.toISOString().slice(11,22).replaceAll(':','');
  const x=(p.lon-previous.lon)*93900,y=(p.lat-previous.lat)*111100;
  const heading=((Math.atan2(x,y)*180/Math.PI+360)%360).toFixed(1);
  const speed=Math.hypot(x,y)*3.6/seconds;
  return [
    nmea(`GPGGA,${time},${decimalMinutes(p.lat,2)},N,${decimalMinutes(p.lon,3)},W,4,10,0.9,700.0,M,0.0,M,,`),
    nmea(`GPVTG,${heading},T,,M,${(speed/1.852).toFixed(2)},N,${speed.toFixed(2)},K,A`)
  ].join('\r\n')+'\r\n';
}
export function replay(points) {
  return points.map((p,i)=>fixSentences(p,points[i-1]||p,new Date(Date.UTC(2026,10,15,18,0,i)))).join('');
}
