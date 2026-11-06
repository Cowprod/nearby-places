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
for (const file of ['index.html', 'js/app.js', 'js/proximity.js', 'data/places.sample.json']) {
  assert.equal(read('public/' + file), read('www/' + file), 'preview différente de Cordova: ' + file);
}
new vm.Script(read('www/js/app.js'), {filename: 'www/js/app.js'});
new vm.Script(read('www/js/proximity.js'), {filename: 'www/js/proximity.js'});
const appScript = read('www/js/app.js');
assert.match(appScript, /https:\/\/raw\.githubusercontent\.com\/Cowprod\/nearby-places\/main\/data\/places\.sample\.json/);
assert.match(appScript, /CATALOGUE_KEY/, 'cache distant persistant');
assert.match(appScript, /function validCatalogue\(/, 'validation du catalogue distant');
assert.match(appScript, /source\.type==='manual'/, 'préservation des lieux ajoutés manuellement');
assert.match(appScript, /GitHub synchronisé/, 'état de synchronisation');
assert.match(read('www/index.html'), /id="refresh"/, 'bouton actualisation');
assert.match(appScript, /\$\('refresh'\)\.onclick=load/, 'rafraîchissement manuel');
assert.ok(appScript.includes('maps.apple.com'), 'itinéraire piéton via Plans');
assert.match(config, /<access origin="https:\/\/raw\.githubusercontent\.com"\s*\/>/, 'accès distant limité à GitHub');

assert.match(read('www/index.html'), /src="js\/app\.js"/);
assert.match(read('www/index.html'), /src="cordova\.js"/);
assert.match(config, /NSLocationWhenInUseUsageDescription/);
assert.match(config, /NSLocationAlwaysAndWhenInUseUsageDescription/);
assert.match(config, /UIBackgroundModes/);
assert.match(config, /NSMotionUsageDescription/);
assert.equal(pkg.devDependencies['cordova-background-geolocation-lt'], '5.5.1');
assert.equal(pkg.devDependencies['cordova-plugin-local-notification'], '1.2.3');
assert.match(read('www/index.html'), /id="proximity-start"/);
assert.match(read('www/index.html'), /id="proximity-stop"/);
for (const id of ['maps-url','maps-add','export','import','proximity-diagnostics']) {
  assert.ok(read('www/index.html').includes('id="'+id+'"'), 'contrôle '+id);
}
assert.match(appScript, /function parseMapsLink/);
assert.match(appScript, /window.handleOpenURL/);
assert.ok(appScript.includes("incoming.protocol!=='nearbyplaces:'"));
assert.equal(pkg.cordova.plugins['cordova-plugin-customurlscheme'].URL_SCHEME,'nearbyplaces');
assert.ok(appScript.includes('nearby-places-sauvegarde.json'), 'export JSON');
assert.match(read('www/js/proximity.js'), /nearby-places-events-v1/);
assert.match(read('www/index.html'), /src="js\/proximity\.js"/);
assert.match(read('www/js/proximity.js'), /startGeofences\(/);
assert.match(read('www/js/proximity.js'), /stopOnTerminate:false/);
assert.match(read('www/js/proximity.js'), /requestPermission\(/);
assert.match(config, /<content src="index\.html"\s*\/>/);
assert.equal(pkg.devDependencies.cordova, '13.0.0');
assert.equal(pkg.devDependencies['cordova-plugin-geolocation'], '5.0.0');
assert.equal(pkg.scripts['ios:add'], 'cordova platform add ios@8.1.1');
assert.ok(pkg.cordova.plugins['cordova-plugin-geolocation']);
const resolverPackage = JSON.parse(read('local-plugins/cordova-plugin-nearby-resolver/package.json'));
const resolverXML = read('local-plugins/cordova-plugin-nearby-resolver/plugin.xml');
const resolverNative = read('local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyResolver.m');
assert.equal(resolverPackage.name, 'cordova-plugin-nearby-resolver');
assert.equal(pkg.devDependencies['cordova-plugin-nearby-resolver'], 'file:local-plugins/cordova-plugin-nearby-resolver');
assert.ok(pkg.cordova.plugins['cordova-plugin-nearby-resolver'], 'plugin déclaré dans cordova.plugins');
assert.ok(resolverXML.includes('<source-file src="src/ios/NearbyResolver.m"/>'), 'fichier natif installé par Cordova');
assert.match(resolverNative, /NSURLSessionTaskDelegate/, 'contrôle natif des redirections');
assert.ok(resolverNative.includes('completionHandler([self allowedURL:request.URL] ? request : nil)'), 'redirection HTTPS et hôte autorisé');
assert.ok(resolverNative.includes('statusCode<200 || statusCode>=300'), 'échecs HTTP rejetés');
assert.ok(resolverNative.includes('data.length<=262144'), 'analyse HTML bornée');
console.log('PASS résolveur iOS (statique) : sources locales, redirections et codes HTTP contrôlés');
console.log('PASS catalogue:', fixtures.places.length, 'lieux');
console.log('PASS Cordova:', 'configuration iOS, GPS au premier plan, JS syntaxe');
console.log('PASS preview:', 'public et www identiques (4 fichiers)');
console.log('PASS géofencing:', 'plugins déclarés, permissions iOS, commandes de surveillance');
console.log('PASS synchronisation:', 'GitHub Raw, cache local, fusion des lieux manuels, accès restreint');

assert.ok(require('fs').readFileSync('www/js/proximity.js','utf8').includes("trigger:{in:10,unit:'second'}"));
assert.match(require('fs').readFileSync('www/index.html','utf8'), /id="notification-test"/);
