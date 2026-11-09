'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('www/js/place-photos.js','utf8');
assert.equal(source,fs.readFileSync('public/js/place-photos.js','utf8'),'www and public photo modules match');

function harness(raw){
 const values=new Map([['nearby-place-photo-links-v1',raw]]);
 const localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value))
 };
 const calls=[],alerts=[];
 const window={alert:message=>alerts.push(message),NearbyPhotos:{
  capture:ok=>ok({id:'photo-B'}),
  thumbnail:(id,ok)=>ok({dataUrl:'data:image/jpeg;base64,dummy'}),
  pick:ok=>ok({ids:[]}),
  nearby:(lat,lon,radius,ok)=>ok({items:[]}),
  addToAlbum:(id,title,ids,ok)=>{calls.push({id,ids:Array.from(ids)});ok({collectionId:id});}
 }};
 function el(){
  return {children:[],textContent:'',style:{},append(...items){this.children.push(...items);},
   replaceChildren(...items){this.children=items;},setAttribute(){},remove(){},
   click(){if(this.onclick)this.onclick();}};
 }
 const document={body:el(),createElement:el};
 values.set('nearby-collections-v2',JSON.stringify({
  collections:[{id:'collection-default',name:'Mes lieux'},{id:'tokyo',name:'Tokyo'}],
  memberships:[{placeId:'place-a',collectionId:'tokyo'}]
 }));
 vm.runInNewContext(source,{window,document,localStorage,Promise,Set,Map,Array,Error});
 const place={id:'place-a',name:'Test',latitude:35,longitude:139};
 window.NearbyPlacePhotos.open(place,false);
 const overlay=document.body.children[0],box=overlay.children[0],actions=box.children[2];
 assert.equal(actions.children.filter(item=>item.textContent==='Prendre une photo').length,0,'albums do not expose camera controls');
 assert.ok(actions.children.some(item=>item.textContent==='Choisir dans Photos'),'album retains manual imports');
 assert.ok(actions.children.some(item=>item.textContent==='Photos à proximité'),'album retains geolocated suggestions');
 return {capture:()=>window.NearbyPlacePhotos.capture(place),alerts,values,calls,window};
}
(async()=>{
 const good=harness(JSON.stringify({'place-a':['photo-A'],'place-b':['keep']}));
 await good.capture();await good.capture();
 assert.deepEqual(JSON.parse(good.values.get('nearby-place-photo-links-v1')),
  {'place-a':['photo-A','photo-B'],'place-b':['keep']},
  'new associations are idempotent and unrelated places remain untouched');
 assert.ok(good.calls.length>=1,'first photo triggers album sync');
 assert.equal(good.calls[0].id,'tokyo');
 assert.equal(good.alerts.length,0,'successful captures do not show errors');
 const cases=[
  ['{bad',/illisibles/],
  ['[]',/Format/],
  [JSON.stringify({'place-a':{lost:'photo-A'},'place-b':['keep']}),/existantes invalides/]
 ];
 for(const [raw,message] of cases){
  const h=harness(raw);await h.capture();
  assert.equal(h.values.get('nearby-place-photo-links-v1'),raw,'corrupt raw data must never be overwritten');
  assert.match(h.alerts[0],message,'error shown to user');
  assert.equal(h.calls.length,0,'album write not started when local association failed');
 }
 const pending=harness('{}');
 pending.window.NearbyPhotos.addToAlbum=(id,title,ids,ok,fail)=>fail('Accès complet à Photos requis');
 const result=await pending.capture();
 assert.equal(result.saved,true,'captured original remains saved when album access is refused');
 assert.equal(result.albumSynced,false,'album synchronization failure remains visible');
 assert.deepEqual(JSON.parse(pending.values.get('nearby-place-photo-links-v1'))['place-a'],['photo-B'],
  'native permission failure never removes the associated photo');
 assert.match(pending.alerts[0],/Photo enregistrée et associée au lieu/,'never claim the photo was lost');
 const cancelled=harness('{}');
 cancelled.window.NearbyPhotos.capture=ok=>ok({cancelled:true});
 await cancelled.capture();
 assert.deepEqual(JSON.parse(cancelled.values.get('nearby-place-photo-links-v1')),{},'cancellation creates no link');
 assert.equal(cancelled.alerts.length,0,'camera cancellation is silent');
 console.log('PASS photo-place associations: direct camera, lazy albums, no duplicate links, safe errors');
})().catch(err=>{console.error(err);process.exitCode=1;});
