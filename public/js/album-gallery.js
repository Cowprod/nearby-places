(function(root){
'use strict';
// Read-only PhotoKit album viewer. The album's stable collection ID is used;
// place-photo associations and the iOS album are never mutated here.
function node(tag,text,cls){
 var e=document.createElement(tag);
 if(text!=null)e.textContent=text;
 if(cls)e.className=cls;
 return e;
}
function nativeCall(method,args){
 return new Promise(function(resolve,reject){
  if(!root.NearbyPhotos||typeof root.NearbyPhotos[method]!=='function'){
   reject(Error('Module Photos iOS indisponible. Une nouvelle compilation iOS est nécessaire.'));return;
  }
  root.NearbyPhotos[method].apply(null,args.concat([resolve,function(err){reject(Error(String(err)));}]));
 });
}
// Read local place-photo associations without modifying them or the iOS album.
// Photos added directly in Apple Photos may legitimately have no place link.
function linkedPlacesLabel(assetId){
 var storage=root.localStorage;
 if(!storage||typeof storage.getItem!=='function')return 'Associations de lieux indisponibles.';
 try{
  var raw=storage.getItem('nearby-place-photo-links-v1');
  if(raw===null)return 'Aucun lieu Nearby Places associé.';
  var links=JSON.parse(raw);
  if(!links||typeof links!=='object'||Array.isArray(links))throw Error('Associations invalides');
  var placeIds=Object.keys(links).filter(function(id){
   if(!Array.isArray(links[id]))throw Error('Association invalide');
   return links[id].includes(assetId);
  });
  if(!placeIds.length)return 'Aucun lieu Nearby Places associé.';
  var places=JSON.parse(storage.getItem('nearby-places-v1')||'[]');
  if(!Array.isArray(places))throw Error('Lieux invalides');
  var names=placeIds.map(function(id){
   var place=places.find(function(item){return item&&item.id===id;});
   return place&&typeof place.name==='string'&&place.name.trim()?place.name:'Lieu non répertorié';
  });
  return 'Lieux associés : '+names.join(', ');
 }catch(_){return 'Associations locales illisibles : aucun changement effectué.';}
}
function open(collection){
 if(!collection||typeof collection.id!=='string'||!collection.id)return;
 var closed=false,loading=false,offset=0,total=0,photos=[],known=new Set(),previewRequest=0;
 var overlay=node('div',null,'nearby-photo-overlay nearby-album-overlay');
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Album Photos de '+collection.name);
 var dialog=node('section',null,'nearby-photo-dialog nearby-album-dialog');
 var heading=node('h3','Photos — '+collection.name);
 var close=node('button','Fermer','btn btn-secondary');
 close.type='button';
 var count=node('p','Chargement de l’album…','muted');
 count.setAttribute('role','status');
 var grid=node('div',null,'nearby-album-grid');
 var more=node('button','Afficher davantage','btn btn-secondary');
 more.type='button';more.hidden=true;
 var error=node('p','','muted');
 error.setAttribute('role','status');
 dialog.append(heading,close,count,grid,more,error);
 overlay.append(dialog);
 document.body.append(overlay);
 var viewer=node('div',null,'nearby-album-viewer');
 viewer.hidden=true;
 viewer.setAttribute('role','dialog');
 viewer.setAttribute('aria-modal','true');
 viewer.setAttribute('aria-label','Aperçu de la photo');
 var viewClose=node('button','Fermer l’aperçu','btn btn-secondary');
 var previous=node('button','‹','btn btn-secondary');
 previous.setAttribute('aria-label','Photo précédente');
 var picture=node('img');
 picture.alt='Aperçu de la photo';
 var next=node('button','›','btn btn-secondary');
 next.setAttribute('aria-label','Photo suivante');
 var viewStatus=node('p','','nearby-album-view-status');
 var linkedPlaces=node('p','','nearby-album-linked-places muted');
 var controls=node('div',null,'nearby-album-view-controls');
 controls.append(previous,picture,next);
 viewer.append(viewClose,controls,viewStatus,linkedPlaces);
 document.body.append(viewer);
 var index=-1;
 function hideViewer(){previewRequest++;viewer.hidden=true;picture.removeAttribute('src');}
 function dismiss(){closed=true;hideViewer();viewer.remove();overlay.remove();}
 close.onclick=dismiss;
 viewClose.onclick=hideViewer;
 function show(position){
  if(position<0||position>=photos.length||closed)return;
  index=position;
  viewer.hidden=false;
  previous.disabled=index===0;
  next.disabled=index===photos.length-1;
  picture.removeAttribute('src');
  viewStatus.textContent='Chargement de la photo '+(index+1)+' / '+photos.length+'…';
  linkedPlaces.textContent=linkedPlacesLabel(photos[position]);
  var current=++previewRequest,id=photos[position];
  nativeCall('preview',[id]).then(function(payload){
   if(closed||current!==previewRequest)return;
   if(!payload||typeof payload.dataUrl!=='string')throw Error('Aperçu indisponible');
   picture.src=payload.dataUrl;
   viewStatus.textContent='Photo '+(index+1)+' / '+photos.length;
  }).catch(function(e){if(!closed&&current===previewRequest)viewStatus.textContent=e.message;});
 }
 previous.onclick=function(){show(index-1);};
 next.onclick=function(){show(index+1);};
 var touchX=null;
 viewer.addEventListener('touchstart',function(e){if(e.touches&&e.touches.length===1)touchX=e.touches[0].clientX;},{passive:true});
 viewer.addEventListener('touchend',function(e){
  if(touchX===null||!e.changedTouches||!e.changedTouches.length)return;
  var delta=e.changedTouches[0].clientX-touchX;touchX=null;
  if(Math.abs(delta)>55)show(index+(delta<0?1:-1));
 },{passive:true});
 function tile(id){
  var button=node('button',null,'nearby-album-tile');
  button.type='button';
  button.dataset.photoId=id;
  button.setAttribute('aria-label','Ouvrir la photo '+photos.length);
  var img=node('img');img.alt='Miniature';img.loading='lazy';
  var fallback=node('span','Chargement…','muted');
  button.append(img,fallback);grid.append(button);
  var position=photos.length-1;
  button.onclick=function(){show(position);};
  nativeCall('thumbnail',[id]).then(function(payload){
   if(closed)return;
   if(!payload||typeof payload.dataUrl!=='string')throw Error('Miniature inaccessible');
   img.src=payload.dataUrl;fallback.hidden=true;
  }).catch(function(){if(!closed)fallback.textContent='Photo indisponible';});
 }
 function nextPage(){
  if(closed||loading)return Promise.resolve();
  loading=true;more.disabled=true;error.textContent='';
  var requested=offset;
  return nativeCall('listAlbumAssets',[collection.id,requested,24]).then(function(payload){
   if(closed)return;
   if(!payload||!Array.isArray(payload.ids)||!Number.isSafeInteger(payload.count)||payload.count<0)throw Error('Réponse PhotoKit invalide');
   total=payload.count;
   if(payload.exists===false){
    count.textContent='Aucun album Photos pour cette collection (création à la première photo associée).';
    more.hidden=true;return;
   }
   payload.ids.forEach(function(id){
    if(typeof id!=='string'||!id||known.has(id))return;
    known.add(id);photos.push(id);tile(id);
   });
   offset=requested+payload.ids.length;
   count.textContent=total+' photo(s) dans l’album Photos iOS';
   if(total===0)count.textContent='Cet album ne contient aucune photo.';
   more.hidden=offset>=total||payload.ids.length===0;
  }).catch(function(err){
   if(!closed){error.textContent='Lecture de l’album impossible : '+err.message;more.hidden=false;}
  }).then(function(){loading=false;more.disabled=false;});
 }
 more.onclick=nextPage;
 nextPage();
 return {close:dismiss};
}
root.NearbyAlbumGallery={open:open};
})(window);
