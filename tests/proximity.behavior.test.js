'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('www/js/proximity.js', 'utf8');

function harness(allowNotifications = true) {
  const storage = new Map();
  const scheduled = [];
  const callbacks = {};
  const elements = {};
  const state = { geofences: [], starts: 0, stops: 0 };
  const sdk = {
    LOG_LEVEL_ERROR: 0,
    onGeofence(callback) { callbacks.geofence = callback; },
    async ready() { return { enabled: false }; },
    async removeGeofences() { state.geofences = []; },
    async addGeofences(fences) { state.geofences = fences; },
    async startGeofences() { state.starts++; },
    async stop() { state.stops++; }
  };
  const root = {
    cordova: { plugins: { notification: { local: {
      requestPermission(callback) { callback(allowNotifications); },
      schedule(payload) { scheduled.push(payload); }
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
  return { api: root.NearbyProximity, callbacks, elements, scheduled, state };
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

  const refused = harness(false);
  refused.api.setPlaces([place]);
  refused.api.wire();
  await refused.callbacks.deviceready();
  assert.equal(await refused.api.enable(), false);
  assert.equal(refused.state.starts, 0, 'permissions refusées : surveillance non démarrée');
  console.log('PASS proximité (simulée) : opt-in, filtres, anti-doublon, arrêt, refus notifications');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
