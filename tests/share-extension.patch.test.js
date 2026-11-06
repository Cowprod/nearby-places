'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Evaluate the hook without touching a real platforms/ios tree. Tests are
// structural only: they do not compile Objective-C or exercise an iPhone.
const writes=[];
const fakeFS={
  existsSync(){return false;},
  readFileSync(){throw Error('Unexpected file read');},
  writeFileSync(...args){writes.push(args);throw Error('Unexpected native file mutation');}
};
const sandbox={
  module:{exports:{}},
  process:{cwd(){return '/nonexistent/nearby-share-test';}},
  console:{log(){}},
  require(name){
    if(name==='fs')return fakeFS;
    if(name==='path')return path;
    throw Error('Unexpected dependency: '+name);
  }
};
vm.runInNewContext(fs.readFileSync('scripts/patch-share-extension.js','utf8'),sandbox);
const patch=sandbox.module.exports.patch;
assert.equal(typeof patch,'function');
assert.equal(writes.length,0,'loading the hook did not modify an iOS workspace');

// A known OpenWith implementation already supports URL items. Never inject
// a second URL branch into it (multiple providers may advertise both UTIs).
const existingURL=[
  '- (void)viewDidAppear:(BOOL)animated {',
  '    else if ([itemProvider hasItemConformingToTypeIdentifier:@"public.url"]) {',
  '      [itemProvider loadItemForTypeIdentifier:@"public.url" options:nil completionHandler:^(NSURL *item, NSError *error) {',
  '        NSDictionary *dict=@{@"data" : item.absoluteString};',
  '      }];',
  '    }',
  '}'
].join('\n');
assert.equal(patch(existingURL),existingURL,'native public.url transport retained verbatim');

// A deliberately minimal fixture for the *other* known template. This is not
// an upstream plugin distribution and cannot establish native compatibility.
const legacy=[
  '- (void)viewDidAppear:(BOOL)animated {',
  '    [self.view endEditing:YES];',
  '    __block int remainingAttachments = ((NSExtensionItem*)self.extensionContext.inputItems[0]).attachments.count;',
  '    NSMutableArray *items;',
  '    NSDictionary *results;',
  '    // IMAGE case',
  '    // TEXT case',
  '    if ([itemProvider hasItemConformingToTypeIdentifier:@"public.text"]) {',
  '        [self openURL:[NSURL URLWithString:url]];',
  '    }',
  '}'
].join('\n')+'\n';
const patched=patch(legacy);
assert.match(patched,/NEARBY_SHARE_PATCH_V1/);
assert.match(patched,/hasItemConformingToTypeIdentifier:@"public.url"/);
assert.match(patched,/loadItemForTypeIdentifier:@"public.url"/);
assert.match(patched,/\[super viewDidAppear:animated\]/);
assert.match(patched,/else if \(\[itemProvider hasItemConformingToTypeIdentifier:@"public.text"\]\)/);
assert.equal(patch(patched),patched,'the hook is idempotent');

for(const incompatible of ['// unrelated ObjC source',legacy.replace('    // IMAGE case\n','')]){
  assert.throws(()=>patch(incompatible),/Unexpected OpenWith ShareViewController template/,'unknown native templates must not be modified');
}
assert.equal(writes.length,0,'the test suite did not write to platforms/ios');
console.log('PASS ShareExtension (Node uniquement) : public.url natif préservé, patch idempotent, gabarit inconnu refusé, aucune écriture Xcode');
