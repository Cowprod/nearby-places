'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('www/js/app.js', 'utf8');
function harness(native = false, earlyURLs = [], controlledFetch = false, seedLocal = null) {
  const store = new Map(), elements = new Map(), listeners = new Map(), hooks = {};
  const nativeResolutions=[], networkCalls=[];
  let confirmAllowed = false;
  function element() {
    return { value:'', textContent:'', style:{}, children:[],
      append(...items){this.children.push(...items);}, focus(){},
      replaceChildren(...items){this.children=items;},
      remove(){}, click(){}, setAttribute(){} };
  }
  const document = {
    getElementById(id){ if(!elements.has(id))elements.set(id,element());return elements.get(id); },
    createElement(){return element();},
    addEventListener(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);}, body:{append(){}}
  };
  const localStorage = {
    getItem(key){return store.get(key)??null;},
    setItem(key,value){store.set(key,String(value));},
    removeItem(key){store.delete(key);}
  };
  if(seedLocal!==null)store.set('nearby-places-v1',seedLocal);
  const context={window:{confirm(){return confirmAllowed;},NearbyResolver:{resolve(url,success,error){nativeResolutions.push(String(url));if(String(url).includes('/p/okRedirect'))success({httpStatus:200,url:'https://maps.apple.com/?ll=35.720%2C139.790&name=Resolved'});else if(String(url).includes('/p/htmlOnly'))success({httpStatus:200,url:'https://maps.apple/p/htmlOnly',htmlMapURL:'https://maps.apple.com/?ll=35.722%2C139.792&name=Recovered'});else if(String(url).includes('/p/untrusted'))success({httpStatus:200,url:'https://evil.example/?ll=35.1,139.1',htmlMapURL:'https://evil.example/?ll=35.2,139.2'});else if(String(url).includes('/p/nullResult'))success(null);else if(String(url).includes('/p/httpFailure'))success({httpStatus:404,url:'https://maps.apple.com/?ll=35.733,139.793'});else error('Réseau natif indisponible');}}},document,localStorage,URL,URLSearchParams,AbortController,
    setTimeout(fn,ms){if(ms===0)fn();return 1;},clearTimeout(){},
    fetch(url){
      if(controlledFetch)return new Promise((resolve,reject)=>networkCalls.push({url:String(url),resolve,reject}));
      if(String(url).includes('/p/okRedirect')) return Promise.resolve({url:'https://maps.apple.com/?ll=35.720%2C139.790&name=Resolved'});
      if(String(url).includes('maps.apple/p/') || String(url).includes('maps.app.goo.gl/')) return Promise.reject(new Error('CORS: lien court inaccessible'));
      return new Promise(()=>{});
    },Promise,Date,Math,Number,Blob,console,Set,Map};
  if(native)context.window.cordova={openwith:{
    init(success){if(success)success();},
    addHandler(callback){hooks.share=callback;}
  }};
  vm.runInNewContext(fs.readFileSync('www/js/deeplink-bootstrap.js','utf8'),context,{filename:'www/js/deeplink-bootstrap.js'});
  earlyURLs.forEach(url=>context.window.handleOpenURL(url));
  vm.runInNewContext(source,context,{filename:'www/js/app.js'});
  document.getElementById('category').value='culture';
  async function importURL(url){document.getElementById('maps-url').value=url;
    document.getElementById('maps-add').onclick();
    await new Promise(resolve => setImmediate(resolve)); // L'import suit maintenant une résolution Promise.
    const dialog=document.getElementById('import-dialog');
    if(dialog.hidden===false){if(!document.getElementById('import-name').value)document.getElementById('import-name').value='Libellé de test';document.getElementById('import-confirm').onclick();}
    return JSON.parse(store.get('nearby-places-v1')||'[]');
  }
  function status(){return document.getElementById('status').textContent;}
  return {importURL,status,store,window:context.window,nativeResolutions,networkCalls,
    resolveFetch(index,data){networkCalls[index].resolve({ok:true,json(){return Promise.resolve(data)}});},
    refresh(){document.getElementById('refresh').onclick();},
    manualAdd(){document.getElementById('add').onclick();},
    setConfirm(value){confirmAllowed=value;},
    fire(event){(listeners.get(event)||[]).forEach(callback=>callback());},
    share(intent){assert.equal(typeof hooks.share,'function','handler Share Extension non déclaré');hooks.share(intent);},
    confirmImport(){document.getElementById('import-confirm').onclick();},
    cancelImport(){document.getElementById('import-cancel').onclick();},
    input(id,value){document.getElementById(id).value=value;},
    formOpen(){return document.getElementById('import-dialog').hidden===false;},
    renderCards(){return document.getElementById('places').children;},
    reset(){document.getElementById('reset').onclick();}};
}
function checkPlace(p,lat,lon){assert.ok(p);assert.equal(p.latitude,lat);assert.equal(p.longitude,lon);}
async function main() {
// Malformed local storage must never be silently replaced with remote data.
const unreadableRaw='{"truncated":';
const unreadable=harness(false,[],true,unreadableRaw);
assert.equal(unreadable.networkCalls.length,0,'invalid JSON suspends background sync');
assert.equal(unreadable.store.get('nearby-places-v1'),unreadableRaw,'invalid raw JSON remains untouched');
assert.match(unreadable.status(),/synchronisation suspendue/);
unreadable.refresh();
assert.equal(unreadable.networkCalls.length,0,'manual refresh also refuses destructive overwrite');

// Mixed legacy records must not crash the UI, import or catalogue refresh.
const legacyRecords=[
  null,
  {id:'manual-damaged',name:'A réparer',latitude:'35.60',longitude:null,categories:{bad:true},source:{type:'manual'},visited:false},
  {id:'manual-healthy',name:'Lieu local',latitude:35.615,longitude:139.615,categories:['occasion'],source:{type:'manual'},visited:false},
  {name:'Enregistrement sans ID',latitude:35.616,longitude:139.616,categories:['culture']}
];
const legacyRaw=JSON.stringify(legacyRecords);
const legacy=harness(false,[],true,legacyRaw);
assert.equal(legacy.store.get('nearby-places-v1'),legacyRaw,'render is read-only');
assert.equal(legacy.renderCards().length,3,'null record skipped without deleting it');
assert.ok(legacy.renderCards().some(card=>card.children.some(child=>String(child.textContent).includes('Coordonnées invalides'))),'bad coordinates signaled in UI');
const validRemote=JSON.parse(fs.readFileSync('data/places.sample.json','utf8'));
legacy.resolveFetch(0,validRemote);
await new Promise(resolve=>setImmediate(resolve));
let retained=JSON.parse(legacy.store.get('nearby-places-v1'));
assert.equal(retained.some(p=>p&&p.id==='manual-damaged'),true,'malformed manual entry preserved after refresh');
assert.equal(retained.some(p=>p&&p.id==='manual-healthy'),true,'healthy manual entry preserved after refresh');
assert.equal(retained.includes(null),true,'unkeyed null kept for later recovery');
assert.equal(retained.some(p=>p&&p.name==='Enregistrement sans ID'),true,'unkeyed legacy record preserved');
legacy.window.handleOpenURL('nearbyplaces://import?ll=35.620,139.620&name=Nouveau+lieu');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(legacy.formOpen(),true,'legacy entries do not prevent Apple Plans import confirmation');
legacy.confirmImport();
retained=JSON.parse(legacy.store.get('nearby-places-v1'));
assert.equal(retained.some(p=>p&&p.id==='manual-damaged'),true,'import preserves malformed existing records');
assert.equal(retained.some(p=>p&&p.name==='Nouveau lieu'),true,'valid new place still saved');

// A stale first HTTP response must never overwrite a newer catalogue/cache.
const refreshing=harness(false,[],true);
assert.equal(refreshing.networkCalls.length,1,'initial remote fetch started');
refreshing.refresh();
assert.equal(refreshing.networkCalls.length,2,'refresh starts a new fetch');
const older=JSON.parse(fs.readFileSync('data/places.sample.json','utf8'));
const newer=JSON.parse(JSON.stringify(older));
newer.places[0].name='Nouveau catalogue';
refreshing.resolveFetch(1,newer);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(JSON.parse(refreshing.store.get('nearby-places-catalogue-v1')).places[0].name,'Nouveau catalogue');
refreshing.resolveFetch(0,older);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(JSON.parse(refreshing.store.get('nearby-places-catalogue-v1')).places[0].name,'Nouveau catalogue','stale response cannot overwrite cache');
assert.equal(JSON.parse(refreshing.store.get('nearby-places-v1'))[0].name,'Nouveau catalogue','stale response cannot overwrite places');
// Recheck duplicates at confirmation: another action can add the same point
// while the imported Apple Plans place is awaiting explicit approval.
const overlapping=harness();
overlapping.window.handleOpenURL('nearbyplaces://import?ll=35.610,139.610&name=En+attente');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(overlapping.formOpen(),true);
overlapping.input('name','Ajout concurrent');
overlapping.input('lat','35.610');
overlapping.input('lon','139.610');
overlapping.manualAdd();
assert.equal(JSON.parse(overlapping.store.get('nearby-places-v1')).length,1);
overlapping.confirmImport();
assert.equal(JSON.parse(overlapping.store.get('nearby-places-v1')).length,1,'confirmation cannot duplicate newly added location');
assert.equal(overlapping.formOpen(),false,'obsolete confirmation dismissed safely');
assert.match(overlapping.status(),/existe déjà/);
const h=harness();
// Short Maps links percent-encoded into a Shortcuts/ChatGPT import URL must reach
// the native resolver when pasted directly (not only via handleOpenURL).
const wrapped=harness();
let wrappedPlaces=await wrapped.importURL('nearbyplaces://import?url=https%3A%2F%2Fmaps.apple%2Fp%2FokRedirect');
assert.equal(wrappedPlaces.length,1,'encoded Apple short URL resolved before parsing wrapper');
checkPlace(wrappedPlaces[0],35.720,139.790);
wrappedPlaces=await wrapped.importURL('nearbyplaces://import?url=https%3A%2F%2Fevil.example%2Fbad%3Fll%3D35.1%2C139.1');
assert.equal(wrappedPlaces.length,1,'untrusted encoded URL must not create a place');
// A short link copied from a message can end with punctuation not belonging to its URL.
const punctuation=harness();
const punctuationPlaces=await punctuation.importURL('Partage : https://maps.apple/p/okRedirect).');
assert.equal(punctuationPlaces.length,1,'Apple short link from a sentence resolves');
assert.deepEqual(punctuation.nativeResolutions,['https://maps.apple/p/okRedirect'],'native resolver does not receive trailing punctuation');
// Deeply nested nearbyplaces://import?url=... links must not cause unbounded recursion.
function wrap(url,n){for(let i=0;i<n;i++)url='nearbyplaces://import?url='+encodeURIComponent(url);return url;}
const nested=harness();
let nestedPlaces=await nested.importURL(wrap('https://maps.apple.com/?ll=35.735,139.735&name=Imbrique',4));
assert.equal(nestedPlaces.length,1,'four nested import wrappers remain compatible');
nestedPlaces=await nested.importURL(wrap('https://maps.apple.com/?ll=35.736,139.736&name=Interdit',6));
assert.equal(nestedPlaces.length,1,'excessively nested import cannot modify local catalogue');
assert.match(nested.status(),/imbriqué trop profondément/,'explicit rejection for too many nested links');
// No shared link is persisted before explicit confirmation.
const draft=harness();
draft.input('maps-url','https://maps.apple.com/?ll=35.600,139.600&name=Fiche+test');
draft.window.handleOpenURL('nearbyplaces://import?ll=35.600,139.600&name=Fiche+test');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(draft.store.has('nearby-places-v1'),false,'aucun enregistrement avant confirmation');
assert.equal(draft.formOpen(),true);
draft.input('import-name','');
draft.confirmImport();
assert.equal(draft.formOpen(),true,'libellé obligatoire');
assert.equal(draft.store.has('nearby-places-v1'),false);
draft.input('import-name','Boutique test');
draft.input('import-category','occasion');
draft.input('import-comment','Rayon pédales et instruments');
draft.confirmImport();
const saved=JSON.parse(draft.store.get('nearby-places-v1'))[0];
assert.equal(saved.name,'Boutique test');
assert.deepEqual(Array.from(saved.categories),['occasion']);
assert.equal(saved.comment,'Rayon pédales et instruments');
draft.window.handleOpenURL('nearbyplaces://import?ll=35.601,139.601&name=Annulation');
await new Promise(resolve=>setImmediate(resolve));
draft.cancelImport();
assert.equal(JSON.parse(draft.store.get('nearby-places-v1')).length,1,'annuler ne crée aucun lieu');
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
list=await h.importURL('https://www.google.com/maps/place/Unknown+Shop/@35.734,139.734,16z');
assert.equal(list.length,7,'les coordonnées @ sont le centre de carte, pas le lieu Google Maps');
assert.match(h.status(),/Coordonnées Google Maps absentes/, 'erreur explicite si une fiche ne fournit que le viewport');
list=await h.importURL('https://maps.app.goo.gl/shortCode');
assert.equal(list.length,7,'lien court non résolu ne crée rien');
assert.match(h.status(),/Import du lieu : Résolution iOS/, 'échec réseau natif explicite sans création de lieu');
list=await h.importURL('https://maps.apple/p/badRedirect');
assert.equal(list.length,7,'lien Apple court non résolu préserve les données');
list=await h.importURL('https://maps.apple/p/okRedirect');
assert.equal(list.length,8,'lien Apple court redirigé vers coordonnées réelles');
checkPlace(list[7],35.720,139.790);
list=await h.importURL('https://maps.apple/p/htmlOnly');
assert.equal(list.length,9,'le lien canonique HTML est utilisé si la redirection ne contient pas de coordonnées');
checkPlace(list[8],35.722,139.792);
list=await h.importURL('https://maps.apple/p/untrusted');
assert.equal(list.length,9,'un résultat natif vers un domaine tiers est rejeté');
list=await h.importURL('https://maps.apple/p/nullResult');
assert.equal(list.length,9,'réponse native vide : aucun lieu ajouté');
list=await h.importURL('https://maps.apple/p/httpFailure');
assert.equal(list.length,9,'HTTP 404 natif : même des coordonnées plausibles sont rejetées');
list=await h.importURL('https://evil.example/redirect?ll=35.7,139.7');
assert.equal(list.length,9,'hôte non autorisé');
h.window.handleOpenURL('nearbyplaces://import?ll=35.706,139.778&name=Transmis');
await new Promise(resolve => setImmediate(resolve));
assert.equal(h.formOpen(),true,'deep link ouvre le formulaire sans enregistrer');
h.confirmImport();
list=JSON.parse(h.store.get('nearby-places-v1'));
assert.equal(list.length,10);
assert.equal(list[9].name,'Transmis');
h.setConfirm(false);
h.reset();
assert.equal(JSON.parse(h.store.get('nearby-places-v1')).length,10,'annulation du reset préserve les lieux');
h.setConfirm(true);
h.reset();
assert.equal(h.store.has('nearby-places-v1'),false,'réinitialisation explicite seulement');
assert.equal(h.store.has('nearby-places-catalogue-v1'),false,'cache réinitialisé explicitement');
const early=harness(true,['nearbyplaces://import?ll=35.850,139.850&name=AvantScript']);
assert.equal(early.store.has('nearby-places-v1'),false,'URL capturée avant app.js, sans ajout avant deviceready');
early.fire('deviceready');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(early.formOpen(),true,'URL initiale rejouée dans le formulaire');
early.confirmImport();
assert.equal(JSON.parse(early.store.get('nearby-places-v1')||'[]')[0].name,'AvantScript');
const cold=harness(true);
cold.window.handleOpenURL('nearbyplaces://import?ll=35.801,139.801&name=Premier');
cold.window.handleOpenURL('nearbyplaces://import?ll=35.802,139.802&name=Second');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(cold.store.has('nearby-places-v1'),false,'aucun import avant deviceready');
cold.fire('deviceready');
await new Promise(resolve=>setImmediate(resolve));
await new Promise(resolve=>setImmediate(resolve));
assert.equal(cold.formOpen(),true,'premier lien attend confirmation');
cold.confirmImport();
assert.equal(cold.formOpen(),true,'second lien attend confirmation');
cold.confirmImport();
let queued=JSON.parse(cold.store.get('nearby-places-v1')||'[]');
assert.deepEqual(queued.map(p=>p.name),['Premier','Second'],'deux liens profonds confirmés dans l’ordre');
cold.share({text:'Titre de page sans URL',items:[{data:'https://maps.apple.com/?ll=35.803,139.803&name=Depuis+Partager',text:'Fiche Plans'}]});
await new Promise(resolve=>setImmediate(resolve));
cold.confirmImport();
queued=JSON.parse(cold.store.get('nearby-places-v1')||'[]');
assert.equal(queued.length,3,'le titre du partage ne masque pas l’URL de item.data');
assert.equal(queued[2].name,'Depuis Partager');
cold.share({text:'Encore un titre',items:[{data:'https://evil.example/invalid'},{data:'https://maps.apple.com/?ll=35.804,139.804&name=Repli'}]});
await new Promise(resolve=>setImmediate(resolve));
cold.confirmImport();
queued=JSON.parse(cold.store.get('nearby-places-v1')||'[]');
assert.equal(queued.length,4,'un candidat rejeté n’empêche pas la lecture du suivant');
assert.equal(queued[3].name,'Repli');
console.log('PASS partage iOS (simulé) : attente deviceready, FIFO deep links, priorités item.data et repli sans perte');
console.log('PASS imports simulés : Apple q/ll/redirection native/HTML validée, Google POI, ChatGPT, texte partagé, anti-doublon, erreur native/HTTP/NULL, reset confirmé');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
