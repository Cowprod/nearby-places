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
 assert.match(native,/fetchAssetCollectionsWithLocalIdentifiers/,'albums are resolved through stable PhotoKit IDs');
 assert.match(native,/placeholderForCreatedAssetCollection/,'new album PhotoKit ID is persisted');
 assert.match(native,/PHAuthorizationStatusLimited/,'limited access explicitly handled');
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
