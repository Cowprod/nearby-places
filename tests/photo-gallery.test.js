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
assert.match(native,/edge==1280\?PHImageContentModeAspectFit:PHImageContentModeAspectFill/,
 'full-screen preview preserves portrait and panorama ratios while grid thumbnails may crop');
assert.match(native,/options\.networkAccessAllowed=YES/,'iCloud-only assets can load an on-demand thumbnail or preview');
assert.match(native,/PHImageResultIsInCloudKey/,'a missing iCloud rendition has a specific offline diagnostic');
// Photo access can change in Settings while an iCloud rendition is pending.
// Native previews must reject revoked read permission without modifying links.
const thumbNative=native.split('- (void)thumbnail:(CDVInvokedUrlCommand*)cmd {')[1].split('- (void)pick:')[0];
assert.match(thumbNative,/PHAuthorizationStatus readAccess=\[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite\]/,
 'thumbnail checks current Photos read permission before fetching assets');
assert.ok(thumbNative.indexOf('PHAuthorizationStatus readAccess=')<thumbNative.indexOf('fetchAssetsWithLocalIdentifiers:'),
 'permission check precedes the image fetch');
assert.match(thumbNative,/readAccess!=PHAuthorizationStatusAuthorized&&readAccess!=PHAuthorizationStatusLimited/,
 'limited access is supported but add-only authorization is not treated as read access');
assert.match(thumbNative,/PHAuthorizationStatus latestReadAccess=\[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite\]/,
 'PhotoKit completion rechecks permission after an iCloud download');
assert.ok(thumbNative.indexOf('PHAuthorizationStatus latestReadAccess=')<thumbNative.indexOf('UIImageJPEGRepresentation('),
 'revoked authorization cannot return the loaded image');
assert.doesNotMatch(thumbNative,/deleteAssets|deleteAssetCollections|removeAssets/,
 'permission errors never delete photographs');
const deliveryGuard=thumbNative.indexOf('finished=YES;');
const backgroundGuard=thumbNative.indexOf('if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive)',deliveryGuard);
assert.ok(deliveryGuard>=0&&backgroundGuard>deliveryGuard&&backgroundGuard<thumbNative.indexOf('UIImageJPEGRepresentation('),
 'an iCloud thumbnail completing after app suspension is rejected before creating its WebView payload');
assert.match(thumbNative.slice(backgroundGuard),/actualisez l'album au retour/,
 'interrupted iCloud downloads instruct the user to retry after returning to the foreground');

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
  replaceChildren(...items){this.children=items;},
  setAttribute(k,v){this.attributes[k]=v;},
  removeAttribute(k){if(k==='src')this.src='';else delete this.attributes[k];},
  addEventListener(){},
  remove(){this.removed=true;}
 };
}
const listeners=new Map(),timers=new Map();let timerSequence=0;
const document={body:element('body'),createElement:element,
 addEventListener:(name,handler)=>listeners.set(name,handler),
 removeEventListener:(name,handler)=>{if(listeners.get(name)===handler)listeners.delete(name);}
};
const ids=Array.from({length:26},(_,i)=>'photo-'+i);
const effects=[];
const stored=new Map([
 ['nearby-place-photo-links-v1',JSON.stringify({'place-1':['photo-0','photo-2'],'place-2':['photo-0']})],
 ['nearby-places-v1',JSON.stringify([{id:'place-1',name:'Musée'},{id:'place-2',name:'Librairie'}])]
]);
const localStorage={getItem:key=>stored.has(key)?stored.get(key):null};
const window={localStorage,NearbyPhotos:{
 listAlbumAssets:(id,offset,limit,ok)=>{effects.push({method:'list',id,offset,limit});ok({exists:true,count:26,offset,ids:ids.slice(offset,offset+limit)});},
 thumbnail:(id,ok)=>{effects.push({method:'thumbnail',id});ok({dataUrl:'data:image/jpeg;base64,thumb'});},
 preview:(id,ok)=>{effects.push({method:'preview',id});ok({dataUrl:'data:image/jpeg;base64,preview'});},
 addToAlbum:()=>{throw Error('gallery must not write Photos albums');},
 renameAlbum:()=>{throw Error('gallery must not rename albums');}
}};
vm.runInNewContext(ui,{window,document,Promise,Set,Number,Error,Array,
 setTimeout:callback=>{const id=++timerSequence;timers.set(id,callback);return id;},
 clearTimeout:id=>timers.delete(id)
});
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
 assert.equal(viewer.children[3].textContent,'Lieux associés : Musée, Librairie','preview displays existing local photo-place links');
 viewer.children[1].children[2].onclick();await flush();
 assert.equal(effects.filter(e=>e.method==='preview').at(-1).id,'photo-1','next navigates within the gallery');
 assert.equal(viewer.children[3].textContent,'Aucun lieu Nearby Places associé.','a photo in the album may not have a place link');
 const originalLinks=stored.get('nearby-place-photo-links-v1');
 stored.set('nearby-place-photo-links-v1','{broken');
 viewer.children[1].children[0].onclick();await flush();
 assert.match(viewer.children[3].textContent,/Associations locales illisibles/,'corrupt links are reported instead of silently discarded');
 assert.equal(stored.get('nearby-place-photo-links-v1'),'{broken','preview never rewrites corrupt local links');
 stored.set('nearby-place-photo-links-v1',originalLinks);
 viewer.children[0].onclick();
 assert.equal(viewer.hidden,true,'closing the preview returns to the album');
 session.close();
 assert.equal(overlay.removed,true);
 assert.equal(viewer.removed,true);
 assert.deepEqual(new Set(effects.map(x=>x.method)),new Set(['list','thumbnail','preview']),'gallery is strictly read-only');
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:false,count:0,offset,ids:[]});
 const absent=window.NearbyAlbumGallery.open({id:'never-created',name:'Sans photos'});
 await flush();
 const emptyPanel=document.body.children.at(-2).children[0];
 assert.match(emptyPanel.children[2].textContent,/Aucun album Photos/,'a never-created collection has no Photos album');
 assert.equal(emptyPanel.children[3].children.length,0,'empty preview never generates photos');
 assert.equal(emptyPanel.children[4].hidden,true,'an empty collection cannot paginate');
 absent.close();
 // A deleted album can be rebuilt explicitly from durable place-photo links.
 // Merely opening the gallery must never mutate PhotoKit.
 let rebuilt=false,rebuildCalls=0,hasLinksCalls=0;
 window.NearbyPlacePhotos={
  hasLinkedAlbumPhotos:id=>{hasLinksCalls++;return id==='deleted-album';},
  restoreCollectionAlbum:id=>{rebuildCalls++;rebuilt=true;return Promise.resolve({albumId:'restored',unavailableCount:0});}
 };
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>{
  ok(rebuilt?{exists:true,count:1,offset,ids:['photo-0']}:{exists:false,count:0,offset,ids:[]});
 };
 const missing=window.NearbyAlbumGallery.open({id:'deleted-album',name:'Tokyo supprimé'});
 await flush();
 const repairPanel=document.body.children.at(-2).children[0];
 const restoreButton=repairPanel.children[6];
 assert.equal(restoreButton.hidden,false,'repair is offered only with a durable photo link');
 assert.equal(rebuildCalls,0,'opening a missing album never writes to Photos');
 restoreButton.onclick();
 await flush();await flush();
 assert.equal(rebuildCalls,1,'explicit repair performs exactly one reconstruction');
 assert.equal(repairPanel.children[3].children.length,1,'gallery reloads recovered album after repair');
 assert.equal(restoreButton.hidden,true,'repair button disappears when the album exists');
 missing.close();
 // An album with no linked photos never offers reconstruction.
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:false,count:0,offset,ids:[]});
 const unlinked=window.NearbyAlbumGallery.open({id:'empty-album',name:'Sans liens'});
 await flush();
 assert.equal(document.body.children.at(-2).children[0].children[6].hidden,true);
 assert.equal(rebuildCalls,1,'empty album does not trigger native writes');
 unlinked.close();
 // Failed recovery keeps all associations, displays an actionable error.
 window.NearbyPlacePhotos.hasLinkedAlbumPhotos=()=>true;
 window.NearbyPlacePhotos.restoreCollectionAlbum=()=>Promise.reject(Error('Accès Photos refusé'));
 const failed=window.NearbyAlbumGallery.open({id:'deleted-album',name:'Accès refusé'});
 await flush();
 const failedPanel=document.body.children.at(-2).children[0];
 failedPanel.children[6].onclick();
 await flush();await flush();
 assert.match(failedPanel.children[5].textContent,/Reconstruction impossible : Accès Photos refusé/);
 failed.close();
 // A full-access failure is reported, and no local association is changed.
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok,fail)=>fail('Accès Photos refusé');
 const denied=window.NearbyAlbumGallery.open({id:'restricted',name:'Privée'});
 await flush();
 const denial=document.body.children.at(-2).children[0].children[5].textContent;
 assert.match(denial,/Accès Photos refusé/);
 denied.close();
 // iCloud downloads may be slow: launching all 24 thumbnails at once can flood
 // the Cordova bridge and consume unnecessary image memory. Limit in-flight
 // native thumbnail requests and discard the pending queue on close.
 const started=[],pending=[];
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:true,count:26,offset,ids:ids.slice(offset,offset+limit)});
 window.NearbyPhotos.thumbnail=(id,ok)=>{
  started.push(id);
  pending.push(()=>ok({dataUrl:'data:image/jpeg;base64,delayed'}));
 };
 const slow=window.NearbyAlbumGallery.open({id:'slow-icloud',name:'iCloud'});
 await flush();
 assert.equal(document.body.children.at(-2).children[0].children[3].children.length,24,
   'the first album page still renders 24 placeholders');
 assert.equal(started.length,4,'at most four thumbnail requests start concurrently');
 pending[0]();await flush();
 assert.equal(started.length,5,'a completed thumbnail starts exactly one pending request');
 slow.close();
 pending.slice(1).forEach(complete=>complete());
 await flush();
 assert.equal(started.length,5,'closing the album cancels queued thumbnail launches');
 assert.equal(window.localStorage.getItem('nearby-place-photo-links-v1'),originalLinks,
   'throttling thumbnails does not alter photo-place associations');
 // A PhotoKit failure has an actionable, sanitized tile label. In particular,
 // iCloud-only originals and revoked Photos access are not reported alike.
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:true,count:1,offset,ids:['photo-0']});
 window.NearbyPhotos.thumbnail=(id,ok,fail)=>fail('Photo dans iCloud indisponible : vérifiez la connexion Internet');
 const cloudError=window.NearbyAlbumGallery.open({id:'cloud-offline',name:'Hors ligne'});
 await flush();
 const cloudTile=document.body.children.at(-2).children[0].children[3].children[0];
 assert.match(cloudTile.children[1].textContent,/iCloud indisponible/,'offline iCloud assets show a retryable diagnostic');
 cloudError.close();
 window.NearbyPhotos.thumbnail=(id,ok,fail)=>fail('Accès Photos modifié pendant le chargement');
 const permissionError=window.NearbyAlbumGallery.open({id:'permission-changed',name:'Accès'});
 await flush();
 const permissionTile=document.body.children.at(-2).children[0].children[3].children[0];
 assert.match(permissionTile.children[1].textContent,/Accès Photos à vérifier/,'revoked authorization gives a distinct diagnostic');
 permissionError.close();
 assert.equal(stored.get('nearby-place-photo-links-v1'),originalLinks,
   'thumbnail errors do not rewrite any durable photo-place associations');
 // iOS permission can change in Settings while this gallery is visible.
 // Retrying must be read-only and retain local photo-place associations.
 let allowed=false,permissionReads=0;
 window.NearbyPhotos.thumbnail=(id,ok)=>ok({dataUrl:'data:image/jpeg;base64,retry'});
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok,fail)=>{
  permissionReads++;
  if(!allowed)fail('Accès Photos refusé');
  else ok({exists:true,count:1,offset,ids:['photo-0']});
 };
 const permissions=window.NearbyAlbumGallery.open({id:'permissions',name:'Permissions'});
 await flush();
 const permissionsPanel=document.body.children.at(-2).children[0];
 assert.match(permissionsPanel.children[5].textContent,/Accès Photos refusé/);
 allowed=true;
 permissionsPanel.children[7].onclick();await flush();
 assert.equal(permissionReads,2,'retry rechecks Photos permissions');
 assert.equal(permissionsPanel.children[3].children.length,1,'album appears after permission is granted');
 assert.equal(stored.get('nearby-place-photo-links-v1'),originalLinks,'refresh retains local links');
 const onResume=listeners.get('resume');
 assert.equal(typeof onResume,'function');
 onResume();onResume();
 assert.equal(timers.size,1,'repeated resumes coalesce into one retry');
 const scheduled=Array.from(timers.entries())[0];
 timers.delete(scheduled[0]);scheduled[1]();await flush();
 assert.equal(permissionReads,3,'foreground return refreshes the existing album');
 permissions.close();
 assert.equal(listeners.has('resume'),false,'closed galleries unsubscribe from resume');
 // Slow iCloud reads from a discarded generation cannot freeze a fresh page.
 const stalled=[],current=[];let generation='stalled';
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>ok({exists:true,count:8,offset,ids:Array.from({length:8},(_,i)=>'fresh-'+i).slice(offset,offset+limit)});
 window.NearbyPhotos.thumbnail=(id,ok)=>(generation==='stalled'?stalled:current).push(ok);
 const refreshed=window.NearbyAlbumGallery.open({id:'stalled-icloud',name:'iCloud'});
 await flush();
 const refreshedPanel=document.body.children.at(-2).children[0];
 assert.equal(stalled.length,4,'first generation starts at most four requests');
 generation='current';
 refreshedPanel.children[7].onclick();await flush();
 assert.equal(current.length,4,'new generation can start four requests while older iCloud calls are stalled');
 const newTile=refreshedPanel.children[3].children[0];
 stalled[0]({dataUrl:'data:obsolete'});await flush();
 assert.equal(newTile.children[0].src,'','stale result cannot paint a refreshed tile');
 assert.equal(current.length,4,'stale completion never releases a new-generation slot');
 current[0]({dataUrl:'data:fresh'});await flush();
 assert.equal(newTile.children[0].src,'data:fresh','fresh thumbnail is displayed');
 assert.equal(current.length,5,'fresh completion releases one slot for the next image');
 refreshed.close();
 assert.equal(stored.get('nearby-place-photo-links-v1'),originalLinks,'refresh cannot change photo associations');
 // Old in-flight pagination must not contaminate an updated album snapshot.
 const pendingPages=[];
 window.NearbyPhotos.listAlbumAssets=(id,offset,limit,ok)=>pendingPages.push(ok);
 const concurrent=window.NearbyAlbumGallery.open({id:'changing',name:'Données changeantes'});
 await flush();
 const concurrentPanel=document.body.children.at(-2).children[0];
 assert.equal(pendingPages.length,1);
 concurrentPanel.children[7].onclick();await flush();
 assert.equal(pendingPages.length,2,'refresh starts a new page request');
 pendingPages[0]({exists:true,count:1,offset:0,ids:['obsolete']});await flush();
 assert.equal(concurrentPanel.children[3].children.length,0,'stale page is discarded');
 pendingPages[1]({exists:true,count:1,offset:0,ids:['recent']});await flush();
 assert.deepEqual(concurrentPanel.children[3].children.map(tile=>tile.dataset.photoId),['recent']);
 concurrent.close();
 assert.equal(stored.get('nearby-place-photo-links-v1'),originalLinks);
 console.log('PASS PhotoKit album gallery: paged IDs, native read-only, thumb and preview, no duplicates, permissions, bounded iCloud thumbnails');
})().catch(error=>{console.error(error);process.exitCode=1;});
