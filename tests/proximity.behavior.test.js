'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const collectionsModel = require('../www/js/collections-model.js');

const script = fs.readFileSync('www/js/proximity.js', 'utf8');

function harness(allowNotifications = true, slowNative = false, initialStorage, sdkInitiallyEnabled = false, silentPermission = false) {
  const storage = initialStorage || new Map();
  // Existing proximity scenarios use a genuinely assigned place. Their former
  // implicit assumption that every catalogue record was eligible is no longer
  // valid: places without an active collection must be excluded.
  if(!storage.has('nearby-collections-v2')){
    const collections=collectionsModel.initial([
      {id:'tokyo-station'}, {id:'disabled'}, {id:'visited'}
    ]);
    storage.set('nearby-collections-v2',JSON.stringify(collections));
  }
  const scheduled = [];
  const callbacks = {};
  const pendingPermissionCallbacks = [];
  const elements = {};
  const state = { geofences: [], starts: 0, stops: 0, removes: 0, failNextAdds: 0, failNextStops: 0, inFlight: 0, maxInFlight: 0 };
  async function nativeStep(update) {
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      if(slowNative) await new Promise(resolve => setTimeout(resolve, 3));
      update();
    } finally { state.inFlight--; }
  }
  const sdk = {
    LOG_LEVEL_ERROR: 0,
    onGeofence(callback) { callbacks.geofence = callback; },
    async ready() { return { enabled: sdkInitiallyEnabled }; },
    async removeGeofences() { return nativeStep(() => { state.removes++; state.geofences = []; }); },
    async addGeofences(fences) { if(state.failNextAdds>0){state.failNextAdds--;return Promise.reject(Error('simulated addGeofences failure'));}return nativeStep(() => { state.geofences = fences; }); },
    async startGeofences() { return nativeStep(() => { state.starts++; }); },
    async stop() { if(state.failNextStops>0){state.failNextStops--;throw Error('simulated SDK stop failure');}return nativeStep(() => { state.stops++; }); }
  };
  const root = {
    cordova: { plugins: { notification: { local: {
      requestPermission(callback) { if(silentPermission)pendingPermissionCallbacks.push(callback);else callback(allowNotifications); },
      schedule(payload) { scheduled.push(payload); },
      on(name,callback) { callbacks['notification.'+name] = callback; }
    } } } },
    BackgroundGeolocation: sdk,
    NearbyCollections: collectionsModel
  };
  const document = {
    getElementById(id) { return elements[id] ||= { textContent: '', onclick: null }; },
    addEventListener(name, callback) { callbacks[name] = callback; }
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  vm.runInNewContext(script, { window: root, document, localStorage, console, Promise, Date, Math,
    setTimeout(fn,ms) { return setTimeout(fn,silentPermission && ms===60000?5:ms); }, clearTimeout });
  return { api: root.NearbyProximity, callbacks, elements, scheduled, state, storage, pendingPermissionCallbacks };
}

const place = {
  id: 'tokyo-station', name: 'Tokyo Station', latitude: 35.681236,
  longitude: 139.767125, visited: false, alert: { enabled: true, cooldownHours: 24 }
};
async function main() {
  const h = harness();
  h.api.setPlaces([
    place,
    { ...place, id: 'disabled', alert: { enabled: false } },
    { ...place, id: 'visited', visited: true }
  ]);
  h.api.wire();
  await h.callbacks.deviceready();
  assert.equal(h.state.geofences.length, 0, 'aucune zone native sans consentement préalable');
  assert.equal(h.api.radius(), 500);
  await h.api.setRadius(750);
  assert.equal(h.state.geofences.length, 0, 'rayon sauvegardé sans écriture native');
  assert.equal(await h.api.setRadius(50), false);
  assert.equal(await h.api.setRadius(150), false, 'rayon iOS inférieur à 200 m refusé');
  assert.equal(h.api.radius(), 750);


  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 0, 'pas de notification avant consentement explicite');

  assert.equal(await h.api.enable(), true);
  assert.equal(h.state.starts, 1);
  assert.equal(h.state.geofences.length,1,'zones installées après opt-in');
  assert.equal(h.state.geofences[0].radius,750);
  // A failed native add after a successful remove invalidates the previous fence cache.
  h.state.failNextAdds=1;
  assert.equal(await h.api.setRadius(800),false,'native add failure propagated to caller');
  assert.equal(h.state.geofences.length,0,'failed add leaves no native fences');
  assert.equal(await h.api.setRadius(750),true,'retry after failure must rebuild even for previously cached radius');
  assert.equal(h.state.geofences.length,1,'retry restores native fence');
  assert.equal(h.state.geofences[0].radius,750);
  h.api.onGeofence({ action: 'EXIT', identifier: place.id });
  h.api.onGeofence({ action: 'ENTER', identifier: 'disabled' });
  h.api.onGeofence({ action: 'ENTER', identifier: 'visited' });
  assert.equal(h.scheduled.length, 0, 'ni sortie, ni lieu désactivé, ni lieu visité');
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'une notification après activation');
  assert.equal(h.scheduled[0].iOSForeground,true,'option iOSForeground du plugin 1.2.3 pour une bannière au premier plan');
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'cooldown anti-doublon');
  assert.equal(await h.api.disable(), true);
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'pas de notification après arrêt');
  const removeCountAfterStop=h.state.removes;
  assert.equal(await h.api.setRadius(900),true,'rayon enregistré après stop');
  assert.equal(h.state.removes,removeCountAfterStop,'aucun nouvel appel natif après retrait de consentement');
  assert.equal(await h.api.enable(),true,'surveillance relancée après stop');
  assert.equal(h.state.removes,removeCountAfterStop+1,'restart rebuilds fences even if catalogue unchanged');
  assert.equal(h.state.geofences[0].radius,900,'l’activation reprend le rayon modifié pendant l’arrêt');
  assert.equal(await h.api.disable(),true);

  assert.equal(await h.api.testNotification(), true, 'test +10 s même après arrêt du GPS');
  assert.equal(h.scheduled.length, 2);
  assert.equal(h.scheduled[1].trigger.in, 10);
  assert.equal(h.scheduled[1].trigger.unit, 'second');
  assert.equal(h.scheduled[1].iOSForeground,true,'test +10s utilise la propriété iOSForeground actuelle');
  const firstTestId=h.scheduled[1].id;
  assert.ok(Number.isInteger(firstTestId) && firstTestId>=2100000000 && firstTestId<2140000000, 'ID test réservé dans Int32');
  assert.equal(await h.api.testNotification(), true, 'second test indépendant');
  assert.equal(h.scheduled.length, 3, 'les deux notifications restent programmées');
  const secondTestId=h.scheduled[2].id;
  assert.notEqual(firstTestId,secondTestId,'ne pas remplacer la première notification en réutilisant son ID');
  assert.equal(Number(h.storage.get('nearby-places-test-notification-seq-v1')),2,'séquence persistée localement');
  assert.equal(typeof h.callbacks['notification.add'], 'function');
  assert.equal(typeof h.callbacks['notification.trigger'], 'function');
  assert.equal(typeof h.callbacks['notification.click'], 'function');
  let events = JSON.parse(h.storage.get('nearby-places-events-v1') || '[]');
  assert.ok(events.some(e => e.details.includes('demande JS envoyée à +10 s')), 'demande JS tracée, pas prétendue validée par iOS');
  assert.ok(!events.some(e => e.details.includes('confirmation native add reçue')), 'pas de confirmation native sans callback');
  assert.ok(!events.some(e => e.details.includes('événement natif trigger reçu')), 'pas de déclenchement natif inventé');
  h.callbacks['notification.add']({ id:firstTestId });
  h.callbacks['notification.trigger']({ id:firstTestId }, { foreground:false, queued:true });
  h.callbacks['notification.click']({ id:secondTestId }, { foreground:false, queued:false });
  h.callbacks['notification.click']({ id:1999999999 }); // Legacy ID remains recognized.
  const eventCount=JSON.parse(h.storage.get('nearby-places-events-v1')||'[]').length;
  h.callbacks['notification.trigger']({ id:12345 });
  assert.equal(JSON.parse(h.storage.get('nearby-places-events-v1')||'[]').length,eventCount,'ignorer une notification étrangère au diagnostic');
  events = JSON.parse(h.storage.get('nearby-places-events-v1') || '[]');
  assert.ok(events.some(e => e.details.includes('confirmation native add reçue')), 'accusé natif add tracé seulement après callback');
  assert.ok(events.some(e => e.details.includes('événement natif trigger reçu')), 'événement trigger journalisé séparément de la programmation');
  assert.ok(events.some(e => e.details.includes('ouverte par utilisateur')), 'clic utilisateur journalisé');
  assert.ok(events.some(e => e.details.includes('id '+firstTestId+' : événement natif trigger reçu') && e.details.includes('foreground=false') && e.details.includes('queued=true')), 'callback natif différé identifiable sans prétendre observer la bannière');
  assert.ok(events.some(e => e.details.includes('id '+secondTestId+' : notification ouverte') && e.details.includes('queued=false')), 'contexte de clic restitué sans altérer le diagnostic');
  assert.equal(h.scheduled.length, 3, 'écouter les événements ne doit pas programmer d’autres notifications');
  const resumed=harness(true,false,h.storage);
  resumed.api.wire();
  await resumed.callbacks.deviceready();
  assert.equal(await resumed.api.testNotification(),true,'test après redémarrage simulé');
  assert.ok(resumed.scheduled[0].id>secondTestId,'nouvel ID après relance et conservation du compteur local');
  const refused = harness(false);
  refused.api.setPlaces([place]);
  refused.api.wire();
  await refused.callbacks.deviceready();
  assert.equal(await refused.api.enable(), false);
  assert.equal(refused.state.starts, 0, 'permissions refusées : surveillance non démarrée');
  assert.equal(await refused.api.testNotification(), false, 'test notification sans permission refusé');
  assert.equal(refused.scheduled.length, 0);
  // A native permission bridge may never call back. Neither the test button nor
  // the geofence opt-in may hang or arm late after the safety timeout.
  const silent=harness(true,false,undefined,false,true);
  silent.api.wire();
  await silent.callbacks.deviceready();
  assert.equal(await silent.api.testNotification(),false,'test natif abandonné si permission sans callback après 60s simulées');
  assert.equal(silent.scheduled.length,0,'aucune notification programmée après expiration');
  assert.match(silent.elements['proximity-status'].textContent,/aucune réponse native après 60 s/);
  silent.pendingPermissionCallbacks.shift()(true);
  await Promise.resolve();
  assert.equal(silent.scheduled.length,0,'un accord tardif ne programme pas la notification');
  assert.equal(await silent.api.enable(),false,'activation géofencing bornée si permission sans réponse');
  assert.equal(silent.state.starts,0,'aucun démarrage du SDK après timeout de permission');
  silent.pendingPermissionCallbacks.shift()(true);
  await Promise.resolve();
  assert.equal(silent.state.starts,0,'accord tardif ne réactive pas le SDK');
  // Provoquer les anciennes courses remove/add et start/stop avec un SDK volontairement lent.
  const concurrent = harness(true, true);
  concurrent.api.wire();
  await concurrent.callbacks.deviceready();
  const updates = [
    concurrent.api.setPlaces([place]),
    concurrent.api.setRadius(600),
    concurrent.api.setRadius(800),
    concurrent.api.setPlaces([place])
  ];
  assert.deepEqual(await Promise.all(updates), [true, true, true, true]);
  assert.equal(concurrent.state.maxInFlight, 0, 'aucun appel SDK avant consentement');
  assert.equal(concurrent.api.radius(), 800, 'dernière valeur de rayon conservée localement');
  const startPending = concurrent.api.enable();
  const stopPending = concurrent.api.disable();
  assert.equal(await startPending, false, 'l’arrêt annule une activation encore en attente de permission');
  assert.equal(await stopPending, true);
  assert.equal(concurrent.state.starts, 0, 'aucun start tardif après arrêt');
  assert.equal(concurrent.state.stops, 1);
  assert.equal(concurrent.state.maxInFlight, 1);
  concurrent.api.onGeofence({action:'ENTER', identifier:place.id});
  assert.equal(concurrent.scheduled.length, 0, 'aucune notification après demande d’arrêt');

  // Imported or locally restored data may be malformed. It must never reach Core Location.
  // Leave localStorage untouched: exclude invalid records from native fences and callbacks only.
  const malformed=harness();
  malformed.api.wire();
  await malformed.callbacks.deviceready();
  assert.equal(await malformed.api.setPlaces([
    place, null,
    { ...place, latitude:35.0, longitude:139.0 }, // duplicate ID must not reach Core Location
    { ...place, id:'bad-nan', latitude:NaN },
    { ...place, id:'bad-infinity', latitude:Infinity },
    { ...place, id:'bad-lat', latitude:91 },
    { ...place, id:'bad-lon', longitude:181 },
    { ...place, id:'bad-string', latitude:'35.6' },
    { ...place, id:'' },
    { ...place, id:42 }
  ]),true);
  assert.equal(malformed.state.geofences.length,0,'aucune zone avant le consentement');
  assert.equal(await malformed.api.enable(),true);
  assert.equal(malformed.state.geofences.length,1,'seule une zone géographique valide doit atteindre le SDK iOS');
  assert.equal(malformed.state.geofences[0].identifier,place.id);
  assert.equal(malformed.state.geofences[0].latitude,place.latitude,
    'first valid duplicate ID wins without mutating the local catalogue');
  for(const id of ['bad-nan','bad-infinity','bad-lat','bad-lon','bad-string','']) {
    malformed.api.onGeofence({action:'ENTER',identifier:id});
  }
  assert.equal(malformed.scheduled.length,0,'ne jamais notifier une entrée locale invalide ou un callback ancien');
  malformed.api.onGeofence({action:'ENTER',identifier:place.id});
  assert.equal(malformed.scheduled.length,1,'un lieu valide continue de notifier');
  // Simulate a boot restore: the SDK reports enabled although no explicit
  // opt-in has ever been saved. It must be stopped, not treated as consent.
  const originalPlaces='[{"id":"manual-private","name":"Lieu personnel"}]';
  const noConsentStore=new Map([['nearby-places-v1',originalPlaces]]);
  const bootWithoutConsent=harness(true,false,noConsentStore,true);
  bootWithoutConsent.api.setPlaces([place]);
  bootWithoutConsent.api.wire();
  assert.equal(await bootWithoutConsent.callbacks.deviceready(),true);
  assert.equal(bootWithoutConsent.state.stops,1,'SDK actif au boot sans opt-in doit être arrêté');
  assert.equal(bootWithoutConsent.state.removes,0,'ne pas reprogrammer de zones après cet arrêt');
  assert.equal(JSON.parse(noConsentStore.get('nearby-places-proximity-v1')).enabled,false,'désactivation locale persistée');
  assert.equal(noConsentStore.get('nearby-places-v1'),originalPlaces,'les données de lieux ne sont pas modifiées par la reprise');
  bootWithoutConsent.api.onGeofence({action:'ENTER',identifier:place.id});
  assert.equal(bootWithoutConsent.scheduled.length,0,'aucune notification après restauration native non autorisée');
  await bootWithoutConsent.api.setRadius(650);
  assert.equal(bootWithoutConsent.state.removes,0,'mise à jour du rayon ne réarme pas iOS sans opt-in');
  assert.equal(await bootWithoutConsent.api.enable(),true,'réactivation explicite possible');
  assert.equal(bootWithoutConsent.state.geofences[0].radius,650,'le prochain opt-in applique les réglages locaux');
  assert.equal(await bootWithoutConsent.api.disable(),true);

  const bootStopFailure=harness(true,false,new Map(),true);
  bootStopFailure.state.failNextStops=1;
  bootStopFailure.api.setPlaces([place]);
  bootStopFailure.api.wire();
  assert.equal(await bootStopFailure.callbacks.deviceready(),false,'arrêt natif échoué doit faire échouer init');
  bootStopFailure.api.onGeofence({action:'ENTER',identifier:place.id});
  assert.equal(bootStopFailure.scheduled.length,0,'aucune notification JS si arrêt natif échoue');
  assert.match(bootStopFailure.elements['proximity-status'].textContent,/Erreur arrêt du SDK sans consentement/,'erreur natif visible et non masquée');

  // Retrait du consentement : le drapeau local doit être désactivé avant toute
  // opération native, y compris si stop() échoue ou si deviceready n'est pas arrivé.
  const privatePlaces='[{"id":"manual-secret","name":"Lieu privé"}]';
  const failedStopStore=new Map([
    ['nearby-places-proximity-v1',JSON.stringify({enabled:true})],
    ['nearby-places-v1',privatePlaces]
  ]);
  const failedStop=harness(true,false,failedStopStore);
  failedStop.api.setPlaces([place]);
  failedStop.api.wire();
  await failedStop.callbacks.deviceready();
  assert.equal(await failedStop.api.enable(),true,'opt-in préalable simulé');
  failedStop.state.failNextStops=1;
  assert.equal(await failedStop.api.disable(),false,'échec natif signalé sans succès fictif');
  assert.equal(JSON.parse(failedStopStore.get('nearby-places-proximity-v1')).enabled,false,
    'le retrait de consentement persiste malgré stop() rejeté');
  assert.equal(failedStopStore.get('nearby-places-v1'),privatePlaces,'aucune modification des lieux');
  assert.match(failedStop.elements['proximity-status'].textContent,/Arrêt natif impossible/,
    'échec natif clairement visible');
  failedStop.api.onGeofence({action:'ENTER',identifier:place.id});
  assert.equal(failedStop.scheduled.length,0,'aucune alerte JS après retrait du consentement');
  const restartAfterFailedStop=harness(true,false,failedStopStore,true);
  restartAfterFailedStop.api.setPlaces([place]);
  restartAfterFailedStop.api.wire();
  assert.equal(await restartAfterFailedStop.callbacks.deviceready(),true);
  assert.equal(restartAfterFailedStop.state.stops,1,'au redémarrage le SDK est arrêté après échec précédent');
  assert.equal(failedStopStore.get('nearby-places-v1'),privatePlaces,'données intactes après reprise');

  const earlyOptOutStore=new Map([
    ['nearby-places-proximity-v1',JSON.stringify({enabled:true})],
    ['nearby-places-v1',privatePlaces]
  ]);
  const earlyOptOut=harness(true,false,earlyOptOutStore,true);
  earlyOptOut.api.setPlaces([place]);
  earlyOptOut.api.wire();
  assert.equal(await earlyOptOut.api.disable(),false,'stop précoce sans SDK initialisé non présenté comme confirmé');
  assert.equal(JSON.parse(earlyOptOutStore.get('nearby-places-proximity-v1')).enabled,false,
    'stop avant deviceready mémorise immédiatement le retrait de consentement');
  assert.equal(await earlyOptOut.callbacks.deviceready(),true);
  assert.equal(earlyOptOut.state.stops,1,'init effectue l’arrêt natif différé');
  assert.equal(earlyOptOutStore.get('nearby-places-v1'),privatePlaces,'pas de perte de données au boot');
  console.log('PASS retrait de consentement (simulé) : échec stop, démarrage précoce, reprise SDK et données locales préservées');

  const declinedStore=new Map([['nearby-places-proximity-v1',JSON.stringify({enabled:false})]]);
  const bootOptedOut=harness(true,false,declinedStore,true);
  bootOptedOut.api.wire();
  await bootOptedOut.callbacks.deviceready();
  assert.equal(bootOptedOut.state.stops,1,'refus conservé malgré état actif du SDK');

  const acceptedStore=new Map([['nearby-places-proximity-v1',JSON.stringify({enabled:true})]]);
  const bootOptedIn=harness(true,false,acceptedStore,true);
  bootOptedIn.api.setPlaces([place]);
  bootOptedIn.api.wire();
  assert.equal(await bootOptedIn.callbacks.deviceready(),true);
  assert.equal(bootOptedIn.state.stops,0,'reprise autorisée par opt-in persisté');
  bootOptedIn.api.onGeofence({action:'ENTER',identifier:place.id});
  assert.equal(bootOptedIn.scheduled.length,1,'opt-in historique et SDK actif permettent la notification simulée');
  console.log('PASS consentement au démarrage (simulé) : SDK arrêté sans opt-in, aucun réarmement, réglages différés, opt-in historique respecté');
  console.log('PASS zones iOS (simulées) : entrées locales invalides filtrées sans suppression, callbacks périmés ignorés');
  console.log('PASS proximité (simulée) : rayon, opt-in, test notification +10s, callbacks fictifs, arrêt, sérialisation SDK, reprise après erreur add et stop');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
