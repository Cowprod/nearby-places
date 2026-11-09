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
  return {children:[],textContent:'',style:{},dataset:{},append(...items){this.children.push(...items);},
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
 const overlay=document.body.children[0],box=overlay.children[0],actions=box.children[4];
 assert.equal(actions.children.filter(item=>item.textContent==='Prendre une photo').length,0,'albums do not expose camera controls');
 assert.ok(actions.children.some(item=>item.textContent==='Choisir dans Photos'),'album retains manual imports');
 assert.ok(actions.children.some(item=>item.textContent==='Photos à proximité'),'album retains geolocated suggestions');
 return {capture:()=>window.NearbyPlacePhotos.capture(place),alerts,values,calls,window,
  pick:()=>{actions.children.find(item=>item.textContent==='Choisir dans Photos').onclick();
    return new Promise(resolve=>setImmediate(()=>resolve(box.children[5].textContent)));}};
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
  const h=harness(raw);const result=await h.capture();
  assert.equal(result.saved,true,'original photo remains saved by PhotoKit even if local association fails');
  assert.equal(result.associated,false,'corrupted associations are never claimed to have been saved');
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
 // A missing or invalid collection store must not be reported as successful
 // album creation after an original has already been saved and linked.
 for(const corrupt of [null,'{broken','{}']){
  const h=harness('{}');
  if(corrupt===null)h.values.delete('nearby-collections-v2');
  else h.values.set('nearby-collections-v2',corrupt);
  const result=await h.capture();
  assert.equal(result.saved,true,'native original was saved');
  assert.equal(result.associated,true,'place-photo link remains persisted');
  assert.equal(result.albumSynced,false,'invalid collections cannot be silently marked synced');
  assert.deepEqual(JSON.parse(h.values.get('nearby-place-photo-links-v1'))['place-a'],['photo-B']);
  assert.equal(h.calls.length,0,'invalid collections never create an album');
  assert.match(h.alerts[0],/Album Photos non synchronisé/);
 }
 // A PHPicker selection may carry images without a PHAsset.localIdentifier.
 // They must be reported, never silently presented as saved associations.
 const skipped=harness('{}');
 skipped.window.NearbyPhotos.pick=ok=>ok({ids:[],selectedCount:2,unavailableCount:2});
 assert.match(await skipped.pick(),/2 photo.*sans identifiant PhotoKit/);
 assert.equal(skipped.values.get('nearby-place-photo-links-v1'),'{}',
   'unaddressable images must never create local photo links');
 assert.equal(skipped.calls.length,0,'unaddressable images do not create a PhotoKit album');

 const mixed=harness('{}');
 mixed.window.NearbyPhotos.pick=ok=>ok({ids:['photo-C','photo-C'],selectedCount:3,unavailableCount:1});
 assert.match(await mixed.pick(),/1 photo.*non associée/);
 assert.deepEqual(JSON.parse(mixed.values.get('nearby-place-photo-links-v1'))['place-a'],['photo-C'],
   'valid PhotoKit ID is saved once even with duplicate picker entries');
 assert.equal(mixed.calls.length,1,'valid images still trigger album reconciliation');

 const rejected=harness('{}');
 rejected.window.NearbyPhotos.pick=ok=>ok({ids:['photo-D'],selectedCount:2,unavailableCount:1});
 rejected.window.NearbyPhotos.addToAlbum=(id,title,ids,ok,fail)=>fail('Accès Photos refusé');
 assert.match(await rejected.pick(),/Album Photos non synchronisé.*sans identifiant PhotoKit/,
   'both an album error and unaddressable selection remain visible');
 assert.deepEqual(JSON.parse(rejected.values.get('nearby-place-photo-links-v1'))['place-a'],['photo-D'],
   'an album failure must never undo valid picker associations');
 const empty=harness('{}');
 empty.window.NearbyPhotos.pick=ok=>ok({ids:[],selectedCount:0,unavailableCount:0});
 assert.match(await empty.pick(),/Aucune photo sélectionnée/);
 assert.equal(empty.calls.length,0,'picker cancellation never creates an album');

 const cancelled=harness('{}');
 cancelled.window.NearbyPhotos.capture=ok=>ok({cancelled:true});
 await cancelled.capture();
 assert.deepEqual(JSON.parse(cancelled.values.get('nearby-place-photo-links-v1')),{},'cancellation creates no link');
 assert.equal(cancelled.alerts.length,0,'camera cancellation is silent');
 console.log('PASS photo-place associations: direct camera, lazy albums, no duplicate links, safe errors');
})().catch(err=>{console.error(err);process.exitCode=1;});
