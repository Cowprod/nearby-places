(function(){
'use strict';
var KEY='nearby-navigation-apps-v1';
var APPS=[{id:'apple',label:'Apple Plans',native:'APPLE_MAPS'},{id:'google',label:'Google Maps',native:'GOOGLE_MAPS'},{id:'citymapper',label:'Citymapper',native:'CITYMAPPER'}];
function plugin(){return window.launchnavigator&&typeof window.launchnavigator.navigate==='function'?window.launchnavigator:null;}
function saved(){try{var v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}}
function preference(mode){var v=saved()[mode];return APPS.some(function(a){return a.id===v;})?v:'apple';}
function setPreference(mode,id){if(mode!=='walking'&&mode!=='transit')return;if(!APPS.some(function(a){return a.id===id;}))return;var v=saved();v[mode]=id;try{localStorage.setItem(KEY,JSON.stringify(v));}catch(_){}}
function appleUrl(place,mode){return 'https://maps.apple.com/?daddr='+encodeURIComponent(place.latitude+','+place.longitude)+'&dirflg='+(mode==='transit'?'r':'w')+'&q='+encodeURIComponent(place.name||'Lieu');}
function available(callback){var nav=plugin();if(!nav||!nav.getAvailableApps){callback({apple:true},false);return;}try{nav.getAvailableApps(function(apps){var result={apple:true};APPS.forEach(function(a){if(a.id!=='apple')result[a.id]=!!apps[nav.APP[a.native]];});callback(result,true);},function(){callback({apple:true},false);});}catch(_){callback({apple:true},false);}}
function launch(place,mode,event){if(event){event.preventDefault();}var app=preference(mode),nav=plugin();if(!nav||app==='apple'){window.location.href=appleUrl(place,mode);return;}var native=nav.APP[APPS.find(function(a){return a.id===app;}).native];function fallback(){window.location.href=appleUrl(place,mode);}
try{nav.isAppAvailable(native,function(ok){if(!ok){fallback();return;}var options={app:native,destinationName:place.name||'Lieu'};if(app==='google')options.transportMode=mode==='transit'?nav.TRANSPORT_MODE.TRANSIT:nav.TRANSPORT_MODE.WALKING;nav.navigate([Number(place.latitude),Number(place.longitude)],function(){},function(){fallback();},options);},fallback);}catch(_){fallback();}}
function setup(){var host=document.querySelector('.nearby-appearance-settings');if(!host)return;var section=document.createElement('section');section.className='nearby-navigation-settings';section.innerHTML='<h2>Applications de navigation</h2><p class="muted" id="nearby-navigation-help">Recherche des applications installées…</p><label for="nearby-walking-app">Itinéraires à pied</label><select id="nearby-walking-app"></select><label for="nearby-transit-app">Transports en commun</label><select id="nearby-transit-app"></select><p class="muted">Citymapper ouvre la destination mais ne garantit pas le mode de transport. Apple Plans est utilisé si l’application choisie est indisponible.</p>';host.insertAdjacentElement('afterend',section);
var help=section.querySelector('#nearby-navigation-help');
function fill(found,detected){['walking','transit'].forEach(function(mode){var select=section.querySelector('#nearby-'+mode+'-app');var selected=preference(mode);select.replaceChildren();APPS.forEach(function(app){if(!found[app.id]&&app.id!==selected)return;var option=document.createElement('option');option.value=app.id;option.textContent=app.label+(!found[app.id]?' (non détectée)':'');option.disabled=!found[app.id];select.append(option);});select.value=found[selected]?selected:'apple';select.onchange=function(){setPreference(mode,select.value);};});help.textContent=detected?'Applications de navigation détectées sur cet appareil.':'Détection native indisponible : Apple Plans reste accessible.';}
available(fill);
document.addEventListener('deviceready',function(){available(fill);},false);
}
window.NearbyNavigator={launch:launch,appleUrl:appleUrl,available:available,preference:preference};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
