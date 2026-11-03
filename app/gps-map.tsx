'use client';
import {useEffect,useRef,useState} from 'react';
import {MapPin,LocateFixed,CheckCircle2,ShieldCheck,Navigation,RefreshCw,AlertCircle,ChevronRight} from 'lucide-react';
import {attendanceGPS,distance} from '@/lib/domain';
let library:Promise<any>|null=null;
export function loadMap(){
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
 const [tracking,setTracking]=useState(false);
 const container=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null);
 useEffect(()=>{let live=true;setEventError('');request('event-detail?id='+encodeURIComponent(eventId)).then((r:any)=>{if(live)setEvent(r.event)}).catch((e:any)=>{if(live)setEventError(e.message)});return()=>{live=false}},[eventId,request,attempt]);
 useEffect(()=>{if(!event||!tracking)return;let live=true;setGPSError('');setLoc(null);
  if(!navigator.geolocation){setGPSError('GPS is unavailable on this device. Use a phone or another GPS-enabled device.');return;}
  const watch=navigator.geolocation.watchPosition(p=>{if(!live)return;setGPSError('');setClock(Date.now());setLoc({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,clientTime:new Date(p.timestamp).toISOString()})},e=>{if(!live)return;setLoc(null);setGPSError(e.code===1?'Location permission denied. Allow location in your browser settings, then retry.':e.code===2?'GPS is unavailable. Enable location services and move to an open area.':'GPS timed out. Move to an open area and retry.')},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  const timer=setInterval(()=>setClock(Date.now()),5000);
  return()=>{live=false;navigator.geolocation.clearWatch(watch);clearInterval(timer)};
 },[event?.id,gpsAttempt,tracking]);
 useEffect(()=>{if(!event||!container.current)return;let live=true,observer:ResizeObserver|undefined;setReady(false);setMapError('');setTilesError(false);
  loadMap().then(L=>{if(!live||!container.current)return;
   const map=L.map(container.current,{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([event.lat,event.lng],17);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(live)setTilesError(true)}).addTo(map);
   const boundary=L.circle([event.lat,event.lng],{radius:event.radius,color:'#16835e',weight:3,dashArray:'8 6',fillOpacity:.10}).addTo(map);
   L.circleMarker([event.lat,event.lng],{radius:6,color:'#16352e',fillColor:'#ffffff',fillOpacity:1,weight:3}).bindTooltip('Event centre').addTo(map);
   map.fitBounds(boundary.getBounds(),{padding:[25,25],maxZoom:18,animate:false});
   mapRef.current={L,map,boundary,user:L.featureGroup().addTo(map),fitted:false};
   observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(container.current);setReady(true);
  }).catch(e=>{if(live)setMapError(e.message)});
  return()=>{live=false;observer?.disconnect();mapRef.current?.map.remove();mapRef.current=null};
 },[event?.id,event?.lat,event?.lng,event?.radius,attempt]);
 useEffect(()=>{const state=mapRef.current;if(!ready||!state)return;const {L,map,user,boundary}=state;user.clearLayers();if(!loc){state.fitted=false;return;}
  L.circle([loc.lat,loc.lng],{radius:loc.accuracy,color:'#2563eb',weight:1,fillOpacity:.12}).addTo(user);
  L.circleMarker([loc.lat,loc.lng],{radius:8,color:'#ffffff',weight:3,fillColor:'#2563eb',fillOpacity:1}).bindTooltip('Your GPS location').addTo(user);
  if(!state.fitted){map.fitBounds(boundary.getBounds().extend(user.getBounds()),{padding:[30,30],maxZoom:18,animate:false});state.fitted=true}
 },[loc,ready]);
 let allowed=false,status=gpsError||(loc?'Checking location…':tracking?'Finding your live location…':'Enable location to begin');
 if(event&&loc&&!gpsError){try{attendanceGPS(loc,event,clock);allowed=true;status='You’re inside the event area'}catch(e:any){status=e.message}}
 const fit=()=>{const s=mapRef.current;if(s)s.map.fitBounds(s.user.getLayers().length?s.boundary.getBounds().extend(s.user.getBounds()):s.boundary.getBounds(),{padding:[30,30],maxZoom:18,animate:false})};
 const submit=async()=>{if(!allowed||sending||busy)return;setSending(true);try{
  // Confirm the same fresh live reading shown on the map; the API independently validates it.
  attendanceGPS(loc,event);await onConfirm(loc);
 }catch(e:any){setGPSError(e.message)}finally{setSending(false)}};
 const startGPS=()=>{setGPSError('');setLoc(null);setTracking(true);setGPSAttempt(v=>v+1)};
 const metres=loc&&event?distance(loc.lat,loc.lng,event.lat,event.lng):null;
 const stage=allowed?2:tracking?1:0;
 return <section className="gps-workspace" aria-label="Attendance location verification">
  <header className="gps-heading"><span className="gps-heading-icon"><MapPin size={22}/></span><div><span className="gps-eyebrow">ATTENDANCE LOCATION</span><h3>{kind==='in'?'Check in at your event':'Check out from your event'}</h3><p>{event?.title||'Loading your event…'}</p></div></header>
  <ol className="gps-steps" aria-label="Location verification steps">{['Enable location','Verify presence',kind==='in'?'Check in':'Check out'].map((label,index)=><li key={label} aria-current={index===stage?'step':undefined} className={index<=stage?'active':''}><span>{index<stage?<CheckCircle2 size={16}/>:index+1}</span>{label}</li>)}</ol>
  {eventError?<div role="alert" className="gps-message"><AlertCircle size={20}/><div><strong>Event location unavailable</strong><p>{eventError}</p><button type="button" className="btn small" onClick={()=>setAttempt(v=>v+1)}>Retry</button></div></div>:null}
  <div className="gps-map-shell">
   <div ref={container} className="attendance-map" role="region" aria-label="Map showing event boundary and your device location"/>
   {!ready&&!mapError&&<div className="gps-map-loading" role="status"><MapPin size={25}/><span>{eventError?'Waiting for event details':'Loading event map…'}</span></div>}
   <button className="gps-recenter" type="button" title="Show event and my location" aria-label="Show event and my location" disabled={!ready} onClick={fit}><LocateFixed size={20}/></button>
  </div>
  <div className="gps-map-caption"><span><i className="gps-boundary-key"/>Event area</span><span><i className="gps-location-key"/>Your location &amp; accuracy</span></div>
  {(mapError||tilesError)&&<div className="gps-tile-notice" role="status"><span>{mapError||'Street map unavailable. Your location and event boundary still work.'}</span><button className="btn small" type="button" onClick={()=>setAttempt(v=>v+1)}>Reload map</button></div>}
  <div className={'gps-location-status '+(allowed?'is-ready':gpsError?'is-error':'')} role="status" aria-live="polite">
   <span className="gps-status-icon">{allowed?<ShieldCheck size={24}/>:gpsError?<AlertCircle size={24}/>:<Navigation size={24}/>}</span>
   <div><strong>{status}</strong><p>{allowed?'Location verified on this device. Confirm below to save your attendance.':!tracking?'Allow your browser to use your location. We track it only while this screen is open.':!loc&&!gpsError?'Keep this screen open. GPS may take a few seconds to settle.':gpsError?'Check location settings, then try again.':'Keep your full blue accuracy circle inside the green boundary. Move farther inside or wait for GPS to improve.'}</p></div>
  </div>
  {event&&<dl className="gps-metrics"><div><dt>Distance to event</dt><dd>{metres===null?'—':metres+' m'}</dd></div><div><dt>Event radius</dt><dd>{event.radius} m</dd></div><div><dt>GPS accuracy</dt><dd>{loc?'±'+Math.round(loc.accuracy)+' m':'—'}</dd></div></dl>}
  <div className="gps-action-area">
   {!tracking?<button className="btn primary gps-main-action" type="button" disabled={!event||!!eventError||busy} onClick={startGPS}><LocateFixed size={18}/>Enable my location<ChevronRight size={18}/></button>:<><button className="btn primary gps-main-action" type="button" disabled={!allowed||sending||busy||!!eventError} onClick={submit}>{sending||busy?'Saving attendance…':kind==='in'?'Confirm check-in':'Confirm check-out'}{!sending&&!busy&&<ChevronRight size={18}/>}</button><button className="btn gps-retry" type="button" disabled={sending||busy||!event} onClick={startGPS}><RefreshCw size={16}/>Retry location</button></>}
   <p><ShieldCheck size={15}/>Your server verifies the location again before saving.</p>
  </div>
  <div className="gps-next"><strong>What happens next?</strong><p>{kind==='in'?'Submit your participation photo, then check out when the activity ends.':'Submit your photo if you haven’t already.'} Your admin reviews attendance and evidence before hours are credited.</p></div>
  <details className="gps-details"><summary>Location details &amp; privacy</summary><p>Event: {event?event.lat+', '+event.lng:'Loading…'}<br/>Your device: {loc?loc.lat.toFixed(5)+', '+loc.lng.toFixed(5):'Not captured'}<br/>Reading: {loc?new Date(loc.clientTime).toLocaleTimeString():'Not captured'}</p><p>The blue circle shows location uncertainty. Your full accuracy circle must fit inside the event boundary, and reported accuracy must be 200 metres or better. Moving the map does not move your GPS position. Check-in/check-out readings are saved for review; this screen does not collect background location after closing.</p><p>OpenStreetMap supplies street tiles and receives your IP address and the viewed map area. A photo’s geotag is separate supporting evidence, not live GPS verification.</p></details>
 </section>
}
