'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('www/js/proximity.js', 'utf8');

function harness(allowNotifications = true, slowNative = false) {
  const storage = new Map();
  const scheduled = [];
  const callbacks = {};
  const elements = {};
  const state = { geofences: [], starts: 0, stops: 0, inFlight: 0, maxInFlight: 0 };
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
    async ready() { return { enabled: false }; },
    async removeGeofences() { return nativeStep(() => { state.geofences = []; }); },
    async addGeofences(fences) { return nativeStep(() => { state.geofences = fences; }); },
    async startGeofences() { return nativeStep(() => { state.starts++; }); },
    async stop() { return nativeStep(() => { state.stops++; }); }
  };
  const root = {
    cordova: { plugins: { notification: { local: {
      requestPermission(callback) { callback(allowNotifications); },
      schedule(payload) { scheduled.push(payload); },
      on(name,callback) { callbacks['notification.'+name] = callback; }
    } } } },
    BackgroundGeolocation: sdk
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
  vm.runInNewContext(script, { window: root, document, localStorage, console, Promise, Date, Math });
  return { api: root.NearbyProximity, callbacks, elements, scheduled, state, storage };
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
  assert.equal(h.state.geofences.length, 1, 'seules les zones actives et non visitées sont enregistrées');
  assert.equal(h.state.geofences[0].radius, 500);
  assert.equal(h.api.radius(), 500);
  await h.api.setRadius(750);
  assert.equal(h.state.geofences[0].radius, 750);
  assert.equal(await h.api.setRadius(50), false);
  assert.equal(await h.api.setRadius(150), false, 'rayon iOS inférieur à 200 m refusé');
  assert.equal(h.api.radius(), 750);

  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 0, 'pas de notification avant consentement explicite');

  assert.equal(await h.api.enable(), true);
  assert.equal(h.state.starts, 1);
  h.api.onGeofence({ action: 'EXIT', identifier: place.id });
  h.api.onGeofence({ action: 'ENTER', identifier: 'disabled' });
  h.api.onGeofence({ action: 'ENTER', identifier: 'visited' });
  assert.equal(h.scheduled.length, 0, 'ni sortie, ni lieu désactivé, ni lieu visité');
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'une notification après activation');
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'cooldown anti-doublon');
  assert.equal(await h.api.disable(), true);
  h.api.onGeofence({ action: 'ENTER', identifier: place.id });
  assert.equal(h.scheduled.length, 1, 'pas de notification après arrêt');

  assert.equal(await h.api.testNotification(), true, 'test +10 s même après arrêt du GPS');
  assert.equal(h.scheduled.length, 2);
  assert.equal(h.scheduled[1].trigger.in, 10);
  assert.equal(h.scheduled[1].trigger.unit, 'second');
  assert.equal(h.scheduled[1].id, 1999999999);
  assert.equal(typeof h.callbacks['notification.add'], 'function');
  assert.equal(typeof h.callbacks['notification.trigger'], 'function');
  assert.equal(typeof h.callbacks['notification.click'], 'function');
  let events = JSON.parse(h.storage.get('nearby-places-events-v1') || '[]');
  assert.ok(events.some(e => e.details.includes('demande JS envoyée à +10 s')), 'demande JS tracée, pas prétendue validée par iOS');
  assert.ok(!events.some(e => e.details.includes('confirmation native add reçue')), 'pas de confirmation native sans callback');
  assert.ok(!events.some(e => e.details.includes('événement natif trigger reçu')), 'pas de déclenchement natif inventé');
  h.callbacks['notification.add']({ id:1999999999 });
  h.callbacks['notification.trigger']({ id:1999999999 });
  h.callbacks['notification.click']({ id:1999999999 });
  events = JSON.parse(h.storage.get('nearby-places-events-v1') || '[]');
  assert.ok(events.some(e => e.details.includes('confirmation native add reçue')), 'accusé natif add tracé seulement après callback');
  assert.ok(events.some(e => e.details.includes('événement natif trigger reçu')), 'événement trigger journalisé séparément de la programmation');
  assert.ok(events.some(e => e.details.includes('ouverte par utilisateur')), 'clic utilisateur journalisé');
  assert.equal(h.scheduled.length, 2, 'écouter les événements ne doit pas programmer d’autres notifications');
  const refused = harness(false);
  refused.api.setPlaces([place]);
  refused.api.wire();
  await refused.callbacks.deviceready();
  assert.equal(await refused.api.enable(), false);
  assert.equal(refused.state.starts, 0, 'permissions refusées : surveillance non démarrée');
  assert.equal(await refused.api.testNotification(), false, 'test notification sans permission refusé');
  assert.equal(refused.scheduled.length, 0);
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
  assert.equal(concurrent.state.maxInFlight, 1, 'les appels SDK natifs ne se chevauchent jamais');
  assert.equal(concurrent.state.geofences[0].radius, 800, 'dernière valeur de rayon conservée');
  const startPending = concurrent.api.enable();
  const stopPending = concurrent.api.disable();
  assert.equal(await startPending, false, 'l’arrêt annule une activation encore en attente de permission');
  assert.equal(await stopPending, true);
  assert.equal(concurrent.state.starts, 0, 'aucun start tardif après arrêt');
  assert.equal(concurrent.state.stops, 1);
  assert.equal(concurrent.state.maxInFlight, 1);
  concurrent.api.onGeofence({action:'ENTER', identifier:place.id});
  assert.equal(concurrent.scheduled.length, 0, 'aucune notification après demande d’arrêt');
  console.log('PASS proximité (simulée) : rayon, opt-in, test notification +10s, callbacks fictifs, arrêt, sérialisation SDK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
