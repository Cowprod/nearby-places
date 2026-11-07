'use strict';
// Keep Cordova-generated extension in sync with the versioned native source.
// This hook runs after cordova prepare ios; never alter signing or the Xcode project.
const fs = require('fs');
const path = require('path');
function patch(source) {
  // Compatibility export for the existing structural test suite.
  return source;
}
function sync(root) {
  const source = path.join(root, 'native/ios/ShareViewController.m');
  const target = path.join(root, 'platforms/ios/ShareExtension/ShareViewController.m');
  if (!fs.existsSync(target)) {
    console.log('Nearby Places: ShareExtension absent (no iOS platform yet)');
    return false;
  }
  if (!fs.existsSync(source)) throw Error('Versioned ShareViewController.m missing');
  const expected = fs.readFileSync(source, 'utf8');
  if (!expected.includes('public.url') || !expected.includes('SHAREEXT_GROUP_IDENTIFIER'))
    throw Error('Versioned ShareViewController.m failed sanity check');
  if (fs.readFileSync(target, 'utf8') === expected) {
    console.log('Nearby Places: native ShareExtension already synchronized');
    return false;
  }
  fs.writeFileSync(target, expected);
  console.log('Nearby Places: native ShareExtension synchronized from Git');
  return true;
}
function syncResolver(root) {
  const source = path.join(root, 'local-plugins/cordova-plugin-nearby-resolver');
  const nativeSource = path.join(source, 'src/ios/NearbyResolver.m');
  const jsSource = path.join(source, 'www/resolver.js');
  const targets = [
    [nativeSource, path.join(root, 'platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyResolver.m')],
    [jsSource, path.join(root, 'platforms/ios/www/plugins/cordova-plugin-nearby-resolver/www/resolver.js')]
  ];
  for (const [from, to] of targets) {
    if (!fs.existsSync(to)) {
      console.log('Nearby Places: resolver generated target not found: '+to);
      continue;
    }
    const expected = fs.readFileSync(from, 'utf8');
    if (fs.readFileSync(to, 'utf8') !== expected) {
      fs.writeFileSync(to, expected);
      console.log('Nearby Places: resolver synchronized: '+path.basename(to));
    }
  }
}
if (require.main === module) { sync(process.cwd()); syncResolver(process.cwd()); }
module.exports = { patch, sync };
