(function(root){
'use strict';
var STORAGE='nearby-places-proximity-v1', COOLDOWN='nearby-places-alerts-v1';
var RADIUS=1000, ready=false, active=false, catalogue=[], sdk=null;
function storeGet(key,fallback){try {return JSON.parse(localStorage.getItem(key))||fallback;}catch(e){return fallback;}}
function storeSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){console.warn('storage',e);}}
function status(message){var e=document.getElementById('proximity-status');if(e)e.textContent=message;}
function notificationPlugin(){return root.cordova && root.cordova.plugins && root.cordova.plugins.notification && root.cordova.plugins.notification.local;}
function notificationId(id){var n=7;for(var i=0;i<id.length;i++)n=(Math.imul(n,31)+id.charCodeAt(i))|0;return (n>>>0)%2000000000+1;}
function currentPlaces(){return catalogue.filter(function(p){return !p.visited && (!p.alert || p.alert.enabled!==false) && typeof p.latitude==='number' && typeof p.longitude==='number';});}
function fences(){return currentPlaces().map(function(p){return {identifier:p.id,latitude:p.latitude,longitude:p.longitude,radius:RADIUS,notifyOnEntry:true,notifyOnExit:false,extras:{name:p.name}};});}
function notify(place){
 var local=notificationPlugin(), history=storeGet(COOLDOWN,{}), now=Date.now();
 if(!place || !local)return;
 var hours=(place.alert&&Number(place.alert.cooldownHours))||24;
 if(now-(history[place.id]||0)<hours*3600000)return;
 // Local notifications are generated when the native SDK delivers a JavaScript event.
 // iOS may terminate the WebView; this is NOT guaranteed background delivery.
 try {
   local.schedule({id:notificationId(place.id),title:'Lieu à proximité',text:place.name+' est à proximité (distance géographique estimée).',foreground:true});
   history[place.id]=now;storeSet(COOLDOWN,history);
   status('Notification de proximité : '+place.name);
 }catch(error){status('Erreur notification : '+String(error));}
}
function onGeofence(event){
 if(!event || event.action!=='ENTER')return;
 var place=catalogue.find(function(p){return p.id===event.identifier;});
 if(place && !place.visited)notify(place);
}
function sync(){
 if(!ready || !sdk)return Promise.resolve(false);
 var list=fences();
 return sdk.removeGeofences().then(function(){
   return list.length?sdk.addGeofences(list):true;
 }).then(function(){status(active?'Surveillance active · '+list.length+' lieux':'Prêt · '+list.length+' lieux surveillables');return true;})
 .catch(function(error){status('Erreur zones : '+String(error));return false;});
}
function init(){
 sdk=root.BackgroundGeolocation;
 if(!sdk){status('Prévisualisation web : géofencing natif indisponible');return Promise.resolve(false);}
 sdk.onGeofence(onGeofence);
 return sdk.ready({locationAuthorizationRequest:'Always',stopOnTerminate:false,startOnBoot:true,
   geofenceInitialTriggerEntry:false,geofenceProximityRadius:2000,debug:false,logLevel:sdk.LOG_LEVEL_ERROR})
 .then(function(state){ready=true;active=!!state.enabled;return sync().then(function(){return true;});})
 .catch(function(error){status('Initialisation impossible : '+String(error));return false;});
}
function enable(){
 if(!sdk || !ready){status('Le module natif n’est pas prêt');return Promise.resolve(false);}
 var local=notificationPlugin();
 if(!local){status('Plugin de notification manquant');return Promise.resolve(false);}
 return new Promise(function(resolve){
   try{local.requestPermission(function(granted){resolve(!!granted);});}catch(error){resolve(false);}
 }).then(function(granted){
   if(!granted){status('Permission notifications refusée');return false;}
   return sync().then(function(ok){
     if(!ok)return false;
     return sdk.startGeofences().then(function(){active=true;storeSet(STORAGE,{enabled:true});status('Surveillance activée · rayon '+RADIUS+' m');return true;});
   });
 }).catch(function(error){status('Surveillance refusée : '+String(error));return false;});
}
function disable(){
 if(!sdk || !ready){status('Module natif absent');return Promise.resolve(false);}
 return sdk.stop().then(function(){active=false;storeSet(STORAGE,{enabled:false});status('Surveillance arrêtée');return true;})
 .catch(function(error){status('Arrêt impossible : '+String(error));return false;});
}
function setPlaces(places){catalogue=Array.isArray(places)?places.slice():[];if(ready)return sync();return Promise.resolve(false);}
function wire(){
 var start=document.getElementById('proximity-start'), stop=document.getElementById('proximity-stop');
 if(start)start.onclick=enable;
 if(stop)stop.onclick=disable;
 if(!root.cordova){status('Mode web : uniquement la consultation et le GPS au premier plan');return;}
 document.addEventListener('deviceready',init,{once:true});
}
root.NearbyProximity={wire:wire,setPlaces:setPlaces,enable:enable,disable:disable,onGeofence:onGeofence,fences:fences};
})(window);
