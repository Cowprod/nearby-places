'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('www/js/navigator.js','utf8');
assert.equal(source,fs.readFileSync('public/js/navigator.js','utf8'),'www and public route logic match');

const APP={APPLE_MAPS:'apple_maps',GOOGLE_MAPS:'google_maps',CITYMAPPER:'citymapper',TRANSIT_APP:'transit_app',MOOVIT:'moovit',HERE_MAPS:'here_maps'};
function harness(preference,installed){
 const values=new Map([['nearby-navigation-app-v2',preference]]);
 const localStorage={getItem:key=>values.get(key)||null,setItem:(key,val)=>values.set(key,String(val))};
 const navigations=[];
 const launchnavigator={
  APP,TRANSPORT_MODE:{WALKING:'walking',TRANSIT:'transit'},
  availableApps:ok=>ok(installed),
  isAppAvailable:(id,ok)=>ok(!!installed[id]),
  navigate:(destination,options)=>navigations.push({destination:Array.from(destination),options})
 };
 const window={launchnavigator,location:{href:'original'},dispatchEvent:()=>{}};
 const document={readyState:'loading',addEventListener:()=>{}};
 vm.runInNewContext(source,{window,localStorage,document,Event:function(){}});
 return {api:window.NearbyNavigator,window,navigations};
}
const first=harness('google',{google_maps:true,citymapper:true});
first.api.available((found,detected)=>{
 assert.equal(detected,true);
 assert.equal(found.apple,true);
 assert.equal(found.google,true,'Google Maps must be recognized');
 assert.equal(found.citymapper,true,'Citymapper must be recognized');
});
assert.equal(first.api.preference(),'google');
first.api.launch({latitude:35.66,longitude:139.7,name:'Tokyo'},'walking');
assert.equal(first.navigations.length,1,'Google Maps is opened through native plugin');
assert.equal(first.navigations[0].options.app,APP.GOOGLE_MAPS);
assert.equal(first.navigations[0].options.transportMode,'walking');
assert.equal(typeof first.navigations[0].options.errorCallback,'function');
assert.equal(first.window.location.href,'original','successful native launch must not force Apple Maps');

const second=harness('citymapper',{citymapper:true});
second.api.launch({latitude:35,longitude:139,name:'Tokyo'},'generic');
assert.equal(second.navigations[0].options.app,APP.CITYMAPPER,'Citymapper is a first-class option');
assert.equal(second.api.modes()[0],'generic');
second.navigations[0].options.errorCallback();
assert.match(second.window.location.href,/maps\.apple\.com/,'Apple Maps remains a fallback on native error');

assert.match(source,/isAppAvailable/,'recheck apps not found in availableApps');
assert.match(source,/Applications installées signalées/,'manual selection remains available when iOS detection fails');
console.log('PASS navigator: Google Maps and Citymapper availability, navigation options and Apple fallback');
