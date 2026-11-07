(function () {
  'use strict';
  var KEY = 'nearby-places-v1', CATALOGUE_KEY = 'nearby-places-catalogue-v1', places = [], loadRevision = 0;
  var NATIVE_CATEGORIES=[
    {id:'culture',name:'Culture'},{id:'resto',name:'Restaurant'},{id:'musique',name:'Musique'},
    {id:'transport',name:'Transport'},{id:'occasion',name:'Occasion'},{id:'modelisme',name:'Modélisme'}
  ];
  var REMOTE_URL = 'https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json';
  var $ = function (id) { return document.getElementById(id); };
  function validPosition(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
  function distanceMeters(a,b,c,d) { var r=Math.PI/180, x=(c-a)*r, y=(d-b)*r, q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
  function save(){ localStorage.setItem(KEY,JSON.stringify(places)); if(window.NearbyProximity)window.NearbyProximity.setPlaces(places); }
  function trace(kind,detail){if(window.NearbyProximity&&window.NearbyProximity.logEvent)window.NearbyProximity.logEvent(kind,detail);}
  function status(s){ $('status').textContent=s; }
  function render(position){
    $('places').replaceChildren();
    // Local data may predate schema validation; render defensively without deleting it.
    places.map(function(place,index){return {place:place,index:index};}).sort(function(a,b){
      var x=a.place||{},y=b.place||{};
      var activity=Number(!!x.visited)-Number(!!y.visited);
      if(activity)return activity;
      function category(p){var id=Array.isArray(p.categories)?p.categories[0]:'';var item=NATIVE_CATEGORIES.find(function(c){return c.id===id;});return item?item.name:String(id||'');}
      var group=category(x).localeCompare(category(y),'fr');
      if(group)return group;
      function entered(p){var old=String(p.id||'').match(/^manual-(\d+)-/);return Number(p.createdAt)||(old?Number(old[1]):0);}
      return entered(y)-entered(x)||b.index-a.index;
    }).forEach(function(entry){
      var p=entry.place;
      if(!p || typeof p!=='object')return;
      var validCoords=validPosition(p.latitude,p.longitude);
      var card=document.createElement('section');card.className='place';
      var head=document.createElement('div');head.className='row';
      var title=document.createElement('strong');
      title.textContent=typeof p.name==='string' && p.name.trim()?p.name:'Lieu local sans nom';
      var button=document.createElement('button');button.textContent=p.visited?'Réactiver':'Visité';
      button.onclick=function(){p.visited=!p.visited;save();render(position);};
      head.append(title,button);card.append(head);
      var meta=document.createElement('p');meta.className='tag';
      var categories=Array.isArray(p.categories)?p.categories.filter(function(c){return typeof c==='string';}).join(', '):'';
      meta.textContent=categories+' · '+(validCoords?
        p.latitude.toFixed(5)+', '+p.longitude.toFixed(5):
        'Coordonnées invalides (donnée locale conservée)');
      card.append(meta);
      if(typeof p.comment==='string' && p.comment){
        var note=document.createElement('p');note.textContent=p.comment;card.append(note);
      }
      if(validCoords && position && validPosition(position.latitude,position.longitude)){
        var km=distanceMeters(position.latitude,position.longitude,p.latitude,p.longitude)/1000;
        var t=document.createElement('p');t.textContent=km.toFixed(2)+' km à vol d’oiseau (pas un temps de marche)';
        card.append(t);
      }
      if(validCoords){
        var directions=document.createElement('a');
        directions.href='https://maps.apple.com/?daddr='+encodeURIComponent(p.latitude+','+p.longitude)+'&dirflg=w';
        directions.textContent='Itinéraire à pied (Plans)';
        directions.target='_blank';directions.rel='noopener noreferrer';
        directions.style.color='#5bd7bb';card.append(directions);
      }
      $('places').append(card);
    });
  }
  function readJSON(key, fallback){
    try {
      var raw=localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e){ return fallback; }
  }
  function validCatalogue(data){
    if(!data || data.schemaVersion!==1 || !Array.isArray(data.places) || data.places.length>5000) return false;
    var seen=new Set();
    return data.places.every(function(p){
      if(!p || typeof p.id!=='string' || !p.id || seen.has(p.id) ||
         typeof p.name!=='string' || !p.name.trim() ||
         !validPosition(p.latitude,p.longitude) || !Array.isArray(p.categories)) return false;
      seen.add(p.id);return true;
    });
  }
  function mergeCatalogue(data, label){
    // A network request may complete after localStorage becomes unreadable.
    // Never overwrite the raw local data with a remote catalogue in that case.
    var raw=localStorage.getItem(KEY),previous;
    try{previous=raw===null?[]:JSON.parse(raw);}
    catch(error){
      status('Données locales illisibles : fusion suspendue pour éviter leur perte');
      trace('storage-error','JSON local illisible pendant la fusion ; stockage préservé');
      return false;
    }
    if(!Array.isArray(previous)){
      status('Format local inattendu : fusion suspendue pour éviter la perte de données');
      trace('storage-error','Catalogue local non tableau pendant la fusion ; stockage préservé');
      return false;
    }
    var byId=new Map(previous.filter(function(p){return p && typeof p.id==='string' && p.id;}).map(function(p){return [p.id,p];}));
    var incoming=data.places.map(function(p){
      var old=byId.get(p.id);
      return Object.assign({},p,{visited:old ? !!old.visited : !!p.visited});
    });
    // A Map deduplicates restored identifiers and would silently delete manual
    // places with colliding IDs. Preserve each orphaned local record in order.
    // Remote catalogue IDs are still reconciled with the authoritative remote.
    var remoteIds=new Set(data.places.map(function(p){return p.id;}));
    var preserved=previous.filter(function(p){
      if(!p || typeof p!=='object' || typeof p.id!=='string' || !p.id)return true;
      if(remoteIds.has(p.id))return false;
      return (p.source && p.source.type==='manual') ||
        !validPosition(p.latitude,p.longitude) ||
        typeof p.name!=='string' || !Array.isArray(p.categories);
    });
    places=incoming.concat(preserved);
    save();render();
    status(places.length+' lieux · '+label);
    return true;
  }
  function fetchCatalogue(url, timeoutMs){
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},timeoutMs);
    return fetch(url,{cache:'no-store',signal:controller.signal}).then(function(r){
      if(!r.ok)throw Error('HTTP '+r.status);
      return r.json();
    }).then(function(data){
      if(!validCatalogue(data))throw Error('Catalogue non valide');
      return data;
    }).finally(function(){clearTimeout(timer);});
  }
  function load(){
    // Only the most recent refresh may commit network/cache results.
    var revision=++loadRevision;
    // A corrupt JSON payload must not be overwritten by a remote catalogue.
    var rawLocal,local;
    try{
      rawLocal=localStorage.getItem(KEY);
      local=rawLocal===null?[]:JSON.parse(rawLocal);
    }catch(error){
      status('Données locales illisibles : synchronisation suspendue pour éviter leur perte');
      trace('storage-error','JSON local illisible ; stockage préservé');
      return;
    }
    if(!Array.isArray(local)){
      status('Format local inattendu : synchronisation suspendue pour éviter la perte de données');
      trace('storage-error','Catalogue local non tableau ; stockage préservé');
      return;
    }
    places=local;
    render();
    if(window.NearbyProximity)window.NearbyProximity.setPlaces(places);
    status(places.length+' lieux locaux · synchronisation GitHub…');
    fetchCatalogue(REMOTE_URL,8000).then(function(data){
      if(revision!==loadRevision)return;
      localStorage.setItem(CATALOGUE_KEY,JSON.stringify(data));
      mergeCatalogue(data,'GitHub synchronisé');
    }).catch(function(error){
      if(revision!==loadRevision)return;
      var reason=error && error.name==='AbortError' ? 'délai dépassé' : 'réseau ou réponse invalide';
      var cached=readJSON(CATALOGUE_KEY,null);
      if(validCatalogue(cached)){
        mergeCatalogue(cached,'cache GitHub ('+reason+')');
        return;
      }
      fetchCatalogue('data/places.sample.json',5000).then(function(data){
        if(revision!==loadRevision)return;
        mergeCatalogue(data,'catalogue embarqué ('+reason+')');
      }).catch(function(){
        if(revision!==loadRevision)return;
        render();
        status(places.length+' lieux locaux · échec GitHub et catalogue embarqué ('+reason+')');
      });
    });
  }
  function addManual(name,lat,lon,category,comment){
    if(!name || !validPosition(lat,lon))throw Error('Nom et coordonnées invalides');
    var place={id:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:name,
      latitude:lat,longitude:lon,categories:[category||'culture'],comment:String(comment||'').trim(),visited:false,createdAt:Date.now(),
      alert:{enabled:true,walkingMinutes:15,cooldownHours:24},source:{type:'manual'}};
    places.push(place);
    try{save();render();return place;}catch(error){places.pop();throw error;}
  }
  function parseMapsLink(raw,depth){
    if((depth||0)>4)throw Error('Lien d’import imbriqué trop profondément');
    var input=String(raw||'').trim();
    if(!input)throw Error('Coller un lien Maps avant de lancer l’import');
    var extracted=input.match(/(?:nearbyplaces:\/\/|https:\/\/)[^\s<>]+/i);
    if(extracted)input=extracted[0].replace(/[),.;]+$/,'');
    var url=new URL(input), host=url.hostname.toLowerCase(), coords=null, name='';
    if(url.protocol==='https:' && host==='maps.apple' && /^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))throw Error('Lien Apple Plans court : résolution nécessaire');
    if(url.protocol==='nearbyplaces:' && url.hostname==='import'){
      var embedded=url.searchParams.get('url');
      if(embedded)return parseMapsLink(embedded,(depth||0)+1);
      coords=url.searchParams.get('ll');
      name=url.searchParams.get('name')||'';
    }else if(url.protocol==='https:' && (host==='maps.apple.com'||host==='www.maps.apple.com')){
      // 'coordinate' identifies a place, 'daddr'/'destination' a route's target.
      // 'll' is only a legacy map pin/center; 'sll' biases search, not a POI.
      // Never import the viewport if a directions URL has an unparseable target.
      var directions=/^\/directions\/?$/.test(url.pathname);
      coords=directions
        ? (url.searchParams.get('destination')||url.searchParams.get('daddr'))
        : (url.searchParams.get('coordinate')||url.searchParams.get('daddr')||url.searchParams.get('ll')||url.searchParams.get('q'));
      name=url.searchParams.get('name')||(directions?'Destination Apple Plans':url.searchParams.get('q'))||'Lieu Apple Plans';
    }else if(url.protocol==='https:' && (host==='maps.app.goo.gl'||host==='goo.gl'||['google.com','www.google.com','maps.google.com','google.co.jp','www.google.co.jp','maps.google.co.jp'].includes(host))){
      if(host==='maps.app.goo.gl'||host==='goo.gl')throw Error('Lien Google Maps raccourci : résolution nécessaire');
      var at=url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      var marker=url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      var query=url.searchParams.get('q')||url.searchParams.get('query');
      var markerCoords=marker?marker[1]+','+marker[2]:null;
      var numericQuery=query && /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(query);
      // The @latitude,longitude segment is the camera position, not a POI coordinate.
      // Only import it when the URL explicitly represents the map viewport.
      var mapViewport=/^\/maps\/@/.test(url.pathname);
      coords=(numericQuery?query:null)||markerCoords||url.searchParams.get('ll')||(mapViewport&&at?at[1]+','+at[2]:null);
      var pathName=url.pathname.match(/\/maps\/place\/([^/]+)/);
      name=pathName?decodeURIComponent(pathName[1].replace(/\+/g,' ')):(query && !numericQuery?query:'Lieu Google Maps');
      if(!coords)throw Error('Coordonnées Google Maps absentes. Utiliser un lien complet avec latitude et longitude.');
    }else throw Error('Lien Apple Plans, Google Maps ou Nearby Places requis');
    if(!coords)throw Error('URL résolue mais sans coordonnées GPS ; destination : '+url.href.slice(0,180));
    var match=coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!match)throw Error('Coordonnées absentes ou non reconnues');
    var lat=Number(match[1]),lon=Number(match[2]);
    if(!validPosition(lat,lon))throw Error('Coordonnées invalides');
    return {name:name,latitude:lat,longitude:lon};
  }
  function resolveMapsURL(value,depth){
    if((depth||0)>4)return Promise.reject(Error('Lien d’import imbriqué trop profondément'));
    trace('import-url','entrée : '+String(value||'').slice(0,250));
    // Links pasted from Shortcuts can contain a percent-encoded short Maps URL.
    // Resolve the inner URL before parsing the surrounding nearbyplaces://import URL.
    var incoming;
    try{incoming=new URL(String(value||'').trim());}catch(error){}
    if(incoming && incoming.protocol==='nearbyplaces:' && incoming.hostname==='import'){
      var embedded=incoming.searchParams.get('url');
      if(embedded){
        return resolveMapsURL(embedded,(depth||0)+1).then(function(resolved){
          incoming.searchParams.set('url',resolved);
          return incoming.href;
        });
      }
    }
    var match=String(value||'').match(/https:\/\/(?:maps\.apple\/p\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)[^\s<>]+/i);
    if(!match){trace('import-url','URL directe');return Promise.resolve(value);}
    // Short URLs copied from shared prose may end with punctuation outside the URL.
    var shortLink=match[0].replace(/[),.;]+$/,'');
    trace('import-url','résolution native : '+shortLink);
    var resolver=window.NearbyResolver;
    if(!resolver || typeof resolver.resolve!=='function')return Promise.reject(Error('Résolveur iOS absent : installer le plugin local puis reconstruire'));
    return new Promise(function(resolve,reject){
      // A Cordova bridge that never calls back must not block future shared URLs.
      // Native URLSession has an 18s resource timeout; 22s bounds bridge stalls.
      var settled=false;
      var timer=setTimeout(function(){complete(reject,Error('Résolution iOS : délai dépassé (22 s)'));},22000);
      function complete(callback,value){
        if(settled)return;
        settled=true;clearTimeout(timer);
        callback(value);
      }
      try{
        resolver.resolve(shortLink,function(result){
          if(settled)return;
          if(!result || !Number.isInteger(Number(result.httpStatus)) || Number(result.httpStatus)<200 || Number(result.httpStatus)>=300){complete(reject,Error('Réponse du résolveur iOS invalide'));return;}
          trace('import-native','HTTP '+result.httpStatus+' → '+String(result.url).slice(0,250));
          // Only accept a destination with coordinates, never a redirect to arbitrary hosts.
          var candidates=[result && result.url, result && result.htmlMapURL];
          var target=candidates.find(function(candidate){
            if(typeof candidate!=='string' || candidate===shortLink)return false;
            try{parseMapsLink(candidate);return true;}catch(error){return false;}
          });
          if(!target){complete(reject,Error('Lien court sans destination Maps avec coordonnées exploitables'));return;}
          complete(resolve,String(value).replace(shortLink,target));
        },function(error){
          if(settled)return;
          trace('import-native-error',String(error));
          complete(reject,Error('Résolution iOS : '+String(error)));
        });
      }catch(error){complete(reject,Error('Résolution iOS : '+String(error)));}
    });
  }
  var pendingImport=null, importQueue=[];
  function showNextImport(){
    if(pendingImport || !importQueue.length)return;
    pendingImport=importQueue.shift();
    $('import-name').value=/^(?:Lieu (?:Apple Plans|Google Maps)|Destination Apple Plans)$/.test(pendingImport.name)?'':pendingImport.name;
    $('import-category').value='culture';
    $('import-comment').value='';
    $('import-coordinates').textContent=pendingImport.latitude.toFixed(6)+', '+pendingImport.longitude.toFixed(6);
    $('import-dialog').hidden=false;
    trace('import-form','confirmation demandée '+pendingImport.latitude+','+pendingImport.longitude);
    $('import-name').focus();
  }
  function importMapsURL(value){
    var parsed=parseMapsLink(value);
    var duplicate=places.some(function(p){return p && validPosition(p.latitude,p.longitude) && Math.abs(p.latitude-parsed.latitude)<0.00001 &&
      Math.abs(p.longitude-parsed.longitude)<0.00001;});
    if(duplicate){trace('import-result','doublon '+parsed.name);status('Ce lieu existe déjà dans le catalogue');return false;}
    if((pendingImport && Math.abs(pendingImport.latitude-parsed.latitude)<0.00001 && Math.abs(pendingImport.longitude-parsed.longitude)<0.00001) || importQueue.some(function(p){return Math.abs(p.latitude-parsed.latitude)<0.00001 && Math.abs(p.longitude-parsed.longitude)<0.00001;})){status('Ce lieu est déjà en attente de confirmation');return false;}
    importQueue.push(parsed);showNextImport();
    return true;
  }
  $('import-cancel').onclick=function(){pendingImport=null;$('import-dialog').hidden=true;status('Import annulé');showNextImport();};
  $('import-confirm').onclick=function(){
    if(!pendingImport)return;
    var name=$('import-name').value.trim(),category=$('import-category').value,comment=$('import-comment').value.trim();
    if(!name){status('Libellé obligatoire');$('import-name').focus();return;}
    var parsed=pendingImport;
    // A catalogue refresh or manual addition may have inserted this location
    // while the confirmation sheet was open. Recheck before persisting.
    if(places.some(function(p){return p && validPosition(p.latitude,p.longitude) && Math.abs(p.latitude-parsed.latitude)<0.00001 && Math.abs(p.longitude-parsed.longitude)<0.00001;})){
      trace('import-result','doublon à la confirmation '+parsed.latitude+','+parsed.longitude);
      pendingImport=null;$('import-dialog').hidden=true;
      status('Ce lieu existe déjà : import non enregistré');showNextImport();return;
    }
    addManual(name,parsed.latitude,parsed.longitude,category,comment);
    trace('import-result','OK '+name+' '+parsed.latitude+','+parsed.longitude);
    pendingImport=null;$('import-dialog').hidden=true;$('maps-url').value='';
    status('Lieu enregistré localement');showNextImport();
  };
  function receiveSharedURL(value){
    trace('share-url','reçu : '+String(value).slice(0,250));
    return resolveMapsURL(value).then(function(resolved){
      return importMapsURL(resolved);
    }).catch(function(error){
      trace('share-error',String(error));
      $('maps-url').value=value;
      status('Import impossible : '+error.message+' (le lien court peut nécessiter une résolution native)');
      return false;
    });
  }
  // Cordova may deliver the URL before deviceready. Wait for plugins (especially NearbyResolver).
  // Process a small FIFO so a second deep link cannot overwrite the first during startup.
  var pendingSharedURLs=[], sharedReady=!window.cordova, processingSharedURL=false;
  function flushPendingSharedURLs(){
    if(!sharedReady || processingSharedURL || !pendingSharedURLs.length)return;
    processingSharedURL=true;
    var next=pendingSharedURLs.shift();
    Promise.resolve().then(function(){return receiveSharedURL(next);})
      .catch(function(error){trace('share-error',String(error));status('Import partagé : '+String(error));})
      .then(function(){processingSharedURL=false;flushPendingSharedURLs();});
  }
  window.handleOpenURL=function(url){
    trace('deeplink','reçu : '+String(url).slice(0,250));
    try{
      var incoming=new URL(url);
      if(incoming.protocol!=='nearbyplaces:' || incoming.hostname!=='import')return;
      var shared=incoming.searchParams.get('url')||url;
      if(!shared)return;
      if(pendingSharedURLs.length>=10){status('Trop de liens partagés en attente');return;}
      pendingSharedURLs.push(shared);
      setTimeout(flushPendingSharedURLs,0);
    }catch(error){status('Lien partagé invalide');}
  };
  // Drain URLs received by the minimal callback installed before cordova.js.
  // The main handler still validates scheme, hostname, queue capacity and content.
  if(Array.isArray(window.__nearbyEarlyDeepLinks)){
    window.__nearbyEarlyDeepLinks.splice(0,10).forEach(window.handleOpenURL);
  }
  document.addEventListener('deviceready',function(){sharedReady=true;flushPendingSharedURLs();},{once:true});
  document.addEventListener('resume',flushPendingSharedURLs);
  // The extension writes a durable FIFO. A record is acknowledged only after
  // it has been persisted locally (or identified as an existing coordinate).
  var nativeShareBusy=false;
  function ackNativeShare(resolver,shareID){
    return new Promise(function(resolve,reject){
      resolver.ackShared(shareID,resolve,function(error){reject(Error(String(error)));});
    });
  }
  function persistNativeShare(resolver,intent){
    if(!intent || typeof intent.shareID!=='string' || !intent.shareID || typeof intent.nearbyURL!=='string' || !intent.nearbyURL){
      return Promise.reject(Error('Enregistrement partagé incomplet ; il reste dans la file'));
    }
    var name=String(intent.nearbyName||'').trim();
    if(!name)return Promise.reject(Error('Nom partagé manquant ; l’import reste en attente'));
    var category=String(intent.nearbyCategory||'culture').trim().toLowerCase();
    if(!NATIVE_CATEGORIES.some(function(item){return item.id===category;}))category='culture';
    return resolveMapsURL(intent.nearbyURL).then(function(resolved){
      var parsed=parseMapsLink(resolved);
      var duplicate=places.some(function(p){return p && validPosition(p.latitude,p.longitude) &&
        Math.abs(p.latitude-parsed.latitude)<0.00001 && Math.abs(p.longitude-parsed.longitude)<0.00001;});
      if(!duplicate)addManual(name,parsed.latitude,parsed.longitude,category,String(intent.nearbyComment||''));
      return ackNativeShare(resolver,intent.shareID).then(function(){
        trace('share-pending',duplicate?'doublon acquitté':'enregistré '+name);
        status(duplicate?'Ce lieu partagé existe déjà':'Lieu partagé enregistré localement');
        return true;
      });
    });
  }
  function importPendingNativeShare(){
    var resolver=window.NearbyResolver;
    if(nativeShareBusy || !resolver || typeof resolver.readShared!=='function' || typeof resolver.ackShared!=='function')return;
    nativeShareBusy=true;
    resolver.readShared(function(intent){
      if(!intent || !intent.shareID){nativeShareBusy=false;return;}
      trace('share-pending','App Group : '+String(intent.nearbyURL||'').slice(0,180));
      persistNativeShare(resolver,intent).then(function(){
        nativeShareBusy=false;
        importPendingNativeShare();
      }).catch(function(error){
        nativeShareBusy=false;
        trace('share-error','import conservé : '+String(error));
        status('Import partagé en attente : '+error.message);
      });
    },function(error){nativeShareBusy=false;trace('share-error','lecture App Group : '+String(error));});
  }
  function initializeNativeShare(){
    var resolver=window.NearbyResolver;
    if(!resolver){trace('share-init','résolveur absent');return;}
    if(typeof resolver.syncCategories==='function')resolver.syncCategories(NATIVE_CATEGORIES,function(){
      trace('share-init','catégories synchronisées');
    },function(error){trace('share-error','catégories : '+String(error));});
    importPendingNativeShare();
  }
  document.addEventListener('deviceready',initializeNativeShare,{once:true});
  document.addEventListener('resume',importPendingNativeShare);
  $('maps-add').onclick=function(){
    var value=$('maps-url').value;
    trace('import-click','bouton pressé : '+String(value).slice(0,250));
    status('Résolution du lien…');
    resolveMapsURL(value).then(function(resolved){
      importMapsURL(resolved);
    }).catch(function(error){trace('import-error',String(error));status('Import du lieu : '+error.message);});
  };
  $('export').onclick=function(){
    var payload={schemaVersion:1,exportedAt:new Date().toISOString(),places:places.filter(function(p){return p && p.source&&p.source.type==='manual';}),
      visited:places.filter(function(p){return p && p.visited && typeof p.id==='string';}).map(function(p){return p.id;})};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
    link.download='nearby-places-sauvegarde.json';document.body.append(link);link.click();link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},30000);
    status('Sauvegarde JSON préparée · '+payload.places.length+' lieux personnels');
  };
  $('import').onchange=function(event){
    var file=event.target.files&&event.target.files[0];if(!file)return;
    file.text().then(function(raw){
      var data=JSON.parse(raw);
      if(data.schemaVersion!==1||!Array.isArray(data.places)||data.places.length>5000||!Array.isArray(data.visited))throw Error('Format de sauvegarde invalide');
      var ids=new Set();
      data.places.forEach(function(p){
        if(!p||typeof p.id!=='string'||!p.id.startsWith('manual-')||ids.has(p.id)||
          typeof p.name!=='string'||!p.name.trim()||!validPosition(p.latitude,p.longitude)||
          !Array.isArray(p.categories)||!p.source||p.source.type!=='manual')throw Error('Lieu invalide');
        ids.add(p.id);
      });
      var unkeyed=places.filter(function(p){return !p || typeof p!=='object' || typeof p.id!=='string' || !p.id;});
      var merged=new Map(places.filter(function(p){return p && typeof p.id==='string' && p.id;}).map(function(p){return [p.id,p];}));
      data.places.forEach(function(p){merged.set(p.id,p);});
      var visited=new Set(data.visited.filter(function(id){return typeof id==='string';}));
      places=Array.from(merged.values()).map(function(p){return Object.assign({},p,{visited:!!p.visited||visited.has(p.id)});}).concat(unkeyed);
      save();render();status('Sauvegarde restaurée · '+data.places.length+' lieux personnels');
    }).catch(function(error){status('Import refusé : '+error.message);}).finally(function(){event.target.value='';});
  };
  $('locate').onclick=function(){if(!navigator.geolocation){status('GPS indisponible');return;}status('Recherche GPS…');navigator.geolocation.getCurrentPosition(function(p){var c=p.coords;status('Position reçue ; précision '+Math.round(c.accuracy)+' m');render({latitude:c.latitude,longitude:c.longitude});},function(e){status('GPS : '+e.message);},{enableHighAccuracy:true,timeout:20000,maximumAge:0});};
  $('add').onclick=function(){var name=$('name').value.trim(),lat=Number($('lat').value),lon=Number($('lon').value);if(!name||!$('lat').value||!$('lon').value||!validPosition(lat,lon)){status('Nom et coordonnées valides obligatoires');return;}addManual(name,lat,lon,$('category').value);status('Lieu ajouté localement');$('name').value='';};
  $('refresh').onclick=load;
  $('reset').onclick=function(){if(!window.confirm('Réinitialiser tous les lieux locaux, les lieux personnels et les statuts visités ? Exporter JSON avant de confirmer.'))return;localStorage.removeItem(KEY);localStorage.removeItem(CATALOGUE_KEY);load();};
  if(window.NearbyProximity)window.NearbyProximity.wire();
  document.addEventListener('deviceready',function(){status('Cordova prêt');},{once:true});load();
}());
