'use client';
import {useEffect,useRef,useState} from 'react';
import {attendanceGPS,distance} from '@/lib/domain';
let library:Promise<any>|null=null;
function loadMap(){
 if(library)return library;
 library=new Promise((resolve,reject)=>{
  const css=document.createElement('link'),script=document.createElement('script');
  css.rel='stylesheet';css.href='/vendor/leaflet/leaflet.css';
  script.src='/vendor/leaflet/leaflet.js';script.async=true;
  let cssReady=false,jsReady=false;
  const finish=()=>{if(cssReady&&jsReady){clearTimeout(timer);resolve((window as any).L)}};
  const fail=()=>{clearTimeout(timer);css.remove();script.remove();library=null;reject(new Error('The map could not load. Please retry.'))};
  const timer=setTimeout(fail,15000);
  css.onload=()=>{cssReady=true;finish()};script.onload=()=>{jsReady=true;finish()};css.onerror=script.onerror=fail;
  document.head.append(css,script);
 });return library;
}
export function GPSMap({eventId,kind,request,onConfirm,busy}:any){
 const [event,setEvent]=useState<any>(null),[loc,setLoc]=useState<any>(null),[gpsError,setGPSError]=useState(''),[eventError,setEventError]=useState(''),[mapError,setMapError]=useState(''),[tilesError,setTilesError]=useState(false),[attempt,setAttempt]=useState(0),[gpsAttempt,setGPSAttempt]=useState(0),[ready,setReady]=useState(false),[clock,setClock]=useState(Date.now()),[sending,setSending]=useState(false);
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null);
 useEffect(()=>{let live=true;setEventError('');request('event-detail?id='+encodeURIComponent(eventId)).then((r:any)=>{if(live)setEvent(r.event)}).catch((e:any)=>{if(live)setEventError(e.message)});return()=>{live=false}},[eventId,request,attempt]);
 useEffect(()=>{if(!event)return;let live=true;setGPSError('');setLoc(null);
  if(!navigator.geolocation){setGPSError('GPS is unavailable on this device. Use a phone or another GPS-enabled device.');return;}
  const watch=navigator.geolocation.watchPosition(p=>{if(!live)return;setGPSError('');setClock(Date.now());setLoc({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,clientTime:new Date(p.timestamp).toISOString()})},e=>{if(!live)return;setLoc(null);setGPSError(e.code===1?'Location permission denied. Allow location in your browser settings, then retry.':e.code===2?'GPS is unavailable. Enable location services and move to an open area.':'GPS timed out. Move to an open area and retry.')},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  const timer=setInterval(()=>setClock(Date.now()),5000);
  return()=>{live=false;navigator.geolocation.clearWatch(watch);clearInterval(timer)};
 },[event?.id,gpsAttempt]);
 useEffect(()=>{if(!event||!container.current)return;let live=true,observer:ResizeObserver|undefined;setReady(false);setMapError('');setTilesError(false);
  loadMap().then(L=>{if(!live||!container.current)return;
   const map=L.map(container.current,{scrollWheelZoom:false}).setView([event.lat,event.lng],17);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(live)setTilesError(true)}).addTo(map);
   const boundary=L.circle([event.lat,event.lng],{radius:event.radius,color:'#16835e',weight:3,dashArray:'8 6',fillOpacity:.10}).addTo(map);
   L.circleMarker([event.lat,event.lng],{radius:6,color:'#16352e',fillColor:'#ffffff',fillOpacity:1,weight:3}).bindTooltip('Event centre').addTo(map);
   map.fitBounds(boundary.getBounds(),{padding:[25,25],maxZoom:18});
   mapRef.current={L,map,boundary,user:L.featureGroup().addTo(map),fitted:false};
   observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(container.current);setReady(true);
  }).catch(e=>{if(live)setMapError(e.message)});
  return()=>{live=false;observer?.disconnect();mapRef.current?.map.remove();mapRef.current=null};
 },[event?.id,event?.lat,event?.lng,event?.radius,attempt]);
 useEffect(()=>{const state=mapRef.current;if(!ready||!state)return;const {L,map,user,boundary}=state;user.clearLayers();if(!loc){state.fitted=false;return;}
  L.circle([loc.lat,loc.lng],{radius:loc.accuracy,color:'#2563eb',weight:1,fillOpacity:.12}).addTo(user);
  L.circleMarker([loc.lat,loc.lng],{radius:8,color:'#ffffff',weight:3,fillColor:'#2563eb',fillOpacity:1}).bindTooltip('Your GPS location').addTo(user);
  if(!state.fitted){map.fitBounds(boundary.getBounds().extend(user.getBounds()),{padding:[30,30],maxZoom:18});state.fitted=true}
 },[loc,ready]);
 let allowed=false,status=gpsError||(loc?'Checking location…':'Finding your GPS location…');
 if(event&&loc&&!gpsError){try{attendanceGPS(loc,event,clock);allowed=true;status='Inside event area · GPS ready'}catch(e:any){status=e.message}}
 const fit=()=>{const s=mapRef.current;if(s)s.map.fitBounds(s.user.getLayers().length?s.boundary.getBounds().extend(s.user.getBounds()):s.boundary.getBounds(),{padding:[30,30],maxZoom:18})};
 const submit=async()=>{if(!allowed||sending||busy)return;setSending(true);try{
  // Confirm the same fresh live reading shown on the map; the API independently validates it.
  attendanceGPS(loc,event);await onConfirm(loc);
 }catch(e:any){setGPSError(e.message)}finally{setSending(false)}};
 return <section className="form-stack gps-workspace" aria-label="Map-based GPS attendance">
  {eventError?<div role="alert" className="info-strip">{eventError}<button className="btn" onClick={()=>setAttempt(v=>v+1)}>Retry event</button></div>:<><strong>{event?.title||'Loading event location…'}</strong><p className="help-note">The green boundary is the allowed event area. The blue dot is your device location; its circle shows GPS accuracy. Panning the map does not change your GPS.</p></>}
  <div ref={container} className="attendance-map" role="region" aria-label="Event boundary and your live GPS position"/>
  {!ready&&!mapError&&<p role="status">Loading map…</p>}
  {(mapError||tilesError)&&<div className="info-strip" role="status">{mapError||'Street tiles are unavailable. GPS coordinates and geofence checks still work.'}<button className="btn small" onClick={()=>setAttempt(v=>v+1)}>Retry map</button></div>}
  <div className="gps-legend"><span>◯ Event boundary</span><span>● Your GPS + accuracy</span></div>
  {event&&<><div className={'info-strip '+(allowed?'gps-ready':'')} role="status" aria-live="polite"><strong>{status}</strong></div><div className="detail-grid"><div className="detail-item"><span>Distance from event</span><strong>{loc?distance(loc.lat,loc.lng,event.lat,event.lng)+' m':'Waiting for GPS'}</strong></div><div className="detail-item"><span>Allowed radius</span><strong>{event.radius} m</strong></div><div className="detail-item"><span>GPS accuracy</span><strong>{loc?'±'+Math.round(loc.accuracy)+' m':'Unavailable'}</strong></div><div className="detail-item"><span>Your coordinates</span><strong>{loc?loc.lat.toFixed(5)+', '+loc.lng.toFixed(5):'Unavailable'}</strong></div></div></>}
  <div className="flex-row wrap"><button className="btn" type="button" disabled={sending||busy||!event} onClick={()=>setGPSAttempt(v=>v+1)}>Refresh GPS</button><button className="btn" type="button" disabled={!ready} onClick={fit}>Show event &amp; me</button></div>
  <button className="btn primary" type="button" disabled={!allowed||sending||busy||!!eventError} onClick={submit}>{sending||busy?'Verifying GPS…':kind==='in'?'Confirm GPS check-in':'Confirm GPS check-out'}</button>
  <p className="help-note">The server rechecks GPS when you confirm. Attendance and hours still require photo evidence and admin approval. Map tiles are supplied by OpenStreetMap; loading them shares the viewed map area and your IP with that provider.</p>
 </section>
}
