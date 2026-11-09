'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const native = fs.readFileSync('native/ios/ShareViewController.m','utf8');
// Explicit buttons must open a native dialog on tap, not require a wheel gesture.
assert.match(native,/UIControlEventTouchUpInside/);
assert.match(native,/chooseCollection/);
assert.match(native,/chooseCategory/);
assert.match(native,/UIAlertControllerStyleAlert/);
assert.match(native,/refreshSelectionButtons/);
assert.doesNotMatch(native,/UIPickerView/);
assert.match(native,/@\"Choisir une collection…\"/);
// Modern Apple Maps shares a /place?address= URL even when it has no name.
assert.match(native,/\[item\.name isEqualToString:@\"address\"\]/);
assert.match(native,/@\[@\"maps.apple\", @\"maps.apple.com\", @\"www.maps.apple.com\"\]/);
console.log('PASS ShareExt UI: tappable selection dialogs and Apple Maps address fallback (source checks only)');
