(function () {
  'use strict';
  var KEY = 'nearby-places-v1', CATALOGUE_KEY = 'nearby-places-catalogue-v1', places = [];
  var REMOTE_URL = 'https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json';
  var $ = function (id) { return document.getElementById(id); };
  function validPosition(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
  function distanceMeters(a,b,c,d) { var r=Math.PI/180, x=(c-a)*r, y=(d-b)*r, q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
  function save(){ localStorage.setItem(KEY,JSON.stringify(places)); if(window.NearbyProximity)window.NearbyProximity.setPlaces(places); }
  function trace(kind,detail){if(window.NearbyProximity&&window.NearbyProximity.logEvent)window.NearbyProximity.logEvent(kind,detail);}
  function status(s){ $('status').textContent=s; }
  function render(position){
    $('places').replaceChildren();
    places.forEach(function(p){
      var card=document.createElement('section');card.className='place';
      var head=document.createElement('div');head.className='row';
      var title=document.createElement('strong');title.textContent=p.name;
      var button=document.createElement('button');button.textContent=p.visited?'Réactiver':'Visité';button.onclick=function(){p.visited=!p.visited;save();render(position);};
      head.append(title,button);card.append(head);
      var meta=document.createElement('p');meta.className='tag';meta.textContent=(p.categories||[]).join(', ')+' · '+p.latitude.toFixed(5)+', '+p.longitude.toFixed(5);
      card.append(meta);
      if(position){var km=distanceMeters(position.latitude,position.longitude,p.latitude,p.longitude)/1000;var t=document.createElement('p');t.textContent=km.toFixed(2)+' km à vol d’oiseau (pas un temps de marche)';card.append(t);}
      var directions=document.createElement('a');
      directions.href='https://maps.apple.com/?daddr='+encodeURIComponent(p.latitude+','+p.longitude)+'&dirflg=w';
      directions.textContent='Itinéraire à pied (Plans)';
      directions.target='_blank';
      directions.rel='noopener noreferrer';
      directions.style.color='#5bd7bb';
      card.append(directions);
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
    var previous=readJSON(KEY,[]);
    if(!Array.isArray(previous))previous=[];
    var byId=new Map(previous.filter(function(p){return p && typeof p.id==='string';}).map(function(p){return [p.id,p];}));
    var incoming=data.places.map(function(p){
      var old=byId.get(p.id);
      byId.delete(p.id);
      return Object.assign({},p,{visited:old ? !!old.visited : !!p.visited});
    });
    // Keep user-entered places and locally edited places when a catalogue is refreshed.
    var manuallyAdded=Array.from(byId.values()).filter(function(p){return p.source && p.source.type==='manual';});
    places=incoming.concat(manuallyAdded);
    save();render();
    status(places.length+' lieux · '+label);
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
    var local=readJSON(KEY,[]);
    places=Array.isArray(local)?local:[];
    render();
    if(window.NearbyProximity)window.NearbyProximity.setPlaces(places);
    status(places.length+' lieux locaux · synchronisation GitHub…');
    fetchCatalogue(REMOTE_URL,8000).then(function(data){
      localStorage.setItem(CATALOGUE_KEY,JSON.stringify(data));
      mergeCatalogue(data,'GitHub synchronisé');
    }).catch(function(error){
      var reason=error && error.name==='AbortError' ? 'délai dépassé' : 'réseau ou réponse invalide';
      var cached=readJSON(CATALOGUE_KEY,null);
      if(validCatalogue(cached)){
        mergeCatalogue(cached,'cache GitHub ('+reason+')');
        return;
      }
      fetchCatalogue('data/places.sample.json',5000).then(function(data){
        mergeCatalogue(data,'catalogue embarqué ('+reason+')');
      }).catch(function(){
        render();
        status(places.length+' lieux locaux · échec GitHub et catalogue embarqué ('+reason+')');
      });
    });
  }
  function addManual(name,lat,lon,category){
    if(!name || !validPosition(lat,lon))throw Error('Nom et coordonnées invalides');
    var place={id:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:name,
      latitude:lat,longitude:lon,categories:[category||'culture'],visited:false,
      alert:{enabled:true,walkingMinutes:15,cooldownHours:24},source:{type:'manual'}};
    places.push(place);save();render();return place;
  }
  function parseMapsLink(raw){
    var input=String(raw||'').trim();
    if(!input)throw Error('Coller un lien Maps avant de lancer l’import');
    var extracted=input.match(/(?:nearbyplaces:\/\/|https:\/\/)[^\s<>]+/i);
    if(extracted)input=extracted[0].replace(/[),.;]+$/,'');
    var url=new URL(input), host=url.hostname.toLowerCase(), coords=null, name='';
    if(url.protocol==='https:' && host==='maps.apple' && /^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))throw Error('Lien Apple Plans court : résolution nécessaire');
    if(url.protocol==='nearbyplaces:' && url.hostname==='import'){
      var embedded=url.searchParams.get('url');
      if(embedded)return parseMapsLink(embedded);
      coords=url.searchParams.get('ll');
      name=url.searchParams.get('name')||'Lieu ChatGPT';
    }else if(url.protocol==='https:' && (host==='maps.apple.com'||host==='www.maps.apple.com')){
      coords=url.searchParams.get('ll')||url.searchParams.get('coordinate')||url.searchParams.get('daddr')||url.searchParams.get('sll')||url.searchParams.get('q');
      name=url.searchParams.get('name')||url.searchParams.get('q')||'Lieu Apple Plans';
    }else if(url.protocol==='https:' && (host==='www.google.com'||host==='google.com'||host==='maps.google.com'||host==='maps.app.goo.gl')){
      if(host==='maps.app.goo.gl')throw Error('Lien Google Maps raccourci : ouvrir dans le navigateur et copier l’URL complète.');
      var at=url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      var marker=url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
      var query=url.searchParams.get('q')||url.searchParams.get('query');
      var markerCoords=marker?marker[1]+','+marker[2]:null;
      var numericQuery=query && /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(query);
      coords=(numericQuery?query:null)||markerCoords||url.searchParams.get('ll')||(at?at[1]+','+at[2]:null);
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
  function resolveMapsURL(value){
    trace('import-url','entrée : '+String(value||'').slice(0,250));
    var match=String(value||'').match(/https:\/\/(?:maps\.apple\/p\/|maps\.app\.goo\.gl\/)[^\s<>]+/i);
    if(!match){trace('import-url','URL directe');return Promise.resolve(value);}
    trace('import-url','résolution native : '+match[0]);
    var resolver=window.NearbyResolver;
    if(!resolver || typeof resolver.resolve!=='function')return Promise.reject(Error('Résolveur iOS absent : installer le plugin local puis reconstruire'));
    return new Promise(function(resolve,reject){
      resolver.resolve(match[0],function(result){
        if(!result || !Number.isInteger(Number(result.httpStatus)) || Number(result.httpStatus)<200 || Number(result.httpStatus)>=300){reject(Error('Réponse du résolveur iOS invalide'));return;}
        trace('import-native','HTTP '+result.httpStatus+' → '+String(result.url).slice(0,250));
        // Accept only a destination whose coordinates can actually be parsed.
        // A short Maps URL may return an HTML page with a usable canonical link.
        var candidates=[result && result.url, result && result.htmlMapURL];
        var target=candidates.find(function(candidate){
          if(typeof candidate!=='string' || candidate===match[0])return false;
          try{parseMapsLink(candidate);return true;}catch(error){return false;}
        });
        if(!target){reject(Error('Lien court sans destination Maps avec coordonnées exploitables'));return;}
        resolve(String(value).replace(match[0],target));
      },function(error){trace('import-native-error',String(error));reject(Error('Résolution iOS : '+String(error)));});
    });
  }
  function importMapsURL(value){
    var parsed=parseMapsLink(value);
    var duplicate=places.some(function(p){return Math.abs(p.latitude-parsed.latitude)<0.00001 &&
      Math.abs(p.longitude-parsed.longitude)<0.00001;});
    if(duplicate){trace('import-result','doublon '+parsed.name);status('Ce lieu existe déjà dans le catalogue');return false;}
    addManual(parsed.name,parsed.latitude,parsed.longitude,$('category').value);
    trace('import-result','OK '+parsed.name+' '+parsed.latitude+','+parsed.longitude);
    status('Lieu importé localement');return true;
  }
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
  document.addEventListener('deviceready',function(){sharedReady=true;flushPendingSharedURLs();},{once:true});
  document.addEventListener('resume',flushPendingSharedURLs);
  function registerNativeShare(){
    var plugin=window.cordova && window.cordova.openwith;
    if(!plugin){trace('share-init','plugin absent');status('Partage natif indisponible : extension non installée');return;}
    try{
      trace('share-init','initialisation');
      plugin.init(function(){trace('share-init','plugin prêt');console.log('Share Extension prête');},function(error){trace('share-error','init '+String(error));console.warn('Share Extension',error);});
      plugin.addHandler(function(intent){
        trace('share-intent','reçu : '+JSON.stringify(intent||{}).slice(0,500));
        var values=[];
        function candidate(value){
          if(typeof value!=='string' || !/(?:https:\/\/|nearbyplaces:\/\/)/i.test(value))return;
          if(values.length<10 && values.indexOf(value)===-1)values.push(value);
        }
        // The share description (intent.text) can be only a page title; prefer item.data.
        if(intent && Array.isArray(intent.items))intent.items.forEach(function(item){
          if(item){candidate(item.data);candidate(item.text);}
        });
        if(intent)candidate(intent.text);
        function tryCandidate(index){
          if(index>=values.length){
            trace('share-error','aucune URL Maps exploitable');
            status('Partage reçu, mais aucune URL exploitable avec coordonnées');
            return Promise.resolve(false);
          }
          return receiveSharedURL(values[index]).then(function(ok){return ok?true:tryCandidate(index+1);});
        }
        tryCandidate(0);
      });
    }catch(error){trace('share-error','initialisation '+String(error));status('Initialisation partage : '+String(error));}
  }
  document.addEventListener('deviceready',registerNativeShare,{once:true});
  $('maps-add').onclick=function(){
    var value=$('maps-url').value;
    trace('import-click','bouton pressé : '+String(value).slice(0,250));
    status('Résolution du lien…');
    resolveMapsURL(value).then(function(resolved){
      if(importMapsURL(resolved))$('maps-url').value='';
    }).catch(function(error){trace('import-error',String(error));status('Import du lieu : '+error.message);});
  };
  $('export').onclick=function(){
    var payload={schemaVersion:1,exportedAt:new Date().toISOString(),places:places.filter(function(p){return p.source&&p.source.type==='manual';}),
      visited:places.filter(function(p){return p.visited;}).map(function(p){return p.id;})};
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
      var merged=new Map(places.map(function(p){return [p.id,p];}));
      data.places.forEach(function(p){merged.set(p.id,p);});
      var visited=new Set(data.visited.filter(function(id){return typeof id==='string';}));
      places=Array.from(merged.values()).map(function(p){return Object.assign({},p,{visited:!!p.visited||visited.has(p.id)});});
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
