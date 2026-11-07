'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sync } = require('../scripts/patch-share-extension.js');
const source = fs.readFileSync('native/ios/ShareViewController.m', 'utf8');
assert.match(source, /hasItemConformingToTypeIdentifier:@"public.url"/);
assert.match(source, /loadItemForTypeIdentifier:@"public.url"/);
assert.match(source, /\[super viewDidAppear:animated\]/);
assert.match(source, /dispatch_async\(dispatch_get_main_queue\(\)/);
assert.match(source, /group|SHAREEXT_GROUP_IDENTIFIER/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nearby-share-'));
try {
  const src = path.join(root, 'native/ios');
  const dst = path.join(root, 'platforms/ios/ShareExtension');
  fs.mkdirSync(src, {recursive:true});
  fs.mkdirSync(dst, {recursive:true});
  fs.writeFileSync(path.join(src, 'ShareViewController.m'), source);
  fs.writeFileSync(path.join(dst, 'ShareViewController.m'), '// stale generated source');
  assert.equal(sync(root), true, 'prepare synchronizes versioned native code');
  assert.equal(fs.readFileSync(path.join(dst, 'ShareViewController.m'),'utf8'), source);
  assert.equal(sync(root), false, 'second prepare is idempotent');
} finally { fs.rmSync(root, {recursive:true, force:true}); }
console.log('PASS ShareExtension: native source versioned, URL handling and deterministic Cordova prepare sync');
