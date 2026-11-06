'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('www/js/app.js', 'utf8');
function harness() {
  const store = new Map(), elements = new Map();
  let confirmAllowed = false;
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
  const context={window:{confirm(){return confirmAllowed;},NearbyResolver:{resolve(url,success,error){if(String(url).includes('/p/okRedirect'))success({httpStatus:200,url:'https://maps.apple.com/?ll=35.720%2C139.790&name=Resolved'});else error('Réseau natif indisponible');}}},document,localStorage,URL,URLSearchParams,AbortController,
    setTimeout(fn,ms){if(ms===0)fn();return 1;},clearTimeout(){},
    fetch(url){
      if(String(url).includes('/p/okRedirect')) return Promise.resolve({url:'https://maps.apple.com/?ll=35.720%2C139.790&name=Resolved'});
      if(String(url).includes('maps.apple/p/') || String(url).includes('maps.app.goo.gl/')) return Promise.reject(new Error('CORS: lien court inaccessible'));
      return new Promise(()=>{});
    },Promise,Date,Math,Number,Blob,console,Set,Map};
  vm.runInNewContext(source,context,{filename:'www/js/app.js'});
  document.getElementById('category').value='culture';
  async function importURL(url){document.getElementById('maps-url').value=url;
    document.getElementById('maps-add').onclick();
    await new Promise(resolve => setImmediate(resolve)); // L'import suit maintenant une résolution Promise.
    return JSON.parse(store.get('nearby-places-v1')||'[]');
  }
  function status(){return document.getElementById('status').textContent;}
  return {importURL,status,store,window:context.window,
    setConfirm(value){confirmAllowed=value;},
    reset(){document.getElementById('reset').onclick();}};
}
function checkPlace(p,lat,lon){assert.ok(p);assert.equal(p.latitude,lat);assert.equal(p.longitude,lon);}
async function main() {
const h=harness();
let list=await h.importURL('https://maps.apple.com/place?coordinate=35.7001,139.7702&name=Lieu+Apple');
assert.equal(list.length,1);
checkPlace(list[0],35.7001,139.7702);
assert.equal(list[0].name,'Lieu Apple');
list=await h.importURL('https://maps.apple.com/place?coordinate=35.7001,139.7702&name=Lieu+Apple');
assert.equal(list.length,1,'pas de doublon pour les mêmes coordonnées');
list=await h.importURL('https://www.google.com/maps/place/Test/@35.5,139.5,16z/data=!4m4!3d35.701!4d139.772');
assert.equal(list.length,2);
checkPlace(list[1],35.701,139.772);
list=await h.importURL('https://www.google.com/maps/search/?api=1&query=35.704%2C139.776');
assert.equal(list.length,3);
checkPlace(list[2],35.704,139.776);
list=await h.importURL('nearbyplaces://import?ll=35.705,139.777&name=Lieu+ChatGPT');
assert.equal(list.length,4);
checkPlace(list[3],35.705,139.777);
assert.equal(list[3].name,'Lieu ChatGPT');
list=await h.importURL('https://maps.apple.com/?q=35.709%2C139.780');
assert.equal(list.length,5,'lien Apple q=latitude,longitude');
checkPlace(list[4],35.709,139.780);
list=await h.importURL('https://www.google.com/maps/place/Good+Shop/@35.11,139.11,15z/data=!4m2!3d35.710!4d139.781?q=Good+Shop');
assert.equal(list.length,6,'Google Maps avec q textuel et marqueur POI');
checkPlace(list[5],35.710,139.781);
assert.equal(list[5].name,'Good Shop');
list=await h.importURL('Voici mon lien de partage : https://maps.apple.com/?ll=35.711,139.782&q=Good%20Cafe');
assert.equal(list.length,7,'URL de partage extraite du texte');
checkPlace(list[6],35.711,139.782);
list=await h.importURL('https://maps.app.goo.gl/shortCode');
assert.equal(list.length,7,'lien court non résolu ne crée rien');
assert.match(h.status(),/Import du lieu : Résolution iOS/, 'échec réseau natif explicite sans création de lieu');
list=await h.importURL('https://maps.apple/p/badRedirect');
assert.equal(list.length,7,'lien Apple court non résolu préserve les données');
list=await h.importURL('https://maps.apple/p/okRedirect');
assert.equal(list.length,8,'lien Apple court redirigé vers coordonnées réelles');
checkPlace(list[7],35.720,139.790);
list=await h.importURL('https://evil.example/redirect?ll=35.7,139.7');
assert.equal(list.length,8,'hôte non autorisé');
h.window.handleOpenURL('nearbyplaces://import?ll=35.706,139.778&name=Transmis');
await new Promise(resolve => setImmediate(resolve));
list=JSON.parse(h.store.get('nearby-places-v1'));
assert.equal(list.length,9);
assert.equal(list[8].name,'Transmis');
h.setConfirm(false);
h.reset();
assert.equal(JSON.parse(h.store.get('nearby-places-v1')).length,9,'annulation du reset préserve les lieux');
h.setConfirm(true);
h.reset();
assert.equal(h.store.has('nearby-places-v1'),false,'réinitialisation explicite seulement');
assert.equal(h.store.has('nearby-places-catalogue-v1'),false,'cache réinitialisé explicitement');
console.log('PASS imports simulés : Apple q/ll/redirection native, Google POI, ChatGPT, texte partagé, anti-doublon, erreur native, reset confirmé');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
