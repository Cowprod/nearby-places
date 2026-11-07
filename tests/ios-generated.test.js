'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plist = require('plist');
const xcode = require('xcode');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const sharedResolver=read('local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyMapsResolver.h');
assert.equal(read('platforms/ios/ShareExtension/NearbyMapsResolver.h'),sharedResolver,'extension uses the versioned shared resolver');
assert.equal(read('platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyMapsResolver.h'),sharedResolver,'app uses the same resolver');
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
function sourceComments(entry){
  const ref=entry[1].buildPhases.find(item=>item.comment==='Sources');
  return project.hash.project.objects.PBXSourcesBuildPhase[ref.value].files.map(item=>item.comment);
}
const appSources=sourceComments(app), extensionSources=sourceComments(extension);
assert.equal(appSources.filter(name=>name==='NearbyResolver.m in Sources').length,1,'resolver compiled once by App');
assert.equal(extensionSources.filter(name=>name==='ShareViewController.m in Sources').length,1,'controller compiled once by ShareExt');
assert.equal(extensionSources.some(name=>name==='NearbyResolver.m in Sources'),false,'resolver excluded from ShareExt');
assert.equal(read('platforms/ios/App.xcodeproj/project.pbxproj').includes('OpenWithPlugin.m'),false,'OpenWith removed from Xcode');
assert.doesNotMatch(read('platforms/ios/ShareExtension/ShareViewController.m'),/_hostBundleID|valueForKey\s*:/);

console.log('PASS iOS généré: sources synchronisées, targets exacts, App Group commun et OpenWith absent');
