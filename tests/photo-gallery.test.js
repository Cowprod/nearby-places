'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ui=fs.readFileSync('www/js/album-gallery.js','utf8');
const native=fs.readFileSync('local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m','utf8');
const bridge=fs.readFileSync('local-plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js','utf8');
assert.equal(ui,fs.readFileSync('public/js/album-gallery.js','utf8'),'Cordova and web album preview use the same code');
const html=fs.readFileSync('www/index.html','utf8');
assert.equal(html,fs.readFileSync('public/index.html','utf8'),'HTML and CSS mirrors match');
assert.match(html,/src="js\/album-gallery\.js"/,'the viewer is loaded before collections UI');
assert.ok(html.indexOf('js/album-gallery.js')<html.indexOf('js/collections-ui.js'));
assert.match(fs.readFileSync('www/js/collections-ui.js','utf8'),/NearbyAlbumGallery\.open\(\{id:collection\.id,name:collection\.name\}\)/,'collection detail opens the correct album by stable ID');
const readMethod=native.split('- (void)listAlbumAssets:(CDVInvokedUrlCommand *)cmd {')[1]?.split('- (void)renameAlbum:')[0];
assert.ok(readMethod,'PhotoKit exposes paginated album listing');
assert.match(readMethod,/albumForCollection:collectionId/,'the album is located through its mapped PhotoKit ID');
assert.match(readMethod,/fetchAssetsInAssetCollection:album/,'the gallery contains photos actually in the album');
assert.match(readMethod,/mediaType == %d/,'list only images');
assert.match(readMethod,/offsetArg\.doubleValue>1000000/,'invalid offsets are bounded');
assert.match(readMethod,/limitArg\.doubleValue>48/,'each native page is bounded');
assert.match(readMethod,/if\(!\[self albumLinks\]\[collectionId\]\)/,'no album exists until the first linked photo');
assert.doesNotMatch(readMethod,/performChanges|deleteAssets|deleteAssetCollections|removeAssets|storeAlbum\(/,'opening a gallery never changes photos or album mappings');
assert.match(native,/NSUInteger edge=320/,'existing thumbnails remain 320 px');
assert.match(native,/integerValue\]==1280/,'the preview can request a larger image');

const calls=[];
const bridgeModule={exports:{}};
vm.runInNewContext(bridge,{module:bridgeModule,require:()=>((ok,fail,service,method,args)=>calls.push({service,method,args:Array.from(args)}))});
bridgeModule.exports.listAlbumAssets('collection-1',0,24,()=>{},()=>{});
bridgeModule.exports.preview('asset-1',()=>{},()=>{});
assert.deepEqual(calls,[
 {service:'NearbyPhotos',method:'listAlbumAssets',args:['collection-1',0,24]},
 {service:'NearbyPhotos',method:'thumbnail',args:['asset-1',1280]}
]);

function element(tag){
 return {tag,children:[],dataset:{},hidden:false,attributes:{},style:{},src:'',textContent:'',
  append(...items){this.children.push(...items);},
  setAttribute(k,v){this.attributes[k]=v;},
  removeAttribute(k){if(k==='src')this.src='';else delete this.attributes[k];},
  addEventListener(){},
  remove(){this.removed=true;}
 };
}
const document={body:element('body'),createElement:element};
const ids=Array.from({length:26},(_,i)=>'photo-'+i);
const effects=[];
const window={NearbyPhotos:{
 listAlbumAssets:(id,offset,limit,ok)=>{effects.push({method:'list',id,offset,limit});ok({exists:true,count:26,offset,ids:ids.slice(offset,offset+limit)});},
 thumbnail:(id,ok)=>{effects.push({method:'thumbnail',id});ok({dataUrl:'data:image/jpeg;base64,thumb'});},
 preview:(id,ok)=>{effects.push({method:'preview',id});ok({dataUrl:'data:image/jpeg;base64,preview'});},
 addToAlbum:()=>{throw Error('gallery must not write Photos albums');},
 renameAlbum:()=>{throw Error('gallery must not rename albums');}
}};
vm.runInNewContext(ui,{window,document,Promise,Set,Number,Error,Array});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const session=window.NearbyAlbumGallery.open({id:'collection-1',name:'Tokyo'});
 await flush();
 const overlay=document.body.children[0],viewer=document.body.children[1];
 const dialog=overlay.children[0],counter=dialog.children[2],grid=dialog.children[3],more=dialog.children[4];
 assert.deepEqual(effects[0],{method:'list',id:'collection-1',offset:0,limit:24});
 assert.equal(grid.children.length,24,'first page does not load an entire photo library');
 assert.match(counter.textContent,/26 photo/);
 assert.equal(more.hidden,false);
 more.onclick();await flush();
 assert.deepEqual(effects.filter(e=>e.method==='list').map(e=>e.offset),[0,24]);
 assert.equal(grid.children.length,26);
 assert.equal(more.hidden,true);
 assert.equal(new Set(grid.children.map(x=>x.dataset.photoId)).size,26,'no duplicate thumbnails');
 grid.children[0].onclick();await flush();
 assert.equal(viewer.hidden,false);
 assert.equal(effects.filter(e=>e.method==='preview').length,1,'tapping a thumbnail loads the larger preview');
 assert.equal(viewer.children[1].children[1].src,'data:image/jpeg;base64,preview');
 viewer.children[1].children[2].onclick();await flush();
 assert.equal(effects.filter(e=>e.method==='preview').at(-1).id,'photo-1','next navigates within the gallery');
 viewer.children[0].onclick();
 assert.equal(viewer.hidden,true,'closing the preview returns to the album');
 session.close();
 assert.equal(overlay.removed,true);
 assert.equal(viewer.removed,true);
 assert.deepEqual(new Set(effects.map(x=>x.method)),new Set(['list','thumbnail','preview']),'gallery is strictly read-only');
 const absent=window.NearbyAlbumGallery.open({id:'never-created',name:'Sans photos'});
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:false,count:0,offset,ids:[]});
 // The initial page has already been scheduled; its native call happens in a microtask.
 await flush();
 absent.close();
 // A full-access failure is reported, and no local association is changed.
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok,fail)=>fail('Accès Photos refusé');
 const denied=window.NearbyAlbumGallery.open({id:'restricted',name:'Privée'});
 await flush();
 const denial=document.body.children.at(-2).children[0].children[5].textContent;
 assert.match(denial,/Accès Photos refusé/);
 denied.close();
 console.log('PASS PhotoKit album gallery: paged IDs, native read-only, thumb and preview, no duplicates, permissions');
})().catch(error=>{console.error(error);process.exitCode=1;});
