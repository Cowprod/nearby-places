'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Pure JS coverage: PhotoKit is mocked, originals and place associations stay local.
const values=new Map();
const localStorage={
 getItem:k=>values.has(k)?values.get(k):null,
 setItem:(k,v)=>values.set(k,v)
};
values.set('nearby-place-photo-links-v1',JSON.stringify({
 place1:['asset-A','asset-B','asset-A'],
 place2:['asset-A'],
 place3:[]
}));
const window={};
vm.runInNewContext(fs.readFileSync('www/js/place-photos.js','utf8'),{window,localStorage,Promise,Set,Map,Array,Error});
const writes=[];
window.NearbyPhotos={
 addToAlbum:(id,title,ids,ok)=>{writes.push({id,title,ids:Array.from(ids)});ok({collectionId:id});},
 renameAlbum:(id,title,ok)=>{writes.push({rename:id,title});ok({renamed:true});}
};
const state={
 collections:[
  {id:'collection-default',name:'Mes lieux'},
  {id:'c-1',name:'Tokyo'},
  {id:'c-2',name:'Tokyo'},
  {id:'c-3',name:'Paris'}
 ],
 memberships:[
  {placeId:'place1',collectionId:'c-1'},
  {placeId:'place2',collectionId:'c-1'},
  {placeId:'place1',collectionId:'c-2'},
  {placeId:'place3',collectionId:'c-3'},
  {placeId:'place1',collectionId:'collection-default'}
 ]
};
(async()=>{
 await window.NearbyPlacePhotos.syncMemberships(state);
 assert.equal(writes.filter(x=>x.id).length,2,'albums are created lazily, only with linked photos');
 assert.deepEqual(writes[0],{id:'c-1',title:'Nearby Places — Tokyo',ids:['asset-A','asset-B']});
 assert.deepEqual(writes[1],{id:'c-2',title:'Nearby Places — Tokyo',ids:['asset-A','asset-B']});
 assert.deepEqual(writes[2],{rename:'c-3',title:'Nearby Places — Paris'},'empty collection checks for a previously created album without adding photos');
 assert.deepEqual(JSON.parse(localStorage.getItem('nearby-place-photo-links-v1')).place1,['asset-A','asset-B','asset-A'],'album sync never rewrites place-photo links');
 await window.NearbyPlacePhotos.renameCollection('c-2','Tokyo 2026');
 assert.deepEqual(writes[3],{rename:'c-2',title:'Nearby Places — Tokyo 2026'},'rename uses collection ID, not ambiguous title');
 // A collection whose last place-photo link was removed may still have a
 // PhotoKit album with originals: resume must retry its missed rename.
 const renameAttempts=[];
 const emptyLinksState={collections:state.collections,memberships:[]};
 window.NearbyPhotos.addToAlbum=()=>{throw Error('an empty reconciliation must not create any albums');};
 window.NearbyPhotos.renameAlbum=(id,title,ok,fail)=>{
  renameAttempts.push({id,title});
  if(id==='c-3')fail('Accès complet à Photos requis');
  else ok({renamed:false});
 };
 await assert.rejects(window.NearbyPlacePhotos.syncMemberships(emptyLinksState),/Renommage \[c-3\].*Accès complet/);
 assert.deepEqual(renameAttempts.map(x=>x.id),['c-1','c-2','c-3'],'one bad album does not starve other empty collections');
 const beforeRetry=localStorage.getItem('nearby-place-photo-links-v1');
 window.NearbyPhotos.renameAlbum=(id,title,ok)=>{renameAttempts.push({id,title});ok({renamed:id==='c-3'});};
 await window.NearbyPlacePhotos.syncMemberships(emptyLinksState);
 assert.equal(renameAttempts.filter(x=>x.id==='c-3').length,2,'resume retries a failed rename with no current photo links');
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),beforeRetry,'rename retries never remove place-photo associations');
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{writes.push({id,title,ids:Array.from(ids)});ok({collectionId:id});};
 // Cordova bridge must preserve the argument order expected by native PhotoKit.
 const bridge={exports:{}},calls=[];
 vm.runInNewContext(fs.readFileSync('local-plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js','utf8'),{
  module:bridge,require:()=>((ok,fail,service,method,args)=>calls.push({service,method,args:Array.from(args)}))
 });
 bridge.exports.addToAlbum('c-1','Nearby Places — Tokyo',['asset-A'],()=>{},()=>{});
 bridge.exports.renameAlbum('c-1','Nearby Places — Tokyo 2026',()=>{},()=>{});
 assert.deepEqual(calls[0],{service:'NearbyPhotos',method:'addToAlbum',args:['c-1','Nearby Places — Tokyo',['asset-A']]});
 assert.deepEqual(calls[1],{service:'NearbyPhotos',method:'renameAlbum',args:['c-1','Nearby Places — Tokyo 2026']});
 const native=fs.readFileSync('local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m','utf8');
 assert.match(native,/NSMutableOrderedSet<NSString/,'PHPicker deduplicates selected local identifiers');
 assert.match(native,/@"selectedCount"/,'PHPicker reports total selected items');
 assert.match(native,/@"unavailableCount"/,'PHPicker reports selections without PHAsset identifiers');
 const pickerImpl=native.split('- (void)picker:(PHPickerViewController*)picker didFinishPicking:')[1].split('// Stable mapping:')[0];
 assert.ok(native.includes('if(self.viewController.presentedViewController){'),'PHPicker refuses to open over an existing native modal');
 assert.ok(native.includes('Fermez la fenêtre actuelle avant de choisir des photos'),'picker modal collision reports a user-visible error');
 assert.ok(pickerImpl.includes('[picker dismissViewControllerAnimated:YES completion:^{'),'picker results wait for native dismissal');
 assert.ok(pickerImpl.includes('NSString *callback=[self.pending copy];'),'picker pins the original callback before dismissal');
 assert.ok(pickerImpl.includes('[self replyTo:callback value:payload error:nil]'),'pending selection callback resolves only after dismissal');
 assert.doesNotMatch(pickerImpl,/replyTo:self\.pending/,'picker never replies to a newer request after dismissal');
 // Camera completion can race dismissal, PhotoKit permission prompts and
 // the next user action. The original callback must remain attached to its
 // capture until UIKit has dismissed the sheet AND Photos has finished saving.
 const cameraImpl=native.split('- (void)imagePickerController:(UIImagePickerController*)picker didFinishPickingMediaWithInfo:')[1].split('- (void)nearby:')[0];
 assert.ok(cameraImpl,'camera completion delegate is implemented');
 assert.match(cameraImpl,/NSString \*callback=\[self\.pending copy\];/,'capture pins its Cordova callback before asynchronous work');
 assert.match(cameraImpl,/\[picker dismissViewControllerAnimated:YES completion:\^\{/,'save and error paths wait for camera sheet dismissal');
 assert.ok(cameraImpl.indexOf('performChanges:')>cameraImpl.indexOf('[picker dismissViewControllerAnimated:YES completion:^{'),
  'PhotoKit save starts after UIKit completes the camera dismissal');
 assert.match(cameraImpl,/replyTo:callback value:@\{@"id":identifier\}/,'saved asset is returned to its original callback');
 assert.match(cameraImpl,/dispatch_async\(dispatch_get_main_queue\(\),\^\{\[self replyTo:callback value:nil error:@"Accès Photos refusé"\];\}\)/,
  'a denied asynchronous Photos permission completes the same callback on the main queue');
 assert.doesNotMatch(cameraImpl,/replyTo:self\.pending/,'late PhotoKit callbacks never target another camera or picker operation');
 const cameraCancel=native.split('- (void)imagePickerControllerDidCancel:(UIImagePickerController*)picker {')[1].split('- (void)imagePickerController:(UIImagePickerController*)picker didFinishPickingMediaWithInfo:')[0];
 assert.ok(cameraCancel,'camera cancellation delegate is implemented');
 assert.match(cameraCancel,/NSString \*callback=\[self\.pending copy\];/,'camera cancel keeps its own callback identity');
 assert.match(cameraCancel,/dismissViewControllerAnimated:YES completion:\^\{/,'camera cancel waits for UIKit dismissal');
 assert.match(cameraCancel,/replyTo:callback value:@\{@"cancelled":@YES\}/,'cancellation is sent to original camera request');
 assert.doesNotMatch(cameraCancel,/replyTo:self\.pending/,'late camera cancellation cannot resolve a later request');

 // User can leave the app while iOS displays a camera authorization prompt.
 // Delayed authorization must not attempt UIKit presentation in background,
 // and must always complete the callback belonging to the original request.
 const captureImpl=native.split('- (void)capture:(CDVInvokedUrlCommand*)cmd {')[1].split('- (void)imagePickerControllerDidCancel:')[0];
 assert.ok(captureImpl,'camera entrypoint exists');
 assert.match(captureImpl,/NSString \*callback=\[cmd\.callbackId copy\];/,'camera request pins original callback before requesting permission');
 assert.match(captureImpl,/if\(!\[self\.pending isEqualToString:callback\]\)return;/,'late permission callback cannot act on another camera request');
 assert.match(captureImpl,/applicationState!=UIApplicationStateActive/,'camera must not present UI while app is inactive');
 assert.match(captureImpl,/Application en arrière-plan/,'camera interruption gives an actionable error');
 assert.doesNotMatch(captureImpl,/replyTo:self\.pending/,'camera permission flow never resolves a newer callback');
 const nativePicker=native.split('- (void)pick:(CDVInvokedUrlCommand*)cmd {')[1].split('- (void)picker:(PHPickerViewController*)picker didFinishPicking:')[0];
 assert.match(nativePicker,/applicationState!=UIApplicationStateActive/,'PHPicker must not present UI while app is inactive');
 assert.match(nativePicker,/replyTo:cmd\.callbackId value:nil error:@\"Application en arrière-plan/,'PHPicker interruption releases its callback');
 // PhotoKit result handlers may be invoked with degraded and final images.
 // Only the first *terminal* callback can resolve Cordova. The original photo
 // remains untouched when a thumbnail is unavailable or interrupted.
 const thumbnailImpl=native.split('- (void)thumbnail:(CDVInvokedUrlCommand*)cmd {')[1].split('- (void)pick:(CDVInvokedUrlCommand*)cmd {')[0];
 assert.match(thumbnailImpl,/__block BOOL finished=NO/,'thumbnail completion is tracked');
 assert.match(thumbnailImpl,/dispatch_async\(dispatch_get_main_queue\(\),\^\{/,'thumbnail callbacks serialize on main queue');
 assert.match(thumbnailImpl,/if\(finished\|\|\[info\[PHImageResultIsDegradedKey\] boolValue\]\)return;/,'degraded or duplicate thumbnail callbacks are ignored');
 assert.match(thumbnailImpl,/PHImageCancelledKey/,'PhotoKit cancellation is reported');
 assert.match(thumbnailImpl,/PHImageErrorKey/,'PhotoKit image errors are propagated');
 assert.doesNotMatch(thumbnailImpl,/deleteAssets|deleteAssetCollections/,'thumbnail failure cannot delete originals');


 // A Photos authorization callback can arrive after the app backgrounds
 // or after permission changes in Settings. Recheck before showing suggestions.
 const nearbyImpl=native.split('- (void)nearby:(CDVInvokedUrlCommand*)cmd {')[1].split('- (void)thumbnail:')[0];
 assert.ok(nearbyImpl,'native nearby-photo discovery is implemented');
 assert.match(nearbyImpl,/cmd\.arguments\.count<3/,'missing arguments are rejected before subscripting');
 assert.match(nearbyImpl,/respondsToSelector:@selector\(doubleValue\)/,'malformed arguments cannot invoke doubleValue on NSNull');
 assert.match(nearbyImpl,/void \(\^runIfStillAuthorized\)\(void\)=\^\{/,'photo discovery rechecks permissions after the prompt');
 assert.match(nearbyImpl,/dispatch_async\(dispatch_get_main_queue\(\),\^\{/,'authorization recheck uses the UIKit main queue');
 assert.match(nearbyImpl,/applicationState!=UIApplicationStateActive/,'inactive application never starts a new photo search');
 assert.match(nearbyImpl,/PHAuthorizationStatus current=\[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite\]/,'search uses current authorization');
 assert.match(nearbyImpl,/current==PHAuthorizationStatusAuthorized\|\|current==PHAuthorizationStatusLimited/,'limited access permits suggestions');
 assert.match(nearbyImpl,/if\(result==PHAuthorizationStatusAuthorized\|\|result==PHAuthorizationStatusLimited\)runIfStillAuthorized\(\)/,'prompt triggers a fresh check');
 assert.match(nearbyImpl,/dispatch_async\(dispatch_get_global_queue\(QOS_CLASS_USER_INITIATED,0\),\^\{/,'large PhotoKit searches do not block UIKit');
 assert.match(nearbyImpl,/PHAuthorizationStatus latest=\[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite\]/,'read authorization is checked again on worker queue');
 assert.match(nearbyImpl,/latest!=PHAuthorizationStatusAuthorized&&latest!=PHAuthorizationStatusLimited/,'revoked access is rejected before the worker scans assets');
 assert.ok(nearbyImpl.indexOf('PHAuthorizationStatus latest=')<nearbyImpl.indexOf('query();'),'query runs only after worker rechecks permission');
 assert.doesNotMatch(nearbyImpl,/deleteAssets|deleteAssetCollections|removeAssets/,'photo discovery never removes albums or originals');

 assert.match(native,/fetchAssetCollectionsWithLocalIdentifiers/,'albums are resolved through stable PhotoKit IDs');
 assert.match(native,/placeholderForCreatedAssetCollection/,'new album PhotoKit ID is persisted');
 assert.match(native,/PHAuthorizationStatusLimited/,'limited access explicitly handled');

 const albumAuth=native.split('- (void)withAlbumAuthorization:')[1].split('- (void)addToAlbum:')[0];
 assert.match(albumAuth,/void \(\^runIfStillAuthorized\)\(void\)=\^\{/,
   'native album permission decisions are rechecked before work');
 assert.match(albumAuth,/PHAuthorizationStatus current=\[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite\]/,
   'recheck uses current PhotoKit read-write permission, not an old prompt result');
 assert.match(albumAuth,/if\(current==PHAuthorizationStatusAuthorized\)\{work\(\);return;\}/,
   'album writes only run under currently authorized read-write access');
 assert.match(albumAuth,/if\(result==PHAuthorizationStatusAuthorized\)runIfStillAuthorized\(\);/,
   'async permission prompt completion rechecks authorization before album mutation');
 assert.doesNotMatch(albumAuth,/if\(result==PHAuthorizationStatusAuthorized\)work\(\);/,
   'stale permission completion cannot immediately mutate an album');
 assert.match(albumAuth,/Les associations aux lieux sont conservées/,
   'permission transition reports that links are retained');

 // Authorization can finish after the user backgrounds the app or revokes
 // access in Settings. Native operations must be gated again when queued on
 // the main thread; errors retain JS associations for foreground retry.
 const replyImpl=native.split('- (void)replyTo:')[1].split('- (void)capture:')[0];
 assert.match(replyImpl,/if\(\[NSThread isMainThread\]\)deliver\(\)/,
  'immediate Cordova delivery on the UIKit main thread');
 assert.match(replyImpl,/else dispatch_async\(dispatch_get_main_queue\(\),deliver\)/,
  'background PhotoKit results return to the UIKit main thread');
 assert.match(replyImpl,/if\(\[callback isEqualToString:self\.pending\]\)self\.pending=nil/,
  'late results cannot release a newer native operation');
 assert.match(albumAuth,/void \(\^runIfStillAuthorized\)\(void\)=\^\{\s*dispatch_async\(dispatch_get_main_queue\(\),\^\{/,
  'the final authorization check always executes on the main queue');
 assert.match(albumAuth,/dispatch_async\(dispatch_get_main_queue\(\),\^\{\s*if\(\[UIApplication sharedApplication\]\.applicationState!=UIApplicationStateActive\)/,
  'a backgrounded app never starts an authorization prompt or a new album write');
 assert.ok(albumAuth.indexOf('applicationState!=UIApplicationStateActive')<albumAuth.indexOf('PHAuthorizationStatus current='),
  'foreground is checked before authorization is re-evaluated');
 assert.ok(albumAuth.indexOf('PHAuthorizationStatus current=')<albumAuth.indexOf('if(current==PHAuthorizationStatusAuthorized){work();return;}'),
  'PhotoKit writes only follow a fresh permission check');
 assert.match(albumAuth,/synchronisation Photos reportée au retour\. Les associations aux lieux sont conservées/,
  'interrupted synchronization is reported without dropping photo-place links');
 assert.doesNotMatch(albumAuth,/deleteAssets|deleteAssetCollections|storeAlbum:nil/,
  'authorization errors cannot delete original photos or album mappings');

 assert.match(native,/fetchAssetsInAssetCollection:existing/,'native sync inspects existing album membership before adding');
 assert.match(native,/if\(!assetsToAdd\.count&&!needsRename\)/,'repeated reconciliation is a no-op');
 assert.match(native,/if\(needsRename\)change\.title=title/,'reconciliation repairs a missed rename');
 assert.match(native,/PHCollectionEditOperationRename/,'rename support checked before mutation');

 assert.match(native,/NSUInteger unavailableCount=identifiers\.count-assets\.count;/,'deleted photos are counted independently');
 assert.match(native,/if\(!assets\.count && !existing\)/,'all-inaccessible photos never create a new empty album');
 assert.match(native,/if\(!assets\.count && !existing\)[\s\S]*?BOOL needsRename=existing/,'an existing album can still be renamed when all linked photos are missing');
 assert.match(native,/if\(!\[present containsObject:asset\.localIdentifier\]\)\[assetsToAdd addObject:asset\]/,'valid photos are still added when other links are stale');
 assert.match(native,/"unavailableCount":@\(unavailableCount\)/,'native result reports stale photo links');
 assert.doesNotMatch(native,/assets\.count!=identifiers\.count/,'a single missing asset must never reject all valid photos');

 assert.doesNotMatch(native,/deleteAssetCollections/,'never delete photo albums automatically');
 assert.match(native,/if\(!\[self albumLinks\]\[collectionId\]\)/,'rename of never-created albums is a native no-op');
 assert.match(native,/if\(!\[self albumLinks\]\[collectionId\]\)[\s\S]*?withAlbumAuthorization/,'no album means no permission request or empty-album creation');

 const hook=fs.readFileSync('scripts/patch-share-extension.js','utf8');
 const guard=fs.readFileSync('scripts/verify-ios-sources.sh','utf8');
 assert.match(hook,/function syncNearbyPhotos\(root\)/,'Cordova prepare knows how to refresh the local photos plugin');
 assert.match(hook,/syncNearbyPhotos\(root\);/,'after_prepare refreshes the generated PhotoKit plugin');
 assert.match(guard,/compare local-plugins\/cordova-plugin-nearby-photos\/src\/ios\/NearbyPhotos\.m platforms\/ios\/App\/Plugins\/cordova-plugin-nearby-photos\/NearbyPhotos\.m/,'Xcode guard rejects an outdated PhotoKit native plugin');

 // Parallel UI events must not start concurrent PhotoKit mutations for one collection.
 let active=0,peak=0;
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{
  active++;peak=Math.max(active,peak);
  setTimeout(()=>{active--;ok({collectionId:id});},1);
 };
 await Promise.all([window.NearbyPlacePhotos.syncMemberships(state),window.NearbyPlacePhotos.syncMemberships(state)]);
 assert.equal(peak,1,'PhotoKit changes are serialized across concurrent sync requests');

 // A slow PhotoKit album write must not let an older reconciliation overwrite
 // a later collection rename. Cover both nonempty and already-created empty
 // albums, which use different native operations.
 const ordered=[];
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{
  ordered.push('add:'+id+':'+title);
  if(id==='c-1')setTimeout(()=>ok({collectionId:id}),8);
  else ok({collectionId:id});
 };
 window.NearbyPhotos.renameAlbum=(id,title,ok)=>{
  ordered.push('rename:'+id+':'+title);
  ok({renamed:true});
 };
 const previousSync=window.NearbyPlacePhotos.syncMemberships(state);
 await new Promise(resolve=>setTimeout(resolve,2)); // c-1 is still awaiting PhotoKit.
 const laterRename=window.NearbyPlacePhotos.renameCollection('c-2','Tokyo nouveau');
 const laterEmptyRename=window.NearbyPlacePhotos.renameCollection('c-3','Paris nouveau');
 await Promise.all([previousSync,laterRename,laterEmptyRename]);
 assert.ok(ordered.indexOf('add:c-2:Nearby Places — Tokyo')<
  ordered.indexOf('rename:c-2:Nearby Places — Tokyo nouveau'),
  'later user rename must run after the prior complete batch');
 assert.ok(ordered.indexOf('rename:c-3:Nearby Places — Paris')<
  ordered.indexOf('rename:c-3:Nearby Places — Paris nouveau'),
  'empty-album reconciliation must finish before a later explicit rename');
 assert.equal(ordered.at(-1),'rename:c-3:Nearby Places — Paris nouveau',
  'the last requested album title remains the final native mutation');

 // Album permission errors must never erase associations kept in localStorage.
 const beforeLinks=localStorage.getItem('nearby-place-photo-links-v1');
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok,fail)=>fail('Accès complet à Photos requis');
 await assert.rejects(window.NearbyPlacePhotos.syncMemberships(state),/Accès complet/);
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),beforeLinks,'PhotoKit permission errors do not mutate links');
 // One broken album must not starve other collections; retry can recover it.
 const attempts=[];
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok,fail)=>{
  attempts.push(id);
  if(id==='c-1')fail('Album non modifiable');
  else ok({collectionId:id});
 };
 await assert.rejects(window.NearbyPlacePhotos.syncMemberships(state),/1\/2 album\(s\) iOS non synchronisé\(s\).*c-1/);
 assert.deepEqual(attempts,['c-1','c-2'],'a failed collection does not block a healthy one');
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),beforeLinks,'partial failure retains local photo links');
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{attempts.push(id);ok({collectionId:id});};
 await window.NearbyPlacePhotos.syncMemberships(state);
 assert.deepEqual(attempts,['c-1','c-2','c-1','c-2'],'a later reconciliation retries failed albums');
 // PhotoKit can successfully add available assets while reporting that other
 // local links are stale. Do not report this as a complete synchronization,
 // discard local links, or skip the healthy collection.
 const staleCalls=[];
 const preservedLinks=localStorage.getItem('nearby-place-photo-links-v1');
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{
  staleCalls.push(id);
  ok({collectionId:id,albumId:id==='c-1'?'':'native-album',count:id==='c-1'?0:1,
      unavailableCount:id==='c-1'?ids.length:0});
 };
 await assert.rejects(window.NearbyPlacePhotos.syncMemberships(state),
   /PhotoKit partielle.*c-1.*2 photo\(s\) indisponible\(s\)/);
 assert.deepEqual(staleCalls,['c-1','c-2'],'inaccessible originals do not block the healthy album');
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),preservedLinks,
   'inaccessible PhotoKit assets never erase local photo associations');
 // A partially readable collection must also be diagnosed, even when some
 // originals were successfully added to the album.
 staleCalls.length=0;
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>{
  staleCalls.push(id);
  ok({collectionId:id,albumId:'native-album',count:1,unavailableCount:id==='c-1'?1:0});
 };
 await assert.rejects(window.NearbyPlacePhotos.syncMemberships(state),
   /PhotoKit partielle.*c-1.*1 photo\(s\) indisponible\(s\)/);
 assert.deepEqual(staleCalls,['c-1','c-2']);
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),preservedLinks);
 // Once PhotoKit makes all referenced assets accessible, retry succeeds.
 window.NearbyPhotos.addToAlbum=(id,title,ids,ok)=>ok({collectionId:id,
   albumId:'native-album',count:0,unavailableCount:0});
 await window.NearbyPlacePhotos.syncMemberships(state);
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),preservedLinks);

 // A damaged association store must not masquerade as a successful empty
 // synchronization. No PhotoKit mutation, cleanup or overwrite is permitted.
 const validLinks=localStorage.getItem('nearby-place-photo-links-v1');
 const priorCalls=attempts.length;
 for(const raw of ['{truncated',JSON.stringify({place1:{asset:'A'}}),JSON.stringify({place1:['asset-A'],place2:[null]})]){
  localStorage.setItem('nearby-place-photo-links-v1',raw);
  await assert.rejects(window.NearbyPlacePhotos.syncMemberships(state),/illisibles|invalides|invalide/);
  assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),raw,'broken source stays byte-for-byte intact');
  assert.equal(attempts.length,priorCalls,'corrupt source never initiates album writes');
 }
 localStorage.setItem('nearby-place-photo-links-v1',validLinks);
 const invalidStates=[
  null,
  {collections:[],memberships:[{placeId:'place1',collectionId:'missing'}]},
  {collections:[{id:'collection-default',name:'Mes lieux'},{id:'collection-default',name:'Dupliquée'}],memberships:[]},
  {collections:[{id:'collection-default',name:'Mes lieux'}],memberships:[null]}
 ];
 for(const broken of invalidStates){
  await assert.rejects(window.NearbyPlacePhotos.syncMemberships(broken),/Collection|collection/);
  assert.equal(attempts.length,priorCalls,'invalid collection state prevents native mutations');
 }
 assert.equal(localStorage.getItem('nearby-place-photo-links-v1'),validLinks,'validation is entirely read-only');
 assert.equal(fs.readFileSync('www/js/place-photos.js','utf8'),fs.readFileSync('public/js/place-photos.js','utf8'),'www and public parity');
 console.log('PASS photo albums: lazy creation, stable collection IDs, bridge, duplicate names, multi-album links, deletion safety');
})().catch(error=>{console.error(error);process.exitCode=1;});
