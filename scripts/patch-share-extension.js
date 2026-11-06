'use strict';
// Cordova regenerates platforms/ios: patch the generated OpenWith extension deterministically.
const fs=require('fs'),path=require('path');
function patch(source){
  if(source.includes('NEARBY_SHARE_PATCH_V1'))return source;
  // Some OpenWith releases already parse public.url and export item.data.
  // Preserve their native implementation rather than adding a competing handler.
  if(source.includes('hasItemConformingToTypeIdentifier:@"public.url"') &&
     source.includes('loadItemForTypeIdentifier:@"public.url"') &&
     /@"data"\s*:\s*item\.absoluteString/.test(source))return source;
  const anchor='    // TEXT case\n';
  if(!source.includes(anchor)||!source.includes('    // IMAGE case\n')||!source.includes('    __block int remainingAttachments')||!source.includes('    [self.view endEditing:YES];')||!source.includes('        [self openURL:[NSURL URLWithString:url]];'))throw Error('Unexpected OpenWith ShareViewController template; refusing unsafe patch');
  source=source.replace('    [self.view endEditing:YES];','    [super viewDidAppear:animated];\n    [self.view endEditing:YES];');
  source=source.replace('    __block int remainingAttachments = ((NSExtensionItem*)self.extensionContext.inputItems[0]).attachments.count;',`    // NEARBY_SHARE_PATCH_V1: Apple Maps can supply public.url rather than public.text.
    if (self.extensionContext.inputItems.count == 0) {
        [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:@"NearbyShare" code:1 userInfo:nil]];
        return;
    }
    __block int remainingAttachments = ((NSExtensionItem*)self.extensionContext.inputItems[0]).attachments.count;
    if (remainingAttachments == 0) {
        [self.extensionContext cancelRequestWithError:[NSError errorWithDomain:@"NearbyShare" code:2 userInfo:nil]];
        return;
    }`);
  source=source.replace(anchor,`    // Prefer URL before text: Apple Maps advertises both representations.
    if ([itemProvider hasItemConformingToTypeIdentifier:@"public.url"]) {
        [itemProvider loadItemForTypeIdentifier:@"public.url" options:nil completionHandler:^(id item, NSError *error) {
            NSString *value = [item isKindOfClass:[NSURL class]] ? [(NSURL *)item absoluteString] :
                              ([item isKindOfClass:[NSString class]] ? (NSString *)item : nil);
            if (value.length) {
                @synchronized(items) {
                    [items addObject:@{@"text": self.contentText ?: @"", @"data": value,
                                       @"uti": @"public.url", @"utis": itemProvider.registeredTypeIdentifiers ?: @[],
                                       @"name": @"", @"type": @"text/uri-list"}];
                }
            }
            if (__sync_sub_and_fetch(&remainingAttachments, 1) == 0) [self sendResults:results];
        }];
    }
    // TEXT case
`);
  source=source.replace('if ([itemProvider hasItemConformingToTypeIdentifier:@"public.text"]) {','else if ([itemProvider hasItemConformingToTypeIdentifier:@"public.text"]) {');
  source=source.replace('@"data" : item,','@"data" : item ?: @"",');
  source=source.replace('@"text" : self.contentText,','@"text" : self.contentText ?: @"",');
  source=source.replace('        [self openURL:[NSURL URLWithString:url]];','        dispatch_async(dispatch_get_main_queue(), ^{ [self openURL:[NSURL URLWithString:url]]; });');
  return source;
}
const root=process.cwd(),target=path.join(root,'platforms/ios/ShareExtension/ShareViewController.m');
if(fs.existsSync(target)){
 const before=fs.readFileSync(target,'utf8'),after=patch(before);
 if(before!==after){fs.writeFileSync(target,after);console.log('Nearby Places: ShareExtension patched');}
 else console.log('Nearby Places: ShareExtension already patched');
}else console.log('Nearby Places: ShareExtension absent (no iOS platform yet)');
module.exports={patch};
