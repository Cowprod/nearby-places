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
// Reconciliation must not silently interpret corrupt associations as an empty
// photo library. Otherwise the UI could report a successful album sync without
// ever sending existing links to PhotoKit.
function readForSync(){
 var links=readForWrite();
 Object.keys(links).forEach(function(placeId){
  if(!placeId||!Array.isArray(links[placeId])||links[placeId].some(function(id){return typeof id!=='string'||!id;})){
   throw Error('Associations photo-lieu invalides : synchronisation PhotoKit interrompue, données locales conservées.');
  }
 });
 return links;
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
// A complete reconciliation (including renames of already-created empty
// albums) must not be interleaved with another photo write or user rename.
function queuedAlbumTask(work){var op=albumQueue.then(work);albumQueue=op.catch(function(){});return op;}
function queuedAlbumCall(method,args){return queuedAlbumTask(function(){return call(method,args);});}
// Photos belong to a place in local storage; album membership derives from collection IDs.
function currentCollections(){
 var raw=localStorage.getItem('nearby-collections-v2');
 if(raw===null)throw Error('Collections locales absentes : album Photos non synchronisé, association conservée.');
 var state;
 try{state=JSON.parse(raw);}catch(_){throw Error('Collections locales illisibles : album Photos non synchronisé, association conservée.');}
 return state;
}
function albumJobs(state,onlyPlaceId){
 if(!state||!Array.isArray(state.collections)||!Array.isArray(state.memberships)){
  throw Error('Collections locales invalides : synchronisation PhotoKit interrompue, données conservées.');
 }
 var collectionIds=new Set();
 state.collections.forEach(function(c){
  if(!c||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||collectionIds.has(c.id)){
   throw Error('Collection locale invalide : synchronisation PhotoKit interrompue, données conservées.');
  }
  collectionIds.add(c.id);
 });
 state.memberships.forEach(function(m){
  if(!m||typeof m.placeId!=='string'||!m.placeId||!collectionIds.has(m.collectionId)){
   throw Error('Appartenance à une collection invalide : synchronisation PhotoKit interrompue, données conservées.');
  }
 });
 // Reconcile every linked asset in each collection containing this place. A
 // newly recreated PhotoKit album must recover older associations too, not
 // only the asset just selected or captured.
 var links=readForSync(),albums=new Map();
 var targetCollections=onlyPlaceId?new Set(state.memberships.filter(function(m){return m.placeId===onlyPlaceId;}).map(function(m){return m.collectionId;})):null;
 (state.memberships||[]).forEach(function(m){
  if(m.collectionId==='collection-default'||(targetCollections&&!targetCollections.has(m.collectionId)))return;
  var selected=links[m.placeId];
  if(!Array.isArray(selected)||!selected.length)return;
  if(!albums.has(m.collectionId))albums.set(m.collectionId,new Set());
  selected.forEach(function(id){if(typeof id==='string'&&id)albums.get(m.collectionId).add(id);});
 });
 return (state.collections||[]).filter(function(c){return c.id!=='collection-default'&&albums.has(c.id)&&albums.get(c.id).size;}).map(function(c){return {id:c.id,title:'Nearby Places — '+c.name,ids:Array.from(albums.get(c.id))};});
}
function addToAlbums(jobs){return queuedAlbumTask(function(){return addToAlbumsDirect(jobs);});}
function addToAlbumsDirect(jobs){
 // Never claim that an album is fully reconciled if PhotoKit could not find
 // some PHAsset identifiers. Links remain local and are retried on resume;
 // no original, album or local association is removed automatically.
 // Continue with the other albums even when one fails or is incomplete.
 var failures=[],unavailable=[];
 return jobs.reduce(function(p,job){return p.then(function(){
  return call('addToAlbum',[job.id,job.title,job.ids]).then(function(result){
   var missing=result&&Number(result.unavailableCount);
   if(Number.isSafeInteger(missing)&&missing>0){
    unavailable.push(job.title+' ['+job.id+'] : '+missing+' photo(s) indisponible(s) dans Photos ; associations locales conservées');
   }
  }).catch(function(error){
   failures.push(job.title+' ['+job.id+'] : '+(error&&error.message||String(error)));
  });
 });},Promise.resolve()).then(function(){
  if(failures.length)throw Error(failures.length+'/'+jobs.length+' album(s) iOS non synchronisé(s) : '+failures.join(' ; ')+(unavailable.length?' ; '+unavailable.join(' ; '):''));
  if(unavailable.length)throw Error('Synchronisation PhotoKit partielle : '+unavailable.join(' ; '));
 });
}
function open(place,immediateCamera,collectionName){var overlay=document.createElement('div');overlay.className='nearby-photo-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');var box=document.createElement('section');box.className='nearby-photo-dialog';var title=document.createElement('h3');title.textContent='Photos — '+place.name;var close=document.createElement('button');close.className='btn btn-secondary';close.textContent='Fermer';close.onclick=function(){overlay.remove();};var status=document.createElement('p');status.className='muted';var gallery=document.createElement('div');gallery.className='nearby-photo-grid';var actions=document.createElement('div');actions.className='nearby-photo-buttons';var pick=document.createElement('button');pick.className='btn btn-secondary';pick.textContent='Choisir dans Photos';var search=document.createElement('button');search.className='btn btn-secondary';search.textContent='Photos à proximité';var radius=document.createElement('input');radius.type='number';radius.min='10';radius.max='5000';radius.value='100';radius.setAttribute('aria-label','Rayon en mètres');radius.style.width='90px';actions.append(pick,search,radius);var candidates=document.createElement('div');candidates.className='nearby-photo-grid';var galleryHeading=document.createElement('h4');galleryHeading.textContent='Photos associées au lieu';var candidateHeading=document.createElement('h4');candidateHeading.textContent='Photos à proximité proposées';candidateHeading.hidden=true;box.append(title,close,galleryHeading,gallery,actions,status,candidateHeading,candidates);overlay.append(box);document.body.append(overlay);
function thumbnail(id,container,linked){var cell=document.createElement('div');cell.className='nearby-photo-tile';cell.dataset.photoId=id;var img=document.createElement('img');img.alt='Photo du lieu';img.loading='lazy';cell.append(img);var button=document.createElement('button');button.className='nearby-photo-link-button';button.setAttribute('aria-label',linked?'Délier la photo':'Lier la photo');button.title=linked?'Délier':'Lier';var ico=document.createElement('i');ico.className=linked?'fas fa-times-circle text-warning':'fas fa-plus-circle text-success';ico.setAttribute('aria-hidden','true');button.append(ico);button.style.position='absolute';button.style.top='6px';button.style.right='6px';button.style.zIndex='2';button.style.border='0';button.style.background='rgba(255,255,255,.92)';button.style.borderRadius='50%';button.style.padding='3px';button.style.fontSize='22px';button.onclick=function(){try{var list=ids(place);update(place,linked?list.filter(function(x){return x!==id;}):list.concat(id));if(linked&&candidateHeading.dataset.searchOpen==='true'){if(!Array.from(candidates.children).some(function(t){return t.dataset.photoId===id;}))thumbnail(id,candidates,false);}render();if(!linked)album().catch(function(err){status.textContent=err.message;});}catch(error){status.textContent=error.message;}};cell.style.position='relative';cell.append(button);container.append(cell);call('thumbnail',[id]).then(function(v){img.src=v.dataUrl;}).catch(function(){img.alt='Photo inaccessible';});}
function render(){gallery.replaceChildren();var associated=new Set(ids(place));Array.from(candidates.children).forEach(function(tile){if(associated.has(tile.dataset.photoId))tile.remove();});candidateHeading.hidden=!candidates.children.length;ids(place).forEach(function(id){thumbnail(id,gallery,true);});if(!ids(place).length){var empty=document.createElement('p');empty.className='muted';empty.textContent='Aucune photo associée.';gallery.append(empty);}}
function album(){
 return Promise.resolve().then(function(){
  return addToAlbums(albumJobs(currentCollections(),place.id));
 }).catch(function(err){throw Error('Photo associée au lieu, mais album iOS non synchronisé : '+err.message);});
}

function run(task){status.textContent='Chargement…';task.then(function(message){status.textContent=typeof message==='string'?message:'';render();}).catch(function(err){status.textContent=err.message;render();});}

pick.onclick=function(){run(call('pick',[]).then(function(v){
 var selected=v&&Array.isArray(v.ids)?v.ids.filter(function(id){return typeof id==='string'&&!!id;}):[];
 var unavailable=Number(v&&v.unavailableCount);
 var skipped=Number.isSafeInteger(unavailable)&&unavailable>0?unavailable:0;
 var selectedCount=Number(v&&v.selectedCount);
 var notice=skipped?skipped+' photo(s) sélectionnée(s) sans identifiant PhotoKit : non associée(s) au lieu.':'';
 if(!selected.length){
  if(notice)return notice;
  return Number.isSafeInteger(selectedCount)&&selectedCount>0?'Aucune photo sélectionnée ne peut être associée au lieu.':'Aucune photo sélectionnée.';
 }
 update(place,ids(place).concat(selected));
 return album().then(function(){return notice;},function(error){throw Error(error.message+(notice?' ; '+notice:''));});
}));};
search.onclick=function(){candidateHeading.dataset.searchOpen='true';candidates.replaceChildren();run(call('nearby',[Number(place.latitude),Number(place.longitude),Number(radius.value)||100]).then(function(v){var existing=new Set(ids(place));(v.items||[]).filter(function(x){return !existing.has(x.id);}).forEach(function(x){thumbnail(x.id,candidates,false);});candidateHeading.hidden=!candidates.children.length;if(!candidates.children.length)status.textContent='Aucune photo géolocalisée trouvée dans ce rayon.';}));};
render();}
function capture(place){
 // One tap = one native capture. The original is already saved when the
 // native callback returns an asset ID, regardless of subsequent local errors.
 var photoSaved=false,associated=false;
 return call('capture',[]).then(function(result){
  if(!result||!result.id)return {cancelled:true};
  photoSaved=true;
  update(place,ids(place).concat(result.id));
  associated=true;
  return Promise.resolve().then(function(){
   return addToAlbums(albumJobs(currentCollections(),place.id));
  }).then(
   function(){return {saved:true,associated:true,albumSynced:true};},
   function(error){
    window.alert('Photo enregistrée et associée au lieu. Album Photos non synchronisé : '+(error&&error.message||String(error)));
    return {saved:true,associated:true,albumSynced:false};
   });
 }).catch(function(error){
  if(photoSaved){
   window.alert('Photo enregistrée dans Photos, mais association au lieu impossible : '+(error&&error.message||String(error)));
   return {saved:true,associated:associated,albumSynced:false};
  }
  window.alert('Prise de vue impossible : '+(error&&error.message||String(error)));
  return {saved:false};
 });
}
// Even when a collection has no *currently linked* photos, its previously
// created iOS album must retain the correct name. renameAlbum is a native
// no-op (without requesting Photos permission) if that collection has never
// created an album. It never creates an empty album or removes its contents.
function reconcileMemberships(state){
 // A request queued while collections were persisted must not fall back to
 // its old UI snapshot if the durable key disappears before execution.
 // Callers without a saved collection store may still provide an explicit
 // state (e.g. first-run/bootstrap), but queued persisted work fails closed.
 var hadDurableCollections=localStorage.getItem('nearby-collections-v2')!==null;
 // Similarly, a vanished association store is not proof that all photo links
 // were removed. Do not report a successful reconciliation from missing data.
 var hadDurableLinks=localStorage.getItem(KEY)!==null;
 // Read the durable collection state and photo links only when this task
 // reaches the front of the queue. A resume or delayed UI event may have
 // queued a snapshot before the user renamed a collection or changed links.
 return queuedAlbumTask(function(){
  if(hadDurableLinks&&localStorage.getItem(KEY)===null){
   throw Error('Associations photo-lieu absentes après mise en file : synchronisation PhotoKit interrompue, aucune association supprimée.');
  }
  var latest=hadDurableCollections||localStorage.getItem('nearby-collections-v2')!==null?currentCollections():state;
  var jobs=albumJobs(latest),linkedIds=new Set(jobs.map(function(job){return job.id;}));
  var empty=latest.collections.filter(function(c){
   return c.id!=='collection-default'&&!linkedIds.has(c.id);
  });
  // Keep the entire reconciliation (including renames) under one queue task.
  var failures=[];
   return addToAlbumsDirect(jobs).catch(function(error){failures.push(error.message);}).then(function(){
    return empty.reduce(function(previous,c){
     return previous.then(function(){
      return call('renameAlbum',[c.id,'Nearby Places — '+c.name]).catch(function(error){
       failures.push('Renommage ['+c.id+'] : '+(error&&error.message||String(error)));
      });
     });
    },Promise.resolve());
   }).then(function(){
    if(failures.length)throw Error('Synchronisation PhotoKit incomplète : '+failures.join(' ; '));
   });
 });
}
// Restore an album deleted manually in Apple Photos only on explicit user
// request. Read current durable links when the queued task starts, never a
// stale UI snapshot; never delete originals, albums or place-photo relations.
function linkedAlbumJob(collectionId){
 if(typeof collectionId!=='string'||!collectionId)throw Error('Collection Photos invalide');
 return albumJobs(currentCollections()).find(function(job){return job.id===collectionId;})||null;
}
function restoreCollectionAlbum(collectionId){
 return queuedAlbumTask(function(){
  var job=linkedAlbumJob(collectionId);
  if(!job)throw Error('Aucune photo associée à cette collection : aucun album vide ne sera créé.');
  // Explicit user action: do not let ordinary background reconciliation restore deleted albums.
  return call('restoreAlbum',[job.id,job.title,job.ids]).then(function(result){
   if(!result||typeof result.albumId!=='string'||!result.albumId){
    throw Error('Aucune photo associée actuellement accessible dans Photos. Les liens locaux sont conservés.');
   }
   // The album can be restored with the available originals even if some
   // links reference deleted/inaccessible assets. Surface the partial state.
   var missing=Number(result.unavailableCount);
   return {albumId:result.albumId,unavailableCount:Number.isSafeInteger(missing)&&missing>0?missing:0};
  });
 });
}
window.NearbyPlacePhotos={capture:capture,open:open,renameCollection:function(collectionId,newName){return queuedAlbumCall('renameAlbum',[collectionId,'Nearby Places — '+newName]);},syncMemberships:reconcileMemberships,hasLinkedAlbumPhotos:function(collectionId){return !!linkedAlbumJob(collectionId);},restoreCollectionAlbum:restoreCollectionAlbum};
})();