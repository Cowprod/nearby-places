(function () {
  'use strict';
  var KEY = 'nearby-places-v1', places = [];
  var $ = function (id) { return document.getElementById(id); };
  function validPosition(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180; }
  function distanceMeters(a,b,c,d) { var r=Math.PI/180, x=(c-a)*r, y=(d-b)*r, q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(q))); }
  function save(){ localStorage.setItem(KEY,JSON.stringify(places)); }
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
      $('places').append(card);
    });
  }
  function load(){
    var local=[];
    try {
      var raw=localStorage.getItem(KEY);
      if(raw){local=JSON.parse(raw);if(!Array.isArray(local))local=[];}
    } catch(e){local=[];}
    fetch('data/places.sample.json',{cache:'no-store'}).then(function(r){
      if(!r.ok)throw Error('HTTP '+r.status);
      return r.json();
    }).then(function(d){
      if(!Array.isArray(d.places))throw Error('Catalogue invalide');
      var byId=new Map(local.filter(function(p){return p && p.id;}).map(function(p){return [p.id,p];}));
      var seeded=d.places.map(function(p){
        var previous=byId.get(p.id);
        if(previous)byId.delete(p.id);
        return previous ? Object.assign({},p,{visited:!!previous.visited}) : p;
      });
      places=seeded.concat(Array.from(byId.values()));
      save();render();
      status(places.length+' lieux disponibles ('+d.places.length+' dans le catalogue Git)');
    }).catch(function(){
      places=local;render();
      status(places.length+' lieux locaux — catalogue embarqué indisponible');
    });
  }
  $('locate').onclick=function(){if(!navigator.geolocation){status('GPS indisponible');return;}status('Recherche GPS…');navigator.geolocation.getCurrentPosition(function(p){var c=p.coords;status('Position reçue ; précision '+Math.round(c.accuracy)+' m');render({latitude:c.latitude,longitude:c.longitude});},function(e){status('GPS : '+e.message);},{enableHighAccuracy:true,timeout:20000,maximumAge:0});};
  $('add').onclick=function(){var name=$('name').value.trim(),lat=Number($('lat').value),lon=Number($('lon').value);if(!name||!$('lat').value||!$('lon').value||!validPosition(lat,lon)){status('Nom et coordonnées valides obligatoires');return;}places.push({id:'manual-'+Date.now(),name:name,latitude:lat,longitude:lon,categories:[$('category').value],visited:false,alert:{enabled:true,walkingMinutes:15,cooldownHours:24},source:{type:'manual'}});save();render();status('Lieu ajouté localement');$('name').value='';};
  $('reset').onclick=function(){localStorage.removeItem(KEY);load();};
  document.addEventListener('deviceready',function(){status('Cordova prêt');},{once:true});load();
}());
