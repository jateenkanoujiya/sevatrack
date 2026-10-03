import {AppError} from './errors';
export function distance(lat:number,lng:number,toLat:number,toLng:number){const r=Math.PI/180;const a=Math.sin((toLat-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(toLat*r)*Math.sin((toLng-lng)*r/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));}
export function geo(raw:any,event:any){if(!raw||raw.denied)return {status:'Faculty review required',denied:true,reason:typeof raw?.reason==='string'?raw.reason.slice(0,100):'Location unavailable',serverTime:new Date().toISOString()};const {lat,lng,accuracy}=raw;if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0)throw new AppError('Invalid GPS coordinates');const d=distance(lat,lng,event.lat,event.lng);return {lat,lng,accuracy,distance:d,inside:d<=event.radius,status:accuracy>Math.max(50,event.radius/2)?'Poor GPS accuracy':d>event.radius?'Location outside event area':'Location verified',clientTime:raw.clientTime||null,serverTime:new Date().toISOString()};}
export function progress(y1:number,y2:number,r1:number,r2:number){const round=(v:number)=>Math.round(v*100)/100;return {y1,y2,total:round(y1+y2),remaining:round(Math.max(0,r1-y1)+Math.max(0,r2-y2)),extra:round(Math.max(0,y1-r1)+Math.max(0,y2-r2)),complete:y1>=r1&&y2>=r2};}
export function validTimes(i:string|null,o:string|null){if(o&&!i)throw new AppError('A check-in is required before check-out');if(i&&!Number.isFinite(Date.parse(i)))throw new AppError('Invalid check-in time');if(o&&!Number.isFinite(Date.parse(o)))throw new AppError('Invalid check-out time');if(i&&o&&Date.parse(o)<Date.parse(i))throw new AppError('Check-out must be after check-in');}
export function csv(rows:any[]){return rows.map(r=>r.map((v:any)=>'"'+String(v??'').replace(/^[\s\t\r]*[=+@\-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}

// Only this gate authorizes attendance. Photo metadata still uses geo() separately.
export function attendanceGPS(raw:any,event:any,clock=Date.now()){
 if(!raw||raw.denied)throw new AppError('Location access is required. Enable GPS and location permission, then retry at the event.');
 const t=typeof raw.clientTime==='string'?Date.parse(raw.clientTime):NaN;
 if(!Number.isFinite(t)||clock-t>120000||t-clock>30000)throw new AppError('Your GPS reading is out of date. Capture your location again.');
 const loc=geo(raw,event);
 const limit=Math.min(50,event.radius/2);
 if(!('accuracy' in loc)||loc.accuracy<=0||loc.accuracy>limit)throw new AppError(`GPS accuracy is too low. Move to an open area and retry (required accuracy: ±${limit} m or better).`);
 if(!loc.inside)throw new AppError('You are outside the event area. Go to the event location and retry.');
 if(loc.distance+loc.accuracy>event.radius)throw new AppError('GPS cannot confirm you are fully inside the event area. Move farther inside and retry.');
 return {...loc,verified:true,verification:'EVENT_GEOFENCE_V1',eventLat:event.lat,eventLng:event.lng,radius:event.radius};
}
export function verifiedAttendanceGPS(value:any,event:any){
 try{const loc=typeof value==='string'?JSON.parse(value):value;
 const lat=loc?.eventLat??event.lat,lng=loc?.eventLng??event.lng,radius=loc?.radius??event.radius;
 return loc?.status==='Location verified'&&loc.inside===true&&Number.isFinite(loc.lat)&&Math.abs(loc.lat)<=90&&Number.isFinite(loc.lng)&&Math.abs(loc.lng)<=180&&Number.isFinite(loc.accuracy)&&loc.accuracy>0&&loc.accuracy<=Math.min(50,radius/2)&&distance(loc.lat,loc.lng,lat,lng)+loc.accuracy<=radius;
 }catch{return false}
}
