'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const plist = require('plist');
const {APP_GROUP,NATIVE_FILES,patch} = require('../scripts/patch-share-extension.js');

const read = file => fs.readFileSync(file,'utf8');
const controller = read('native/ios/ShareViewController.m');
const controllerHeader = read('native/ios/ShareViewController.h');
const hook = read('scripts/patch-share-extension.js');
const config = read('config.xml');
const packageJSON = JSON.parse(read('package.json'));
const resolver = read('local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyResolver.m');
const resolverJS = read('local-plugins/cordova-plugin-nearby-resolver/www/resolver.js');
const resolverPlugin = read('local-plugins/cordova-plugin-nearby-resolver/plugin.xml');
const pluginHook = read('local-plugins/cordova-plugin-nearby-resolver/hooks/afterPrepare.js');
assert.equal(typeof require('../scripts/patch-share-extension.js'), 'function', 'Cordova must invoke the project hook, not silently ignore an object export');
const shareEntitlements = plist.parse(read('native/ios/ShareExt.entitlements'));

assert.deepEqual(NATIVE_FILES.sort(),[
  'MainInterface.storyboard','ShareExtension-Info.plist','ShareViewController.h','ShareViewController.m'
].sort(),'all extension files have versioned sources');
assert.match(config,/<hook type="after_prepare" src="scripts\/patch-share-extension\.js"/,'after_prepare hook declared');
assert.match(resolverPlugin,/<hook type="after_prepare" src="hooks\/afterPrepare\.js"/,'local plugin registers prepare hook');
assert.match(pluginHook,/hook\.sync\(root\)/,'plugin hook invokes versioned project synchronizer');
assert.equal(packageJSON.devDependencies['cordova-plugin-openwith-ios'],undefined,'fragile OpenWith dependency removed');
assert.equal(packageJSON.cordova.plugins['cordova-plugin-openwith-ios'],undefined,'OpenWith no longer restored by Cordova');

assert.doesNotMatch(controller,/_hostBundleID|valueForKey\s*:/,'no private UIKit KVC');
assert.doesNotMatch(controller,/openURL:|nextResponder/,'extension never tries to launch the containing app');
assert.match(controllerHeader,/UIViewController/,'public UIViewController lifecycle');
assert.match(controller,/UTTypeURL\.identifier/,'public URL attachments loaded');
assert.match(controller,/UTTypeText\.identifier/,'shared text metadata loaded');
assert.match(controller,/UITextField/,'native name field present');
assert.match(controller,/UITextView/,'native comment field present');
assert.match(controller,/chooseCollection/,'native collection dialog present');
assert.match(controller,/chooseCategory/,'native category dialog present');
assert.match(controller,/UIAlertControllerStyleAlert/,'tap opens an explicit selection dialog');
assert.doesNotMatch(controller,/UIPickerView/,'wheel pickers replaced');
assert.match(controller,/UILabel \*collectionLabel = \[self fieldLabel:@"Collection \*"\]/,'mandatory collection is visible');
assert.match(controller,/\[stack addArrangedSubview:self\.collectionButton\]/,'collection precedes category');
assert.match(controller,/\[stack addArrangedSubview:self\.categoryButton\]/,'category appears after collection');
assert.match(controller,/categoriesForSelectedCollection/,'categories depend on selected collection');
assert.match(controller,/nearbyShareQueue/,'durable queue used');
assert.match(controller,/NearbyQueueLimit/,'queue is bounded explicitly');

assert.match(resolver,/readShared/);
assert.match(resolver,/ackShared/);
assert.match(resolver,/syncCategories/);
assert.match(resolver,/queue\.firstObject/,'consumer peeks without deleting');
assert.match(resolver,/shareID/,'records are acknowledged by stable id');
assert.match(resolverJS,/ackShared/);
assert.match(resolverJS,/syncCategories/);
assert.equal(shareEntitlements['com.apple.security.application-groups'][0],APP_GROUP,'extension App Group matches hook constant');
assert.match(resolver,new RegExp(APP_GROUP.replace(/\./g,'\\.')),'app bridge uses the same App Group');

const generatedPlist = patch(read('native/ios/ShareExtension-Info.plist'),{version:'9.8.7'});
assert.match(generatedPlist,/<string>9\.8\.7<\/string>/,'hook injects a real extension version');
assert.doesNotMatch(generatedPlist,/__APP_VERSION__|__BUILD_VERSION__|undefined/);
assert.match(hook,/addTarget\('ShareExt', 'app_extension'/,'hook can recreate the Xcode target');
assert.match(hook,/APPLICATION_EXTENSION_API_ONLY/,'extension-only API enforcement enabled');
assert.match(hook,/ensureAppEntitlements/,'app entitlements regenerated with App Group');

console.log('PASS ShareExt: sources versionnées, API publiques, formulaire natif, FIFO avec acquittement et reconstruction Cordova');
