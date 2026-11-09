(function(){
'use strict';
var KEY='nearby-place-photo-links-v1';
function read(){try{var v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(_){return {};}}
// Never replace an unreadable or structurally invalid association store with an
// empty object: that would silently discard existing photo-place relationships.
function readForWrite(){
 var raw=localStorage.getItem(KEY);
 if(raw===null)return {};
 var v;
 try{v=JSON.parse(raw);}catch(_){throw Error('Associations photo-lieu illisibles : données locales conservées, aucune modification effectuée.');}
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Format des associations photo-lieu invalide : données locales conservées.');
 return v;
}
function ids(place){var v=read()[place.id];return Array.isArray(v)?v.filter(function(id){return typeof id==='string'&&id.length>0;}):[];}
function update(place,list){
 if(!place||typeof place.id!=='string'||!place.id||!Array.isArray(list))throw Error('Association photo-lieu invalide');
 var v=readForWrite();
 if(Object.prototype.hasOwnProperty.call(v,place.id)&&(!Array.isArray(v[place.id])||v[place.id].some(function(id){return typeof id!=='string'||!id;}))){
  throw Error('Associations photo-lieu existantes invalides : données locales conservées.');
 }
 v[place.id]=Array.from(new Set(list.filter(function(id){return typeof id==='string'&&id.length>0;})));
 localStorage.setItem(KEY,JSON.stringify(v));
}
function call(method,args){return new Promise(function(resolve,reject){if(!window.NearbyPhotos||!window.NearbyPhotos[method]){reject(Error('Module photo iOS indisponible : reconstruire l’application.'));return;}window.NearbyPhotos[method].apply(null,args.concat([resolve,function(err){reject(Error(String(err)));}]));});}
var albumQueue=Promise.resolve();
function queuedAlbumCall(method,args){var op=albumQueue.then(function(){return call(method,args);});albumQueue=op.catch(function(){});return op;}
// Photos belong to a place in local storage; album membership derives from collection IDs.
function currentCollections(){try{var state=JSON.parse(localStorage.getItem('nearby-collections-v2')||'{}');return state&&Array.isArray(state.collections)&&Array.isArray(state.memberships)?state:null;}catch(_){return null;}}
function albumJobs(state,onlyPlaceId,photoIds){
 if(!state)return [];
 var links=read(),albums=new Map();
 (state.memberships||[]).forEach(function(m){
  if(m.collectionId==='collection-default'||(onlyPlaceId&&m.placeId!==onlyPlaceId))return;
  var selected=onlyPlaceId?photoIds:links[m.placeId];
  if(!Array.isArray(selected)||!selected.length)return;
  if(!albums.has(m.collectionId))albums.set(m.collectionId,new Set());
  selected.forEach(function(id){if(typeof id==='string'&&id)albums.get(m.collectionId).add(id);});
 });
 return (state.collections||[]).filter(function(c){return c.id!=='collection-default'&&albums.has(c.id)&&albums.get(c.id).size;}).map(function(c){return {id:c.id,title:'Nearby Places — '+c.name,ids:Array.from(albums.get(c.id))};});
}
function addToAlbums(jobs){
 // A broken album must not block photos belonging to other collections.
 // Keep the rejected sync visible so deviceready/resume can retry later.
 var failures=[];
 return jobs.reduce(function(p,job){return p.then(function(){
  return queuedAlbumCall('addToAlbum',[job.id,job.title,job.ids]).catch(function(error){
   failures.push(job.title+' ['+job.id+'] : '+(error&&error.message||String(error)));
  });
 });},Promise.resolve()).then(function(){
  if(failures.length)throw Error(failures.length+'/'+jobs.length+' album(s) iOS non synchronisé(s) : '+failures.join(' ; '));
 });
}
function open(place,immediateCamera,collectionName){var overlay=document.createElement('div');overlay.className='nearby-photo-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');var box=document.createElement('section');box.className='nearby-photo-dialog';var title=document.createElement('h3');title.textContent='Photos — '+place.name;var close=document.createElement('button');close.className='btn btn-secondary';close.textContent='Fermer';close.onclick=function(){overlay.remove();};var status=document.createElement('p');status.className='muted';var gallery=document.createElement('div');gallery.className='nearby-photo-grid';var actions=document.createElement('div');actions.className='nearby-photo-buttons';var pick=document.createElement('button');pick.className='btn btn-secondary';pick.textContent='Choisir dans Photos';var search=document.createElement('button');search.className='btn btn-secondary';search.textContent='Photos à proximité';var radius=document.createElement('input');radius.type='number';radius.min='10';radius.max='5000';radius.value='100';radius.setAttribute('aria-label','Rayon en mètres');radius.style.width='90px';actions.append(pick,search,radius);var candidates=document.createElement('div');candidates.className='nearby-photo-grid';box.append(title,close,actions,status,gallery,candidates);overlay.append(box);document.body.append(overlay);
function thumbnail(id,container,linked){var cell=document.createElement('div');cell.className='nearby-photo-tile';var img=document.createElement('img');img.alt='Photo du lieu';img.loading='lazy';cell.append(img);var button=document.createElement('button');button.className='btn btn-sm btn-secondary';button.textContent=linked?'Dissocier':'Associer';button.onclick=function(){var list=ids(place);update(place,linked?list.filter(function(x){return x!==id;}):list.concat(id));render();if(!linked)album([id]).catch(function(err){status.textContent=err.message;});};cell.append(button);container.append(cell);call('thumbnail',[id]).then(function(v){img.src=v.dataUrl;}).catch(function(){img.alt='Photo inaccessible';});}
function render(){gallery.replaceChildren();ids(place).forEach(function(id){thumbnail(id,gallery,true);});if(!ids(place).length){var empty=document.createElement('p');empty.className='muted';empty.textContent='Aucune photo associée.';gallery.append(empty);}}
function album(photoIds){
 var jobs=albumJobs(currentCollections(),place.id,photoIds);
 return addToAlbums(jobs).catch(function(err){throw Error('Photo associée au lieu, mais album iOS non synchronisé : '+err.message);});
}

function run(task){status.textContent='Chargement…';task.then(function(){status.textContent='';render();}).catch(function(err){status.textContent=err.message;render();});}

pick.onclick=function(){run(call('pick',[]).then(function(v){update(place,ids(place).concat(v.ids||[]));return album(v.ids||[]);}));};
search.onclick=function(){candidates.replaceChildren();run(call('nearby',[Number(place.latitude),Number(place.longitude),Number(radius.value)||100]).then(function(v){var existing=new Set(ids(place));(v.items||[]).filter(function(x){return !existing.has(x.id);}).forEach(function(x){thumbnail(x.id,candidates,false);});if(!candidates.children.length)status.textContent='Aucune photo géolocalisée trouvée dans ce rayon.';}));};
render();}
function capture(place){
 // One tap = one native camera capture. PhotoKit import/suggestions live only
 // under the album button. Cancellation is not an error.
 return call('capture',[]).then(function(result){
  if(!result||!result.id)return {cancelled:true};
  update(place,ids(place).concat(result.id));
  return addToAlbums(albumJobs(currentCollections(),place.id,[result.id])).then(
   function(){return {saved:true,albumSynced:true};},
   function(error){
    // The original exists in Photos and its place association is persisted.
    // Never report a failed save or delete the association because album
    // authorization was refused.
    window.alert('Photo enregistrée et associée au lieu. Album Photos non synchronisé : '+(error&&error.message||String(error)));
    return {saved:true,albumSynced:false};
   });
 }).catch(function(error){
  window.alert('Prise de vue impossible : '+(error&&error.message||String(error)));
  return {saved:false};
 });
}
window.NearbyPlacePhotos={capture:capture,open:open,renameCollection:function(collectionId,newName){return queuedAlbumCall('renameAlbum',[collectionId,'Nearby Places — '+newName]);},syncMemberships:function(state){return addToAlbums(albumJobs(state));}};
})();