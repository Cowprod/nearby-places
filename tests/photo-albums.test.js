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
 assert.equal(writes.length,2,'albums are created lazily, only with linked photos');
 assert.deepEqual(writes[0],{id:'c-1',title:'Nearby Places — Tokyo',ids:['asset-A','asset-B']});
 assert.deepEqual(writes[1],{id:'c-2',title:'Nearby Places — Tokyo',ids:['asset-A','asset-B']});
 assert.deepEqual(JSON.parse(localStorage.getItem('nearby-place-photo-links-v1')).place1,['asset-A','asset-B','asset-A'],'album sync never rewrites place-photo links');
 await window.NearbyPlacePhotos.renameCollection('c-2','Tokyo 2026');
 assert.deepEqual(writes[2],{rename:'c-2',title:'Nearby Places — Tokyo 2026'},'rename uses collection ID, not ambiguous title');
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
 assert.doesNotMatch(native,/deleteAssetCollections/,'never delete photo albums automatically');
 assert.equal(fs.readFileSync('www/js/place-photos.js','utf8'),fs.readFileSync('public/js/place-photos.js','utf8'),'www and public parity');
 console.log('PASS photo albums: lazy creation, stable collection IDs, bridge, duplicate names, multi-album links, deletion safety');
})().catch(error=>{console.error(error);process.exitCode=1;});
