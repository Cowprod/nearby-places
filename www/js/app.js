(function () {
  'use strict';
  var KEY = 'nearby-places-v1', CATALOGUE_KEY = 'nearby-places-catalogue-v1', places = [];
  var REMOTE_URL = 'https://raw.githubusercontent.com/Cowprod/nearby-places/main/data/places.sample.json';
  var $ = function (id) { return document.getElementById(id); };
  function validPosition(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
  function distanceMeters(a,b,c,d) { var r=Math.PI/180, x=(c-a)*r, y=(d-b)*r, q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
  function save(){ localStorage.setItem(KEY,JSON.stringify(places)); if(window.NearbyProximity)window.NearbyProximity.setPlaces(places); }
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
    var url=new URL(raw.trim());
    if(url.protocol!=='https:' || !['maps.apple.com','www.maps.apple.com'].includes(url.hostname))throw Error('Lien Apple Plans HTTPS requis');
    var coords=url.searchParams.get('ll')||url.searchParams.get('coordinate')||url.searchParams.get('daddr');
    if(!coords)throw Error('Ce lien ne contient pas de coordonnées. Les liens courts nécessitent une résolution supplémentaire.');
    var match=coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!match)throw Error('Coordonnées absentes ou non reconnues');
    var lat=Number(match[1]),lon=Number(match[2]);
    if(!validPosition(lat,lon))throw Error('Coordonnées invalides');
    return {name:url.searchParams.get('q')||url.searchParams.get('name')||'Lieu Apple Plans',latitude:lat,longitude:lon};
  }
  $('maps-add').onclick=function(){
    try{
      var parsed=parseMapsLink($('maps-url').value);
      addManual(parsed.name,parsed.latitude,parsed.longitude,$('category').value);
      status('Lieu importé depuis Apple Plans (local)');$('maps-url').value='';
    }catch(error){status('Import Plans : '+error.message);}
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
  $('reset').onclick=function(){localStorage.removeItem(KEY);localStorage.removeItem(CATALOGUE_KEY);load();};
  if(window.NearbyProximity)window.NearbyProximity.wire();
  document.addEventListener('deviceready',function(){status('Cordova prêt');},{once:true});load();
}());
