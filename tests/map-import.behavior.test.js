'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('www/js/app.js', 'utf8');
function harness() {
  const store = new Map(), elements = new Map();
  function element() {
    return { value:'', textContent:'', style:{}, children:[],
      append(...items){this.children.push(...items);},
      replaceChildren(...items){this.children=items;},
      remove(){}, click(){}, setAttribute(){} };
  }
  const document = {
    getElementById(id){ if(!elements.has(id))elements.set(id,element());return elements.get(id); },
    createElement(){return element();},
    addEventListener(){}, body:{append(){}}
  };
  const localStorage = {
    getItem(key){return store.get(key)??null;},
    setItem(key,value){store.set(key,String(value));},
    removeItem(key){store.delete(key);}
  };
  const context={window:{},document,localStorage,URL,URLSearchParams,AbortController,
    setTimeout(fn,ms){if(ms===0)fn();return 1;},clearTimeout(){},
    fetch(){return new Promise(()=>{});},Promise,Date,Math,Number,Blob,console,Set,Map};
  vm.runInNewContext(source,context,{filename:'www/js/app.js'});
  document.getElementById('category').value='culture';
  function importURL(url){document.getElementById('maps-url').value=url;
    document.getElementById('maps-add').onclick();
    return JSON.parse(store.get('nearby-places-v1')||'[]');
  }
  function status(){return document.getElementById('status').textContent;}
  return {importURL,status,store,window:context.window};
}
function checkPlace(p,lat,lon){assert.ok(p);assert.equal(p.latitude,lat);assert.equal(p.longitude,lon);}
const h=harness();
let list=h.importURL('https://maps.apple.com/place?coordinate=35.7001,139.7702&name=Lieu+Apple');
assert.equal(list.length,1);
checkPlace(list[0],35.7001,139.7702);
assert.equal(list[0].name,'Lieu Apple');
list=h.importURL('https://maps.apple.com/place?coordinate=35.7001,139.7702&name=Lieu+Apple');
assert.equal(list.length,1,'pas de doublon pour les mêmes coordonnées');
list=h.importURL('https://www.google.com/maps/place/Test/@35.5,139.5,16z/data=!4m4!3d35.701!4d139.772');
assert.equal(list.length,2);
checkPlace(list[1],35.701,139.772);
list=h.importURL('https://www.google.com/maps/search/?api=1&query=35.704%2C139.776');
assert.equal(list.length,3);
checkPlace(list[2],35.704,139.776);
list=h.importURL('nearbyplaces://import?ll=35.705,139.777&name=Lieu+ChatGPT');
assert.equal(list.length,4);
checkPlace(list[3],35.705,139.777);
assert.equal(list[3].name,'Lieu ChatGPT');
list=h.importURL('https://maps.app.goo.gl/shortCode');
assert.equal(list.length,4,'lien court non résolu ne crée rien');
assert.match(h.status(),/raccourci/);
list=h.importURL('https://evil.example/redirect?ll=35.7,139.7');
assert.equal(list.length,4,'hôte non autorisé');
h.window.handleOpenURL('nearbyplaces://import?ll=35.706,139.778&name=Transmis');
list=JSON.parse(h.store.get('nearby-places-v1'));
assert.equal(list.length,5);
assert.equal(list[4].name,'Transmis');
console.log('PASS imports simulés : Apple Plans, Google Maps, ChatGPT, dédoublonnage, validation d’hôte, URL scheme');
