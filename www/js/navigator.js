(function(){
'use strict';
var KEY='nearby-navigation-app-v2',OLD='nearby-navigation-apps-v1';
var APPS=[{id:'apple',label:'Apple Plans',native:'APPLE_MAPS',modes:true},{id:'google',label:'Google Maps',native:'GOOGLE_MAPS',modes:true},{id:'waze',label:'Waze',native:'WAZE',modes:false},{id:'citymapper',label:'Citymapper',native:'CITYMAPPER',modes:false},{id:'transit',label:'Transit',native:'TRANSIT_APP',modes:false},{id:'moovit',label:'Moovit',native:'MOOVIT',modes:false},{id:'here',label:'HERE WeGo',native:'HERE_MAPS',modes:false}];
function catalog(){var nav=plugin(),items=APPS.slice();if(nav&&nav.APP){Object.keys(nav.APP).forEach(function(key){var native=nav.APP[key];if(typeof native!=='string'||items.some(function(a){return a.native===key||a.nativeValue===native;}))return;items.push({id:'native:'+key,label:key.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();}),native:key,nativeValue:native,modes:false});});}return items;}
function plugin(){var candidate=window.launchnavigator||(window.cordova&&window.cordova.plugins&&window.cordova.plugins.launchnavigator);return candidate&&typeof candidate.navigate==='function'?candidate:null;}
function preference(){try{var value=localStorage.getItem(KEY);if(catalog().some(function(a){return a.id===value;}))return value;var old=JSON.parse(localStorage.getItem(OLD)||'{}');return catalog().some(function(a){return a.id===old.walking;})?old.walking:'apple';}catch(_){return 'apple';}}
function app(){return catalog().find(function(a){return a.id===preference();})||APPS[0];}
function modes(){return app().modes?['walking','transit']:['generic'];}
function setPreference(id){if(!catalog().some(function(a){return a.id===id;}))return;try{localStorage.setItem(KEY,id);}catch(_){}window.dispatchEvent(new Event('nearby-navigation-changed'));}
function appleUrl(place,mode){return 'https://maps.apple.com/?daddr='+encodeURIComponent(place.latitude+','+place.longitude)+'&dirflg='+(mode==='transit'?'r':'w')+'&q='+encodeURIComponent(place.name||'Lieu');}
function available(callback){
 var nav=plugin(),items=catalog(),fallback={apple:true};
 // The UI never hides a user's installed navigation app just because iOS
 // cannot query a custom URI scheme (or deviceready has not fired yet).
 if(!nav){callback(fallback,false);return;}
 function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
 function detected(installed,a){
  if(!installed)return false;
  var keys=[a.id,a.native,nav.APP&&nav.APP[a.native],a.nativeValue,a.label];
  if(Array.isArray(installed))return installed.some(function(value){return keys.some(function(k){return normalize(k)===normalize(value);});});
  return Object.keys(installed).some(function(key){
   return !!installed[key]&&keys.some(function(k){return normalize(k)===normalize(key);});
  });
 }
 function done(installed){
  var result={apple:true},pending=0,complete=false;
  items.filter(function(a){return a.id!=='apple'&&nav.APP&&nav.APP[a.native];}).forEach(function(a){
   result[a.id]=detected(installed,a);
  });
  var unresolved=items.filter(function(a){return a.id!=='apple'&&nav.APP&&nav.APP[a.native]&&!result[a.id];});
  if(!unresolved.length||typeof nav.isAppAvailable!=='function'){callback(result,true);return;}
  pending=unresolved.length;
  unresolved.forEach(function(a){
   function finish(isAvailable){
    if(complete)return;
    result[a.id]=result[a.id]||!!isAvailable;
    if(--pending===0){complete=true;callback(result,true);}
   }
   try{nav.isAppAvailable(nav.APP[a.native],function(ok){finish(ok);},function(){finish(false);});}
   catch(_){finish(false);}
  });
 }
 if(typeof nav.availableApps==='function'){
  try{nav.availableApps(done,function(){done(null);});}catch(_){done(null);}
 }else done(null);
}
function launch(place,mode,event){
 if(event)event.preventDefault();
 var selected=app(),nav=plugin();
 function fallback(reason){window.alert('Impossible d’ouvrir '+selected.label+'. Vérifiez que cette application est installée. '+(reason?String(reason):''));}
 if(selected.id==='apple'){window.location.href=appleUrl(place,mode);return;}if(!nav){fallback('Module de navigation indisponible.');return;}
 var native=nav.APP&&nav.APP[selected.native];
 if(!native){fallback('Application non prise en charge par le module natif.');return;}
 var options={app:native,destinationName:place.name||'Lieu'};
 if(selected.modes&&nav.TRANSPORT_MODE)options.transportMode=mode==='transit'?nav.TRANSPORT_MODE.TRANSIT:nav.TRANSPORT_MODE.WALKING;
 // Supported plugin API: navigate(destination, options), with callbacks
 // inside options. The 4-positional-argument overload also exists.
 options.successCallback=function(){};
 options.errorCallback=function(error){fallback(error);};
 try{nav.navigate([Number(place.latitude),Number(place.longitude)],options);}
 catch(error){fallback(error);}
}
function setup(){var host=document.querySelector('.nearby-appearance-settings');if(!host)return;var section=document.createElement('section');section.className='nearby-navigation-settings';section.innerHTML='<h2>Application de navigation</h2><label for="nearby-navigation-app">Application utilisée pour les itinéraires</label><select id="nearby-navigation-app"></select><p class="muted" id="nearby-navigation-help">Recherche des applications installées…</p><p class="muted">Si l’application accepte les modes, les icônes piéton et transports sont affichées. Sinon, une seule icône d’itinéraire apparaît. En cas d’erreur, un message indique pourquoi l’application choisie ne s’ouvre pas.</p>';host.insertAdjacentElement('afterend',section);var select=section.querySelector('select'),help=section.querySelector('#nearby-navigation-help');
function fill(found,detected){var current=preference();select.replaceChildren();catalog().forEach(function(a){var option=document.createElement('option');option.value=a.id;option.textContent=a.label+(a.id!=='apple'&&!found[a.id]?' (installation non détectée)':'');select.append(option);});select.value=current;select.onchange=function(){setPreference(select.value);};help.textContent=detected?'Les applications non détectées restent sélectionnables : leur ouverture vérifiera leur disponibilité.':(window.cordova&&window.cordova.platformId?'Détection native indisponible : sélection possible, ouverture à vérifier sur cet iPhone.':'Détection en attente du démarrage du module natif.');}
available(fill);document.addEventListener('deviceready',function(){available(fill);},false);document.addEventListener('resume',function(){available(fill);},false);if(window.cordova&&window.cordova.platformId&&plugin())available(fill);
}
window.NearbyNavigator={launch:launch,appleUrl:appleUrl,available:available,preference:preference,modes:modes};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
