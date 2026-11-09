'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('plist');
const xcode = require('xcode');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const os = require('node:os');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const sharedResolver=read('local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyMapsResolver.h');
assert.equal(read('platforms/ios/ShareExtension/NearbyMapsResolver.h'),sharedResolver,'extension uses the versioned shared resolver');
assert.equal(read('platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyMapsResolver.h'),sharedResolver,'app uses the same resolver');
assert.equal(read('platforms/ios/App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m'),read('local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m'),'installed PhotoKit native source matches repository');

const photoBridgeSource=read('local-plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js');
const photoBridgeGenerated=read('platforms/ios/www/plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js');
// Cordova caches local-plugin JS separately from Objective-C. Catch a stale
// generated bridge before building an app whose PhotoKit signatures mismatch.
assert.equal(photoBridgeGenerated,
  'cordova.define("cordova-plugin-nearby-photos.NearbyPhotos", function(require, exports, module) {\n'+photoBridgeSource+'\n});\n',
  'generated PhotoKit JS bridge matches the source plugin');
let installedPhotoBridge;
const photoCalls=[];
vm.runInNewContext(photoBridgeGenerated,{cordova:{define(id,factory){
 assert.equal(id,'cordova-plugin-nearby-photos.NearbyPhotos');
 const module={exports:{}};
 factory(()=>((ok,fail,service,method,args)=>photoCalls.push({service,method,args:Array.from(args)})),module.exports,module);
 installedPhotoBridge=module.exports;
}}});
assert.ok(installedPhotoBridge,'generated PhotoKit plugin registers with Cordova');
installedPhotoBridge.addToAlbum('tokyo','Nearby Places — Tokyo',['asset-1'],()=>{},()=>{});
installedPhotoBridge.renameAlbum('tokyo','Nearby Places — Tokyo 2',()=>{},()=>{});
assert.deepEqual(photoCalls.map(call=>({service:call.service,method:call.method,args:call.args})),[
 {service:'NearbyPhotos',method:'addToAlbum',args:['tokyo','Nearby Places — Tokyo',['asset-1']]},
 {service:'NearbyPhotos',method:'renameAlbum',args:['tokyo','Nearby Places — Tokyo 2']}
],'generated PhotoKit bridge preserves native argument order');
const picker=read('local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyPlacePicker.h');
assert.equal(read('platforms/ios/ShareExtension/NearbyPlacePicker.h'),picker,'extension picker generated from Git');
assert.equal(read('platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyPlacePicker.h'),picker,'app picker generated from Git');
let resolverModule;
const calls=[];
const cordova={exec(...args){calls.push(args);},define(id,factory){
  assert.equal(id,'cordova-plugin-nearby-resolver.NearbyResolver');
  const module={exports:{}};
  factory(()=>{},module.exports,module);
  resolverModule=module.exports;
}};
vm.runInNewContext(read('platforms/ios/www/plugins/cordova-plugin-nearby-resolver/www/resolver.js'),{cordova});
assert.ok(resolverModule,'generated plugin registers with the Cordova loader');
resolverModule.readShared(()=>{},()=>{});
assert.equal(calls[0][2],'NearbyResolver');
assert.equal(calls[0][3],'readShared');
for (const name of ['ShareViewController.h','ShareViewController.m','MainInterface.storyboard']) {
  assert.equal(read('platforms/ios/ShareExtension/'+name),read('native/ios/'+name),name+' generated from Git source');
}
const appInfo=plist.parse(read('platforms/ios/App/App-Info.plist'));
for(const key of ['NSCameraUsageDescription','NSPhotoLibraryUsageDescription','NSPhotoLibraryAddUsageDescription']){
 assert.ok(typeof appInfo[key]==='string'&&appInfo[key].trim().length,key+' is essential for first use without iOS termination');
}
const generatedPlist = plist.parse(read('platforms/ios/ShareExtension/ShareExtension-Info.plist'));
const version=read('config.xml').match(/<widget[^>]*version="([^"]+)"/)[1];
assert.equal(generatedPlist.CFBundleShortVersionString,version);
assert.equal(generatedPlist.CFBundleVersion,version);
const group = 'group.fr.cowprod.nearbyplaces.shareextension';
for (const file of ['platforms/ios/ShareExt.entitlements','platforms/ios/App/Entitlements-Debug.plist','platforms/ios/App/Entitlements-Release.plist']) {
  assert.deepEqual(plist.parse(read(file))['com.apple.security.application-groups'],[group],file+' App Group');
}

const project = xcode.project(path.join(root,'platforms/ios/App.xcodeproj/project.pbxproj'));
project.parseSync();
const targets = project.pbxNativeTargetSection();
function target(name){
  return Object.entries(targets).find(([id,value])=>!id.endsWith('_comment')&&String(value.name).replace(/^"|"$/g,'')===name);
}
const app = target('App'), extension = target('ShareExt');
assert.ok(app && extension,'App and ShareExt targets exist');
const appFrameworkPhase=app[1].buildPhases.find(phase=>phase.comment==='Frameworks');
const appFrameworks=appFrameworkPhase&&project.hash.project.objects.PBXFrameworksBuildPhase[appFrameworkPhase.value];
assert.ok(appFrameworks&&appFrameworks.files.some(file=>String(file.comment||'').includes('AVFoundation.framework')),
  'native camera permission API is linked in App even with cached Cordova plugin metadata');

for (const entry of [app, extension]) {
  assert.equal(entry[1].buildPhases[0].comment, 'Verify Nearby native sources', 'source guard runs before compilation');
}
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nearby-source-guard-'));
try {
  const guard = path.join(root, 'scripts/verify-ios-sources.sh');
  const files = [
    ...['ShareViewController.h','ShareViewController.m','MainInterface.storyboard'].flatMap(name => ['native/ios/'+name,'platforms/ios/ShareExtension/'+name]),
    'native/ios/ShareExt.entitlements','platforms/ios/ShareExt.entitlements',
    'local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m',
    'platforms/ios/App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m',
    ...['NearbyResolver.m','NearbyMapsResolver.h','NearbyPlacePicker.h'].flatMap(name => ['local-plugins/cordova-plugin-nearby-resolver/src/ios/'+name,'platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/'+name]),
    ...['NearbyMapsResolver.h','NearbyPlacePicker.h'].map(name => 'platforms/ios/ShareExtension/'+name)
  ];
  for (const file of files) {
    const destination = path.join(fixture,file);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(path.join(root,file),destination);
  }
  assert.equal(spawnSync('/bin/sh',[guard,fixture]).status,0,'synchronized sources can build');
  fs.appendFileSync(path.join(fixture,'native/ios/ShareViewController.m'),'\n// later Git change\n');
  const stale = spawnSync('/bin/sh',[guard,fixture],{encoding:'utf8'});
  assert.equal(stale.status,1,'later source change blocks a stale build');
  assert.match(stale.stderr,/npm run ios:prepare/,'failure explains how to regenerate');
  // Restore the previously modified fixture so this check isolates PhotoKit.
  fs.copyFileSync(path.join(root,'native/ios/ShareViewController.m'),path.join(fixture,'native/ios/ShareViewController.m'));
  fs.appendFileSync(path.join(fixture,'platforms/ios/App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m'),'\n// stale plugin source\n');
  const stalePhotoKit=spawnSync('/bin/sh',[guard,fixture],{encoding:'utf8'});
  assert.equal(stalePhotoKit.status,1,'outdated generated PhotoKit plugin blocks Xcode build');
} finally {
  fs.rmSync(fixture,{recursive:true,force:true});
}
function sourceComments(entry){
  const ref=entry[1].buildPhases.find(item=>item.comment==='Sources');
  return project.hash.project.objects.PBXSourcesBuildPhase[ref.value].files.map(item=>item.comment);
}
const appSources=sourceComments(app), extensionSources=sourceComments(extension);
assert.equal(appSources.filter(name=>name==='NearbyPhotos.m in Sources').length,1,'PhotoKit native plugin compiled once by App');
assert.equal(appSources.filter(name=>name==='LaunchNavigator.m in Sources').length,1,'LaunchNavigator native plugin compiled once by App');
assert.equal(extensionSources.some(name=>name==='LaunchNavigator.m in Sources'||name==='NearbyPhotos.m in Sources'),false,'navigation and photos excluded from ShareExt');
assert.equal(appSources.filter(name=>name==='NearbyResolver.m in Sources').length,1,'resolver compiled once by App');
assert.equal(extensionSources.filter(name=>name==='ShareViewController.m in Sources').length,1,'controller compiled once by ShareExt');
assert.equal(extensionSources.some(name=>name==='NearbyResolver.m in Sources'),false,'resolver excluded from ShareExt');
assert.equal(read('platforms/ios/App.xcodeproj/project.pbxproj').includes('OpenWithPlugin.m'),false,'OpenWith removed from Xcode');
assert.doesNotMatch(read('platforms/ios/ShareExtension/ShareViewController.m'),/_hostBundleID|valueForKey\s*:/);

console.log('PASS iOS généré: sources synchronisées, targets exacts, App Group commun et OpenWith absent');
