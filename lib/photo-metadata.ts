import {AppError} from './errors';
import {geo,distance} from './domain';
export function photoMetadata(b:any,event:any){
 const source=b.source||'live';
 if(!['live','geotag-app'].includes(source))throw new AppError('Choose a valid photo source.');
 const submission=geo(b.location,event);
 if(source==='live')return {...submission,source};
 const c=b.capture;
 if(!c||typeof c.time!=='string'||!Number.isFinite(Date.parse(c.time))||Date.parse(c.time)>Date.now()+300000||typeof c.app!=='string'||!c.app.trim()||c.app.length>100)throw new AppError('Enter the app name and valid capture time shown on your geotag photo.');
 const lat=Number(c.lat),lng=Number(c.lng);
 if(c.lat===null||c.lng===null||c.lat===undefined||c.lng===undefined||typeof c.lat==='boolean'||typeof c.lng==='boolean'||String(c.lat).trim()===''||String(c.lng).trim()===''||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)throw new AppError('Enter the latitude and longitude shown on the photo.');
 return {...submission,source,declaredCapture:{lat,lng,time:new Date(c.time).toISOString(),app:c.app.trim(),distance:distance(lat,lng,event.lat,event.lng),verified:false}};
}
