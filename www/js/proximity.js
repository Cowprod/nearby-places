(function(root){
'use strict';
var STORAGE='nearby-places-proximity-v1', COOLDOWN='nearby-places-alerts-v1', EVENTS='nearby-places-events-v1';
var ready=false, active=false, catalogue=[], sdk=null;
var nativeQueue=Promise.resolve(), controlRevision=0, lastFenceSignature=null;
function serialNative(action){
 var pending=nativeQueue.then(action,action);
 nativeQueue=pending.then(function(){},function(){});
 return pending;
}
function storeGet(key,fallback){try {return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;}}
function storeSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){console.warn('storage',e);}}
function status(message){var e=document.getElementById('proximity-status');if(e)e.textContent=message;}
function logEvent(kind,details){
 var items=storeGet(EVENTS,[]);if(!Array.isArray(items))items=[];
 items.unshift({at:new Date().toISOString(),kind:kind,details:String(details||'')});
 storeSet(EVENTS,items.slice(0,150));diagnostics();
}
function diagnostics(){
 var el=document.getElementById('proximity-diagnostics');if(!el)return;
 var events=storeGet(EVENTS,[]);
 el.textContent='Module : '+(ready?'prêt':'indisponible')+' · surveillance : '+(active?'active':'inactive')+
   ' · rayon : '+radius()+' m · zones configurées : '+fences().length+'\n'+
   (Array.isArray(events)?events.slice(0,60).map(function(e){return e.at+' · '+e.kind+' · '+e.details;}).join('\n'):'');
}
function copyDiagnostics(){
 var el=document.getElementById('proximity-diagnostics'),feedback=document.getElementById('copy-diagnostics-status');
 var content='Nearby Places build '+(document.getElementById('build-number')?document.getElementById('build-number').textContent:'inconnu')+'\n'+(el?el.textContent:'journal absent');
 function done(ok){if(feedback)feedback.textContent=ok?'Journal copié':'Copie impossible : sélectionner le journal';}
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(content).then(function(){done(true);},function(){fallback();});}
 else fallback();
 function fallback(){try{var t=document.createElement('textarea');t.value=content;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();var ok=document.execCommand('copy');document.body.removeChild(t);done(ok);}catch(e){done(false);}}
}
function checkProximityNow(){
 var result=document.getElementById('proximity-check-result');
 function show(message){if(result)result.textContent=message;}
 logEvent('proximity-check','bouton pressé ; zones='+fences().length+' active='+active+' ready='+ready);
 show('Recherche de la position GPS…');
 if(!navigator.geolocation){show('Géolocalisation WebView absente');logEvent('proximity-error','geolocation absente');return;}
 navigator.geolocation.getCurrentPosition(function(position){
  var c=position.coords,lat=c.latitude,lon=c.longitude,accuracy=c.accuracy,rad=radius();
  var candidates=currentPlaces().map(function(p){
   var dlat=(p.latitude-lat)*Math.PI/180,dlon=(p.longitude-lon)*Math.PI/180;
   var a=Math.sin(dlat/2)**2+Math.cos(lat*Math.PI/180)*Math.cos(p.latitude*Math.PI/180)*Math.sin(dlon/2)**2;
   return {name:p.name,id:p.id,meters:Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(a))))};
  }).sort(function(a,b){return a.meters-b.meters;});
  var lines=candidates.slice(0,10).map(function(p){return p.name+' : '+p.meters+' m '+(p.meters<=rad?'(dans rayon)':'(hors rayon)');});
  var header='GPS '+lat.toFixed(6)+','+lon.toFixed(6)+' ±'+Math.round(accuracy)+' m ; rayon '+rad+' m ; SDK '+(ready?'prêt':'absent')+'/'+(active?'actif':'inactif');
  logEvent('proximity-gps',header);
  candidates.forEach(function(p){logEvent('proximity-distance',p.id+' '+p.name+' : '+p.meters+' m / '+rad+' m '+(p.meters<=rad?'INSIDE':'OUTSIDE'));});
  show(header+'\n'+(lines.join('\n')||'Aucun lieu surveillable'));
 },function(error){var message='GPS erreur '+error.code+' : '+error.message;logEvent('proximity-error',message);show(message);},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
}
function notificationPlugin(){return root.cordova && root.cordova.plugins && root.cordova.plugins.notification && root.cordova.plugins.notification.local;}
// A stalled Cordova permission callback must not leave the diagnostic button or
// geofence opt-in waiting forever. Late callbacks cannot schedule notifications.
function requestNotificationPermission(local){
 return new Promise(function(resolve){
   var finished=false;
   var timer=setTimeout(function(){finish(false,'timeout');},60000);
   function finish(granted,reason){
     if(finished)return;
     finished=true;clearTimeout(timer);
     if(reason==='timeout')logEvent('notification-permission','aucune réponse native après 60 s');
     resolve({granted:!!granted,reason:reason||(granted?'granted':'denied')});
   }
   try{local.requestPermission(function(granted){finish(!!granted);});}
   catch(error){logEvent('notification-permission','exception : '+String(error));finish(false,'error');}
 });
}
// The plugin cancels a pending notification when its numeric ID is reused.
// Reserve a signed Int32 range separate from proximity IDs; keep legacy callbacks.
var LEGACY_TEST_NOTIFICATION_ID=1999999999, TEST_ID_BASE=2100000000, TEST_ID_SPAN=40000000;
var TEST_SEQUENCE_KEY='nearby-places-test-notification-seq-v1', testSequence=0;
function isTestNotification(n){
 var id=n && Number(n.id);
 return Number.isInteger(id) && (id===LEGACY_TEST_NOTIFICATION_ID || (id>=TEST_ID_BASE && id<TEST_ID_BASE+TEST_ID_SPAN));
}
function nextTestNotificationId(){
 var saved=Number(storeGet(TEST_SEQUENCE_KEY,0));
 if(Number.isSafeInteger(saved) && saved>=0 && saved<TEST_ID_SPAN && saved>testSequence)testSequence=saved;
 testSequence=(testSequence+1)%TEST_ID_SPAN;
 storeSet(TEST_SEQUENCE_KEY,testSequence);
 return TEST_ID_BASE+testSequence;
}
function notificationEventContext(event){
 if(!event || typeof event!=='object')return '';
 var flags=[];
 if(typeof event.foreground==='boolean')flags.push('foreground='+event.foreground);
 if(typeof event.queued==='boolean')flags.push('queued='+event.queued);
 return flags.length?' ['+flags.join(', ')+']':'';
}
var notificationEventsRegistered=false;
function registerNotificationEvents(){
 var local=notificationPlugin();
 if(!local || typeof local.on!=='function' || notificationEventsRegistered)return;
 try{
  local.on('add',function(n,event){if(isTestNotification(n))logEvent('test-notification','id '+n.id+' : confirmation native add reçue (notification ajoutée au planificateur)'+notificationEventContext(event));});
  local.on('trigger',function(n,event){if(isTestNotification(n))logEvent('test-notification','id '+n.id+' : événement natif trigger reçu (WebView active)'+notificationEventContext(event));});
  local.on('click',function(n,event){
   if(isTestNotification(n)){logEvent('test-notification','id '+n.id+' : notification ouverte par utilisateur'+notificationEventContext(event));return;}
   var placeId=n&&n.data&&n.data.placeId;
   if(typeof placeId!=='string'||!placeId)return;
   try{sessionStorage.setItem('nearby-notification-target',JSON.stringify({placeId:placeId,at:Date.now()}));}catch(_){}
   if(window.NearbyNavigation)window.NearbyNavigation.show('collections');
   window.dispatchEvent(new CustomEvent('nearby-notification-open',{detail:{placeId:placeId}}));
  });
  notificationEventsRegistered=true;
 }catch(error){logEvent('notification-events','écoute native indisponible : '+String(error));}
}
function notificationId(id){var n=7;for(var i=0;i<id.length;i++)n=(Math.imul(n,31)+id.charCodeAt(i))|0;return (n>>>0)%2000000000+1;}
function eligibleCollectionPlaceIds(){
  // Fail closed if memberships are unreadable: never notify an orphaned place.
  try{
    var raw=localStorage.getItem('nearby-collections-v2');
    if(!raw)return new Set();
    var data=JSON.parse(raw);
    if(!root.NearbyCollections || !root.NearbyCollections.validate(data))return new Set();
    var available=new Set(data.collections.filter(function(c){return c.active!==false && c.enabled!==false;}).map(function(c){return c.id;}));
    return new Set(data.memberships.filter(function(m){return available.has(m.collectionId);}).map(function(m){return m.placeId;}));
  }catch(error){logEvent('collections-error','appartenances illisibles : '+String(error));return new Set();}
}
function currentPlaces(){
 // A restored catalogue may contain duplicate identifiers. Keep all local data,
 // but submit each valid identifier only once to the native geofence manager.
 var seen=new Set(), eligible=eligibleCollectionPlaceIds();
 return catalogue.filter(function(p){
  if(!p || typeof p.id!=='string' || !p.id || !eligible.has(p.id) || p.visited ||
    (p.alert && p.alert.enabled===false) ||
    !Number.isFinite(p.latitude) || Math.abs(p.latitude)>90 ||
    !Number.isFinite(p.longitude) || Math.abs(p.longitude)>180 ||
    seen.has(p.id))return false;
  seen.add(p.id);
  return true;
 });
}
function radius(){
 var saved=storeGet('nearby-places-radius-m',500);
 var n=Number(saved);
 return Number.isFinite(n)&&n>=200&&n<=2000?n:500;
}
function setRadius(value){
 var n=Number(value);
 if(!Number.isInteger(n)||n<200||n>2000){status('Rayon invalide (200 à 2000 m)');return Promise.resolve(false);}
 storeSet('nearby-places-radius-m',n);
 status('Rayon enregistré : '+n+' m');
 logEvent('rayon',n+' m');
 return sync();
}
function fences(){return currentPlaces().map(function(p){return {identifier:p.id,latitude:p.latitude,longitude:p.longitude,radius:radius(),notifyOnEntry:true,notifyOnExit:false,extras:{name:p.name}};});}
function notify(place){
 var local=notificationPlugin(), history=storeGet(COOLDOWN,{}), now=Date.now();
 if(!place || !local){logEvent('notification-skip','lieu ou plugin absent');return;}
 var hours=(place.alert&&Number(place.alert.cooldownHours))||24;
 if(now-(history[place.id]||0)<hours*3600000){logEvent('notification-skip','cooldown '+place.name);return;}
 // Local notifications are generated when the native SDK delivers a JavaScript event.
 // iOS may terminate the WebView; this is NOT guaranteed background delivery.
 try {
   local.schedule({id:notificationId(place.id),title:'Lieu à proximité',text:place.name+' est à proximité (distance géographique estimée).',data:{placeId:place.id},iOSForeground:true});
   history[place.id]=now;storeSet(COOLDOWN,history);
   status('Notification de proximité : '+place.name);logEvent('notification',place.name);
 }catch(error){status('Erreur notification : '+String(error));}
}
function testNotification(){
 var local=notificationPlugin();
 if(!local){status('Test impossible : plugin de notifications indisponible');logEvent('test-notification','plugin absent');return Promise.resolve(false);}
 return requestNotificationPermission(local).then(function(permission){
   if(!permission.granted){
     var message=permission.reason==='timeout'?'aucune réponse native après 60 s':
       (permission.reason==='error'?'erreur du plugin':'notifications non autorisées');
     status('Test annulé : '+message);
     logEvent('test-notification','permission '+permission.reason);
     return false;
   }
   try{
     var testId=nextTestNotificationId();
     local.schedule({
       id:testId,
       title:'Nearby Places · test',
       text:'Notification de test après 10 secondes, sans géofencing.',
       trigger:{in:10,unit:'second'},
       iOSForeground:true
     });
     status('Demande notification '+testId+' envoyée (+10 s) · confirmation native à vérifier');
     logEvent('test-notification','id '+testId+' : demande JS envoyée à +10 s (pas une confirmation iOS)');
     return true;
   }catch(error){
     status('Échec programmation notification : '+String(error));
     logEvent('test-notification','erreur '+String(error));
     return false;
   }
 });
}
function onGeofence(event){
 logEvent('geofence',event ? (event.action+' '+event.identifier) : 'événement absent');
 if(!active || !event || event.action!=='ENTER'){logEvent('geofence-skip','inactive ou action non ENTER');return;}
 var place=currentPlaces().find(function(p){return p.id===event.identifier;});
 if(place && !place.visited && (!place.alert || place.alert.enabled!==false))notify(place);
 else logEvent('geofence-skip','lieu absent, visité ou alerte désactivée : '+String(event.identifier));
}
function syncNative(){
 var list=fences();
 var signature=JSON.stringify(list);
 if(signature===lastFenceSignature){logEvent('zones-unchanged',list.length+' zones inchangées');return Promise.resolve(true);}
 logEvent('zones-sync','début '+list.length+' zones, rayon '+radius()+' m');
 // Invalidate the cache before mutating native zones: a successful removal followed
 // by a failed addition must never make the next retry a false no-op.
 lastFenceSignature=null;
 return sdk.removeGeofences().then(function(){
   return list.length?sdk.addGeofences(list):true;
 }).then(function(){status(active?'Surveillance active · '+list.length+' lieux':'Prêt · '+list.length+' lieux surveillables');lastFenceSignature=signature;logEvent('zones',list.length+' zones');return true;})
 .catch(function(error){logEvent('zones-error',String(error));status('Erreur zones : '+String(error));return false;});
}
function savedOptIn(){
 var consent=storeGet(STORAGE,null);
 return !!(consent && consent.enabled===true);
}
function sync(){
 if(!ready || !sdk)return Promise.resolve(false);
 // Only explicit persisted opt-in permits background geofence configuration.
 // Place and radius changes while opted out are applied when enable() runs.
 return serialNative(function(){
   if(!savedOptIn()){
     logEvent('zones-skip','sans consentement : zones natives non modifiées');
     return true;
   }
   return syncNative();
 });
}
function init(){
 registerNotificationEvents();
 sdk=root.BackgroundGeolocation;
 if(!sdk){logEvent('init-error','SDK absent');status('Prévisualisation web : géofencing natif indisponible');return Promise.resolve(false);}
 sdk.onGeofence(onGeofence);
 logEvent('init','SDK présent, ready en cours');
 return sdk.ready({locationAuthorizationRequest:'Always',stopOnTerminate:false,startOnBoot:true,
   geofenceInitialTriggerEntry:true,geofenceProximityRadius:2000,debug:false,logLevel:sdk.LOG_LEVEL_ERROR})
 .then(function(state){
   ready=true;
   var nativeEnabled=!!(state && state.enabled);
   var savedConsent=storeGet(STORAGE,null);
   var optedIn=!!(savedConsent && savedConsent.enabled===true);
   // The SDK may restore itself after reboot or a previous crash. Native state alone
   // is not proof of user consent; never enable JS notifications without saved opt-in.
   active=nativeEnabled && optedIn;
   logEvent('init','nativeEnabled='+nativeEnabled+' optIn='+optedIn+' auth='+JSON.stringify(state && state.authorization || null)+' status='+String(state && state.status));
   if(nativeEnabled && !optedIn){
     ++controlRevision;
     return serialNative(function(){return sdk.stop();}).then(function(){
       lastFenceSignature=null;
       storeSet(STORAGE,{enabled:false});
       logEvent('init-stop','SDK actif sans consentement local : arrêt natif demandé et terminé');
       // Never immediately re-arm native geofences after an unauthorized boot.
       return true;
     }).catch(function(error){
       active=false;
       logEvent('init-stop-error',String(error));
       status('Erreur arrêt du SDK sans consentement : '+String(error));
       return false;
     });
   }
   return sync().then(function(){return true;});
 })
 .catch(function(error){logEvent('init-error',String(error));status('Initialisation impossible : '+String(error));return false;});
}
function enable(){
 if(!sdk || !ready){status('Le module natif n’est pas prêt');return Promise.resolve(false);}
 var local=notificationPlugin();
 if(!local){status('Plugin de notification manquant');return Promise.resolve(false);}
 var requestRevision=++controlRevision;
 return requestNotificationPermission(local).then(function(permission){
   if(requestRevision!==controlRevision)return false;
   if(!permission.granted){
     status(permission.reason==='timeout'?'Permission notifications : aucune réponse native après 60 s':
       (permission.reason==='error'?'Permission notifications : erreur du plugin':'Permission notifications refusée'));
     return false;
   }
   return serialNative(function(){
     if(requestRevision!==controlRevision)return false;
     return syncNative().then(function(ok){
       if(!ok || requestRevision!==controlRevision)return false;
       logEvent('start','demande startGeofences');
       return sdk.startGeofences().then(function(){
         // Un arrêt demandé entre-temps reste prioritaire et suivra dans la file.
         if(requestRevision!==controlRevision)return false;
         active=true;storeSet(STORAGE,{enabled:true});
         status('Surveillance activée · rayon '+radius()+' m');logEvent('start',radius()+' m');
         return true;
       });
     });
   });
 }).catch(function(error){logEvent('start-error',String(error));status('Surveillance refusée : '+String(error));return false;});
}
function disable(){
 ++controlRevision; // Invalide les demandes d'activation en attente de permission.
 active=false; // Bloque immédiatement les alertes JS, même si stop() échoue.
 // Persister le retrait de consentement AVANT l'appel natif asynchrone :
 // un crash, une fermeture ou un échec de stop() ne doit pas réactiver les alertes au boot.
 storeSet(STORAGE,{enabled:false});
 logEvent('stop-request','consentement retiré ; arrêt natif demandé');
 if(!sdk || !ready){
   status('Surveillance désactivée localement · arrêt natif à vérifier à l’initialisation');
   return Promise.resolve(false);
 }
 return serialNative(function(){
   return sdk.stop().then(function(){
     // The SDK may discard native zones on stop; always rebuild on next enable.
     lastFenceSignature=null;
     status('Surveillance arrêtée');logEvent('stop','utilisateur, arrêt SDK confirmé');return true;
   });
 }).catch(function(error){
   // Le consentement reste retiré : init() retentera stop() si le SDK se restaure.
   logEvent('stop-error','consentement retiré, arrêt natif non confirmé : '+String(error));
   status('Arrêt natif impossible (préférence désactivée) : '+String(error));
   return false;
 });
}
function setPlaces(places){catalogue=Array.isArray(places)?places.slice():[];if(ready)return sync();return Promise.resolve(false);}
function wire(){
 var start=document.getElementById('proximity-start'), stop=document.getElementById('proximity-stop'), test=document.getElementById('notification-test'), input=document.getElementById('proximity-radius');
 if(input){input.value=String(radius());input.onchange=function(){setRadius(input.value);};}
 if(start)start.onclick=enable;
 if(stop)stop.onclick=disable;
 if(test)test.onclick=testNotification;
 var check=document.getElementById('proximity-check');if(check)check.onclick=checkProximityNow;
 var copy=document.getElementById('copy-diagnostics');if(copy)copy.onclick=copyDiagnostics;
 diagnostics();
 if(!root.cordova){status('Mode web : uniquement la consultation et le GPS au premier plan');return;}
 document.addEventListener('deviceready',init,{once:true});
}
root.NearbyProximity={logEvent:logEvent,wire:wire,setPlaces:setPlaces,enable:enable,disable:disable,testNotification:testNotification,radius:radius,setRadius:setRadius,onGeofence:onGeofence,fences:fences};
})(window);
