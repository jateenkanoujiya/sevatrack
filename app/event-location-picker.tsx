'use client';
import {useEffect,useRef,useState} from 'react';
import {MapPin,LocateFixed,RefreshCw} from 'lucide-react';
import {loadMap} from './gps-map';
type Point={lat:number;lng:number};
export function EventLocationPicker({initial}: {initial:any}){
 const valid=Number.isFinite(initial.lat)&&Number.isFinite(initial.lng)&&Math.abs(initial.lat)<=90&&Math.abs(initial.lng)<=180;
 const [point,setPoint]=useState<Point|null>(valid?{lat:initial.lat,lng:initial.lng}:null);
 const [radius,setRadius]=useState(String(initial.radius??250)),[ready,setReady]=useState(false),[error,setError]=useState(''),[tilesFailed,setTilesFailed]=useState(false),[attempt,setAttempt]=useState(0),[locating,setLocating]=useState(false);
 const container=useRef<HTMLDivElement>(null),state=useRef<any>(null),pointRef=useRef(point),alive=useRef(true);
 pointRef.current=point;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const choose=(p:Point)=>{if(!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lng))return;setPoint({lat:Number(p.lat.toFixed(7)),lng:Number((((p.lng+180)%360+360)%360-180).toFixed(7))})};
 useEffect(()=>{let active=true;let observer:ResizeObserver|undefined;setReady(false);setError('');setTilesFailed(false);
  loadMap().then(L=>{if(!active||!container.current)return;
   const map=L.map(container.current,{scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView(pointRef.current?[pointRef.current.lat,pointRef.current.lng]:[22.5,79],pointRef.current?16:4);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(active)setTilesFailed(true)}).addTo(map);
   const icon=L.divIcon({className:'event-location-pin',html:'<span aria-hidden="true">●</span>',iconSize:[32,32],iconAnchor:[16,16]});
   state.current={L,map,icon,marker:null,circle:null};map.on('click',(e:any)=>choose(e.latlng));
   observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(container.current);setReady(true);
  }).catch(()=>{if(active)setError('Map could not load. Check your connection and retry.')});
  return()=>{active=false;observer?.disconnect();state.current?.map.remove();state.current=null};
 },[attempt]);
 useEffect(()=>{const s=state.current;if(!s||!ready||!point)return;const pos=[point.lat,point.lng],r=Math.max(10,Math.min(10000,Number(radius)||10));
  if(!s.marker){s.marker=s.L.marker(pos,{icon:s.icon,draggable:true,keyboard:true,title:'Event location. Drag to move.'}).addTo(s.map);s.marker.on('dragend',()=>choose(s.marker.getLatLng()));s.circle=s.L.circle(pos,{radius:r,color:'#16835e',weight:2,fillOpacity:.12}).addTo(s.map);
   s.map.fitBounds(s.circle.getBounds(),{padding:[32,32],maxZoom:17,animate:false});
  }else{s.marker.setLatLng(pos);s.circle.setLatLng(pos).setRadius(r)}
 },[point,radius,ready]);
 const fit=()=>{const s=state.current;if(s?.circle)s.map.fitBounds(s.circle.getBounds(),{padding:[32,32],maxZoom:17,animate:false})};
 const locate=()=>{if(!navigator.geolocation){setError('Location is unavailable. Select the venue on the map instead.');return}setLocating(true);setError('');navigator.geolocation.getCurrentPosition(p=>{if(!alive.current)return;choose({lat:p.coords.latitude,lng:p.coords.longitude});state.current?.map.setView([p.coords.latitude,p.coords.longitude],17);setLocating(false)},e=>{if(!alive.current)return;setLocating(false);setError(e.code===1?'Location permission denied. You can still select a venue on the map.':'Could not find your location. Select the venue on the map or try again.')},{enableHighAccuracy:true,timeout:15000,maximumAge:0})};
 return <fieldset className="event-location-picker"><legend><MapPin size={17}/>Event location on map <span aria-hidden="true">*</span></legend>
  <p className="help-note" id="event-map-help">Click the venue to place a pin, or drag the pin to adjust it. The green circle is the area where students can verify attendance.</p>
  <div className="event-map-tools"><button className="btn small" type="button" onClick={locate} disabled={!ready||locating}><LocateFixed size={16}/>{locating?'Finding location…':'Use my current location'}</button><button className="btn small" type="button" disabled={!ready} onClick={()=>{const p=state.current?.map.getCenter();if(p)choose(p)}}>Select map centre</button><button className="btn small" type="button" disabled={!point||!ready} onClick={fit}>Show attendance area</button></div>
  <div className="gps-map-shell"><div ref={container} className="attendance-map event-picker-map" role="region" aria-label="Choose event venue on the map" aria-describedby="event-map-help"/>{!ready&&!error&&<div className="gps-map-loading" role="status">Loading location map…</div>}</div>
  {error&&<div role="alert" className="info-strip">{error}{!ready&&<button type="button" className="btn small" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>Retry map</button>}</div>}
  {tilesFailed&&<p role="status" className="help-note">Street tiles are unavailable. Check your connection before choosing an unfamiliar venue. <button className="text-btn" type="button" onClick={()=>setAttempt(n=>n+1)}>Reload map</button></p>}
  <p className={'event-pin-status '+(point?'selected':'')} role="status">{point?'Location selected — drag the pin to adjust.':'No location selected. Place a pin before saving.'}</p>
  <input type="hidden" name="lat" value={point?.lat??''}/><input type="hidden" name="lng" value={point?.lng??''}/>
  <label className="field">Attendance radius (metres)<input name="radius" type="number" min={10} max={10000} step={1} required value={radius} onChange={e=>setRadius(e.target.value)}/><small>Students must be inside this circle with sufficient GPS accuracy.</small></label>
  <details className="gps-details"><summary>Map controls &amp; location details</summary><p>Keyboard: focus the map, use arrow keys to move and +/− to zoom, then choose “Select map centre”.{point&&<> Selected coordinates: {point.lat.toFixed(6)}, {point.lng.toFixed(6)}.</>} Coordinates are saved automatically. OpenStreetMap receives your IP address and viewed map area.</p></details>
 </fieldset>
}
