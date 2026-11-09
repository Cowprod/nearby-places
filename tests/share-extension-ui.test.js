'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const native = fs.readFileSync('native/ios/ShareViewController.m','utf8');
// Picker values are sourced from the App Group, but always rendered with a
// dark foreground: iOS dark mode must not display white text on white cards.
assert.match(native,/attributedTitleForRow:/);
assert.match(native,/NSForegroundColorAttributeName/);
assert.match(native,/\[UIColor colorWithRed:0\.18 green:0\.24 blue:0\.28 alpha:1\.0\]/);
assert.match(native,/canonicalCategories/);
assert.match(native,/@\"Choisir une collection…\"/);
// Modern Apple Maps shares a /place?address= URL even when it has no name.
assert.match(native,/\[item\.name isEqualToString:@\"address\"\]/);
assert.match(native,/@\[\"maps.apple\", @\"maps.apple.com\", @\"www.maps.apple.com\"\]/);
console.log('PASS ShareExt UI: visible picker labels and Apple Maps address fallback (source checks only)');
