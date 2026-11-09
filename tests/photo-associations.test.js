'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('www/js/place-photos.js','utf8');
assert.equal(source,fs.readFileSync('public/js/place-photos.js','utf8'),'built/public photo modules match');

function harness(raw){
 const values=new Map([['nearby-place-photo-links-v1',raw]]);
 const localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value))
 };
 const calls=[];
 const window={NearbyPhotos:{
  capture:ok=>ok({id:'photo-B'}),
  thumbnail:(id,ok)=>ok({dataUrl:'data:image/jpeg;base64,dummy'}),
  addToAlbum:(id,title,ids,ok)=>{calls.push({id,ids:Array.from(ids)});ok({collectionId:id});}
 }};
 function el(){
  return {children:[],textContent:'',append(...items){this.children.push(...items);},
   replaceChildren(...items){this.children=items;},setAttribute(){},remove(){},
   click(){if(this.onclick)this.onclick();}};
 }
 const document={body:el(),createElement:el};
 values.set('nearby-collections-v2',JSON.stringify({
  collections:[{id:'collection-default',name:'Mes lieux'},{id:'tokyo',name:'Tokyo'}],
  memberships:[{placeId:'place-a',collectionId:'tokyo'}]
 }));
 vm.runInNewContext(source,{window,document,localStorage,Promise,Set,Map,Array,Error});
 window.NearbyPlacePhotos.open({id:'place-a',name:'Test',latitude:35,longitude:139},false);
 const overlay=document.body.children[0];
 const box=overlay.children[0],actions=box.children[2],status=box.children[3];
 const camera=actions.children.find(item=>item.textContent==='Prendre une photo');
 assert.ok(camera,'camera button available');
 return {camera,status,values,calls};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const good=harness(JSON.stringify({'place-a':['photo-A'],'place-b':['keep']}));
 good.camera.click();await flush();await flush();
 good.camera.click();await flush();await flush();
 assert.deepEqual(JSON.parse(good.values.get('nearby-place-photo-links-v1')),
  {'place-a':['photo-A','photo-B'],'place-b':['keep']},
  'new associations are idempotent and unrelated places remain untouched');
 assert.ok(good.calls.length>=1,'first photo triggers album sync');
 assert.equal(good.calls[0].id,'tokyo');
 const cases=[
  ['{bad',/illisibles/],
  ['[]',/Format/],
  [JSON.stringify({'place-a':{lost:'photo-A'},'place-b':['keep']}),/existantes invalides/]
 ];
 for(const [raw,message] of cases){
  const h=harness(raw);h.camera.click();await flush();await flush();
  assert.equal(h.values.get('nearby-place-photo-links-v1'),raw,'corrupt raw data must never be overwritten');
  assert.match(h.status.textContent,message,'error shown to user');
  assert.equal(h.calls.length,0,'album write not started when local association failed');
 }
 console.log('PASS photo-place associations: idempotency, unrelated place preservation, corrupt local data never overwritten');
})().catch(err=>{console.error(err);process.exitCode=1;});
