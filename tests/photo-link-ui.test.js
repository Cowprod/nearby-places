'use strict';
// Behavioral DOM harness: verifies photo-link UI without an iOS runtime.
// PhotoKit itself is exercised only on a real iPhone.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('www/js/place-photos.js','utf8');
assert.equal(source,fs.readFileSync('public/js/place-photos.js','utf8'),'Cordova and preview photo code stay identical');

function harness(linked){
 const values=new Map([
  ['nearby-place-photo-links-v1',JSON.stringify({'place-a':linked})],
  ['nearby-collections-v2',JSON.stringify({
   collections:[{id:'collection-default',name:'Mes lieux'},{id:'tokyo',name:'Tokyo'}],
   memberships:[{placeId:'place-a',collectionId:'tokyo'}]
  })]
 ]);
 const localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,val)=>values.set(key,String(val))
 };
 const calls={nearby:0,add:[],remove:0};
 const window={NearbyPhotos:{
  nearby:(lat,lon,radius,ok)=>{calls.nearby++;ok({items:[{id:'asset-1'},{id:'asset-2'}]});},
  thumbnail:(id,ok)=>ok({dataUrl:'data:image/jpeg;base64,dummy'}),
  addToAlbum:(collection,title,ids,ok)=>{calls.add.push({collection,title,ids:Array.from(ids)});ok({count:ids.length});},
  pick:ok=>ok({ids:[]})
 }};
 function element(tag){
  return {
   tag,children:[],parent:null,dataset:{},style:{},attributes:{},hidden:false,textContent:'',
   setAttribute(key,val){this.attributes[key]=val;},
   append(...items){items.forEach(item=>{item.parent=this;this.children.push(item);});},
   replaceChildren(...items){this.children.forEach(item=>{item.parent=null;});this.children=[];this.append(...items);},
   remove(){if(this.parent){this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null;}}
  };
 }
 const document={body:element('body'),createElement:element};
 vm.runInNewContext(source,{window,document,localStorage,Promise,Set,Map,Array,Error});
 const place={id:'place-a',name:'Test',latitude:35.7,longitude:139.7};
 window.NearbyPlacePhotos.open(place,false,'Tokyo');
 const dialog=document.body.children[0].children[0];
 const gallery=dialog.children[3],actions=dialog.children[4],heading=dialog.children[6],candidates=dialog.children[7];
 const tileIds=grid=>grid.children.filter(tile=>tile.dataset.photoId).map(tile=>tile.dataset.photoId);
 const toggle=tile=>tile.children.find(child=>child.tag==='button');
 const icon=tile=>toggle(tile).children.find(child=>child.tag==='i');
 const stored=()=>JSON.parse(localStorage.getItem('nearby-place-photo-links-v1'))['place-a'];
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {window,calls,gallery,candidates,heading,actions,tileIds,toggle,icon,stored,flush};
}

(async function(){
 const h=harness(['asset-1']);
 assert.deepEqual(h.tileIds(h.gallery),['asset-1'],'associated asset is shown above add tools');
 assert.match(h.icon(h.gallery.children[0]).className,/fa-times-circle\s+text-warning/,'unlink icon uses requested warning color');
 assert.equal(h.toggle(h.gallery.children[0]).attributes['aria-label'],'Délier la photo');
 assert.equal(h.tileIds(h.candidates).length,0,'suggestions start closed');

 const search=h.actions.children.find(button=>button.textContent==='Photos à proximité');
 assert.ok(search,'nearby search control is present');
 search.onclick();
 await h.flush();
 assert.deepEqual(h.tileIds(h.candidates),['asset-2'],'already-linked photo is excluded from proposals');
 assert.match(h.icon(h.candidates.children[0]).className,/fa-plus-circle\s+text-success/,'link icon uses requested success color');
 assert.equal(h.toggle(h.candidates.children[0]).attributes['aria-label'],'Lier la photo');

 h.toggle(h.candidates.children[0]).onclick();
 await h.flush();
 assert.deepEqual(h.stored(),['asset-1','asset-2'],'link persists local photo-place association');
 assert.deepEqual(h.tileIds(h.gallery),['asset-1','asset-2'],'linked photo moves into gallery');
 assert.deepEqual(h.tileIds(h.candidates),[],'linked photo disappears from suggestions immediately');
 assert.deepEqual(h.calls.add[0],{collection:'tokyo',title:'Nearby Places — Tokyo',ids:['asset-2']},'association syncs PhotoKit album');

 h.toggle(h.gallery.children[1]).onclick();
 await h.flush();
 assert.deepEqual(h.stored(),['asset-1'],'unlink removes only local place link');
 assert.deepEqual(h.tileIds(h.candidates),['asset-2'],'unlink returns to open proposals without another native search');
 assert.equal(h.calls.nearby,1,'no repeated PhotoKit geolocation query on unlink');

 h.toggle(h.gallery.children[0]).onclick();
 await h.flush();
 assert.deepEqual(h.tileIds(h.candidates),['asset-2','asset-1'],'unlink of originally-linked photo also returns to proposals');
 h.toggle(h.candidates.children[0]).onclick();
 h.toggle(h.gallery.children[0]).onclick();
 await h.flush();
 assert.equal(new Set(h.tileIds(h.candidates)).size,h.tileIds(h.candidates).length,'repeated link/unlink never duplicates suggestions');
 assert.equal(h.calls.remove,0,'no native removal is requested by detaching photos');

 const closed=harness(['asset-1']);
 closed.toggle(closed.gallery.children[0]).onclick();
 await closed.flush();
 assert.deepEqual(closed.tileIds(closed.candidates),[],'unlink does not open nearby search without user action');
 assert.deepEqual(closed.stored(),[],'unlink still updates local associations');

 console.log('PASS photo UI: corner icons, accessible link/unlink, cached nearby reappearance, no duplicate proposals or PhotoKit deletion');
})().catch(err=>{console.error(err);process.exitCode=1;});
