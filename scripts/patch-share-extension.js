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
if (require.main === module) sync(process.cwd());
module.exports = { patch, sync };
