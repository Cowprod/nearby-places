'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(p, 'utf8');
const fixtures = JSON.parse(read('data/places.sample.json'));
const pkg = JSON.parse(read('package.json'));
const config = read('config.xml');

assert.equal(fixtures.schemaVersion, 1);
assert.ok(Array.isArray(fixtures.places) && fixtures.places.length >= 2);
assert.ok(Array.isArray(fixtures.categories));
const categories = new Set(fixtures.categories.map((c) => c.id));
const ids = new Set();
for (const p of fixtures.places) {
  assert.ok(p.id && p.name, 'id et nom obligatoires');
  assert.ok(!ids.has(p.id), 'id unique: ' + p.id);
  ids.add(p.id);
  assert.ok(Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90, 'latitude');
  assert.ok(Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180, 'longitude');
  assert.ok(Array.isArray(p.categories) && p.categories.every((c) => categories.has(c)), 'categories');
  assert.equal(p.alert.walkingMinutes, 15);
  assert.ok(typeof p.visited === 'boolean');
}
assert.deepEqual(JSON.parse(read('www/data/places.sample.json')), fixtures, 'catalogue Cordova vs source');
for (const file of ['index.html', 'js/app.js', 'data/places.sample.json']) {
  assert.equal(read('public/' + file), read('www/' + file), 'preview différente de Cordova: ' + file);
}
new vm.Script(read('www/js/app.js'), {filename: 'www/js/app.js'});
const appScript = read('www/js/app.js');
assert.match(appScript, /https:\/\/raw\.githubusercontent\.com\/Cowprod\/nearby-places\/main\/data\/places\.sample\.json/);
assert.match(appScript, /CATALOGUE_KEY/, 'cache distant persistant');
assert.match(appScript, /function validCatalogue\(/, 'validation du catalogue distant');
assert.match(appScript, /source\.type==='manual'/, 'préservation des lieux ajoutés manuellement');
assert.match(appScript, /GitHub synchronisé/, 'état de synchronisation');
assert.match(read('www/index.html'), /id="refresh"/, 'bouton actualisation');
assert.match(appScript, /\$\('refresh'\)\.onclick=load/, 'rafraîchissement manuel');
assert.match(appScript, /maps\.apple\.com/, 'itinéraire piéton via Plans');
assert.match(config, /<access origin="https:\/\/raw\.githubusercontent\.com"\s*\/>/, 'accès distant limité à GitHub');

assert.match(read('www/index.html'), /src="js\/app\.js"/);
assert.match(read('www/index.html'), /src="cordova\.js"/);
assert.match(config, /NSLocationWhenInUseUsageDescription/);
assert.doesNotMatch(config, /NSLocationAlwaysAndWhenInUseUsageDescription|UIBackgroundModes/);
assert.match(config, /<content src="index\.html"\s*\/>/);
assert.equal(pkg.devDependencies.cordova, '13.0.0');
assert.equal(pkg.devDependencies['cordova-plugin-geolocation'], '5.0.0');
assert.equal(pkg.scripts['ios:add'], 'cordova platform add ios@8.1.1');
assert.ok(pkg.cordova.plugins['cordova-plugin-geolocation']);
console.log('PASS catalogue:', fixtures.places.length, 'lieux');
console.log('PASS Cordova:', 'configuration iOS, GPS au premier plan, JS syntaxe');
console.log('PASS preview:', 'public et www identiques (3 fichiers)');
console.log('PASS synchronisation:', 'GitHub Raw, cache local, fusion des lieux manuels, accès restreint');
