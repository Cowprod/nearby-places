#import <Cordova/CDV.h>
#import <Photos/Photos.h>
#import <PhotosUI/PhotosUI.h>
#import <CoreLocation/CoreLocation.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
@interface NearbyPhotos : CDVPlugin <UIImagePickerControllerDelegate,UINavigationControllerDelegate,PHPickerViewControllerDelegate>
@property(nonatomic,copy) NSString *pending;

@end
@implementation NearbyPhotos
- (void)replyTo:(NSString*)callback value:(id)value error:(NSString*)error { if(!callback.length)return;CDVPluginResult *r=error?[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error]:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:value];[self.commandDelegate sendPluginResult:r callbackId:callback];if([callback isEqualToString:self.pending])self.pending=nil; }
- (void)capture:(CDVInvokedUrlCommand*)cmd {
 // Camera action is independent of the photo-library picker. The permission
 // prompt must happen on first use before presenting the camera UI.
 if(self.pending.length){[self replyTo:cmd.callbackId value:nil error:@"Une opération photo est déjà en cours"];return;}
 self.pending=cmd.callbackId;
 if(![UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]){
  [self replyTo:self.pending value:nil error:@"Appareil photo indisponible sur cet appareil"];self.pending=nil;return;
 }
 void (^showCamera)(void)=^{
  dispatch_async(dispatch_get_main_queue(),^{
   if(self.viewController.presentedViewController){
    [self replyTo:self.pending value:nil error:@"Fermez la fenêtre actuelle avant de prendre une photo"];self.pending=nil;return;
   }
   UIImagePickerController *picker=[UIImagePickerController new];
   picker.sourceType=UIImagePickerControllerSourceTypeCamera;
   picker.mediaTypes=@[@"public.image"];
   picker.delegate=self;
   [self.viewController presentViewController:picker animated:YES completion:nil];
  });
 };
 AVAuthorizationStatus permission=[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
 if(permission==AVAuthorizationStatusAuthorized){showCamera();return;}
 if(permission==AVAuthorizationStatusNotDetermined){
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted){
   if(granted)showCamera();
   else dispatch_async(dispatch_get_main_queue(),^{[self replyTo:self.pending value:nil error:@"Accès à l’appareil photo refusé dans les réglages iOS"];self.pending=nil;});
  }];
  return;
 }
 [self replyTo:self.pending value:nil error:@"Autorisez l’appareil photo dans les réglages iOS"];
 self.pending=nil;
}
- (void)imagePickerControllerDidCancel:(UIImagePickerController*)picker {
 [picker dismissViewControllerAnimated:YES completion:^{
  [self replyTo:self.pending value:@{@"cancelled":@YES} error:nil];
  self.pending=nil;
 }];
}
- (void)imagePickerController:(UIImagePickerController*)picker didFinishPickingMediaWithInfo:(NSDictionary*)info {
 UIImage *image=info[UIImagePickerControllerOriginalImage];
 [picker dismissViewControllerAnimated:YES completion:nil];
 if(!image){[self replyTo:self.pending value:nil error:@"Image absente"];return;}
 void (^save)(void)=^{
 __block NSString *identifier=nil;
 [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{PHAssetChangeRequest *request=[PHAssetChangeRequest creationRequestForAssetFromImage:image];identifier=request.placeholderForCreatedAsset.localIdentifier;} completionHandler:^(BOOL success,NSError *error){dispatch_async(dispatch_get_main_queue(),^{if(success&&identifier)[self replyTo:self.pending value:@{@"id":identifier} error:nil];else [self replyTo:self.pending value:nil error:error.localizedDescription?:@"Enregistrement impossible"];});}];
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelAddOnly];
 if(status==PHAuthorizationStatusNotDetermined){[PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelAddOnly handler:^(PHAuthorizationStatus result){if(result==PHAuthorizationStatusAuthorized)save();else [self replyTo:self.pending value:nil error:@"Accès Photos refusé"]; }];}
 else if(status==PHAuthorizationStatusAuthorized)save();else [self replyTo:self.pending value:nil error:@"Accès Photos refusé"];
}
- (void)nearby:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;
 double lat=[cmd.arguments[0] doubleValue],lon=[cmd.arguments[1] doubleValue],radius=MAX(10,MIN(5000,[cmd.arguments[2] doubleValue]));
 if(!isfinite(lat)||!isfinite(lon)||fabs(lat)>90||fabs(lon)>180){[self replyTo:callback value:nil error:@"Coordonnées invalides"];return;}
 void (^query)(void)=^{
 PHFetchOptions *options=[PHFetchOptions new];options.sortDescriptors=@[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];CLLocation *center=[[CLLocation alloc] initWithLatitude:lat longitude:lon];NSMutableArray *items=[NSMutableArray array];
 [assets enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger idx,BOOL *stop){if(items.count>=150){*stop=YES;return;}if(!asset.location)return;CLLocationDistance d=[asset.location distanceFromLocation:center];if(d<=radius)[items addObject:@{@"id":asset.localIdentifier,@"distance":@(round(d)),@"createdAt":@([asset.creationDate timeIntervalSince1970]*1000)}];}];
 [self replyTo:callback value:@{@"items":items} error:nil];
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(status==PHAuthorizationStatusNotDetermined){[PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus result){if(result==PHAuthorizationStatusAuthorized||result==PHAuthorizationStatusLimited)query();else [self replyTo:callback value:nil error:@"Accès à la photothèque refusé"]; }];}
 else if(status==PHAuthorizationStatusAuthorized||status==PHAuthorizationStatusLimited)query();else [self replyTo:callback value:nil error:@"Accès à la photothèque refusé"];
}
- (void)thumbnail:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;NSString *identifier=cmd.arguments.firstObject;if(![identifier isKindOfClass:[NSString class]]||!identifier.length){[self replyTo:callback value:nil error:@"Identifiant photo invalide"];return;}PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil];PHAsset *asset=assets.firstObject;
 if(!asset){[self replyTo:callback value:nil error:@"Photo introuvable ou accès limité"];return;}
 PHImageRequestOptions *options=[PHImageRequestOptions new];options.networkAccessAllowed=NO;options.deliveryMode=PHImageRequestOptionsDeliveryModeHighQualityFormat;
 [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(320,320) contentMode:PHImageContentModeAspectFill options:options resultHandler:^(UIImage *image,NSDictionary *info){if(!image){[self replyTo:callback value:nil error:@"Miniature inaccessible ou non téléchargée"];return;}NSData *data=UIImageJPEGRepresentation(image,0.72);[self replyTo:callback value:@{@"dataUrl":[NSString stringWithFormat:@"data:image/jpeg;base64,%@",[data base64EncodedStringWithOptions:0]]} error:nil];}];
}
- (void)pick:(CDVInvokedUrlCommand*)cmd {
 if(self.pending.length){[self replyTo:cmd.callbackId value:nil error:@"Une opération photo est déjà en cours"];return;}
 self.pending=cmd.callbackId;PHPickerConfiguration *config=[[PHPickerConfiguration alloc] initWithPhotoLibrary:[PHPhotoLibrary sharedPhotoLibrary]];config.filter=[PHPickerFilter imagesFilter];config.selectionLimit=0;PHPickerViewController *picker=[[PHPickerViewController alloc] initWithConfiguration:config];picker.delegate=self;[self.viewController presentViewController:picker animated:YES completion:nil];
}
- (void)picker:(PHPickerViewController*)picker didFinishPicking:(NSArray<PHPickerResult*>*)results {
 [picker dismissViewControllerAnimated:YES completion:nil];NSMutableArray *ids=[NSMutableArray array];for(PHPickerResult *result in results){if(result.assetIdentifier)[ids addObject:result.assetIdentifier];}
 [self replyTo:self.pending value:@{@"ids":ids} error:nil];
}
// Stable mapping: an application collection owns its PhotoKit album by localIdentifier,
// never by display title (two collections may have identical names).
- (NSDictionary *)albumLinks {
 NSDictionary *value=[[NSUserDefaults standardUserDefaults] dictionaryForKey:@"nearby-places-photo-albums-v1"];
 return [value isKindOfClass:[NSDictionary class]]?value:@{};
}
- (void)storeAlbum:(NSString *)albumId forCollection:(NSString *)collectionId {
 @synchronized([NSUserDefaults standardUserDefaults]) {
  NSMutableDictionary *links=[[self albumLinks] mutableCopy];
  if(albumId)links[collectionId]=albumId;else [links removeObjectForKey:collectionId];
  [[NSUserDefaults standardUserDefaults] setObject:links forKey:@"nearby-places-photo-albums-v1"];
 }
}
- (PHAssetCollection *)albumForCollection:(NSString *)collectionId {
 NSString *albumId=[self albumLinks][collectionId];
 if(![albumId isKindOfClass:[NSString class]]||albumId.length==0)return nil;
 return [PHAssetCollection fetchAssetCollectionsWithLocalIdentifiers:@[albumId] options:nil].firstObject;
}
- (void)withAlbumAuthorization:(void (^)(void))work callback:(NSString *)callback {
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(status==PHAuthorizationStatusAuthorized){work();return;}
 if(status==PHAuthorizationStatusLimited){
  [self replyTo:callback value:nil error:@"Pour créer ou modifier des albums, autorisez l’accès complet à Photos dans les réglages iOS. Les associations aux lieux sont conservées."];
  return;
 }
 if(status==PHAuthorizationStatusNotDetermined){
  [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus result){
   if(result==PHAuthorizationStatusAuthorized)work();
   else [self replyTo:callback value:nil error:result==PHAuthorizationStatusLimited?@"Accès limité : les albums nécessitent l’accès complet à Photos.":@"Autorisation Photos refusée"];
  }];
  return;
 }
 [self replyTo:callback value:nil error:@"Autorisation Photos refusée"];
}
- (void)addToAlbum:(CDVInvokedUrlCommand *)cmd {
 NSString *callback=cmd.callbackId;
 NSString *collectionId=cmd.arguments.count>0&&[cmd.arguments[0] isKindOfClass:[NSString class]]?cmd.arguments[0]:@"";
 NSString *title=cmd.arguments.count>1&&[cmd.arguments[1] isKindOfClass:[NSString class]]?cmd.arguments[1]:@"";
 NSArray *input=cmd.arguments.count>2&&[cmd.arguments[2] isKindOfClass:[NSArray class]]?cmd.arguments[2]:@[];
 if(!collectionId.length||!title.length||!input.count){
  [self replyTo:callback value:nil error:@"Collection ou photos manquantes"];return;
 }
 for(id identifier in input){
  if(![identifier isKindOfClass:[NSString class]]||![identifier length]){
   [self replyTo:callback value:nil error:@"Identifiant de photo invalide"];return;
  }
 }
 NSArray *identifiers=[[NSOrderedSet orderedSetWithArray:input] array];
 [self withAlbumAuthorization:^{
  PHFetchResult<PHAsset *> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:identifiers options:nil];
  // A place can retain links to assets deleted in Photos. Never let one stale
  // identifier prevent the remaining valid originals from joining their album.
  // Keep all place-photo links intact; Photos is the source of asset availability.
  NSUInteger unavailableCount=identifiers.count-assets.count;
  PHAssetCollection *existing=[self albumForCollection:collectionId];
  // An entirely stale set must not create an empty album. However, if an
  // album already exists, continue: its title may need repairing even when
  // every linked original has since been deleted from Photos.
  if(!assets.count && !existing){
   [self replyTo:callback value:@{@"collectionId":collectionId,@"albumId":@"",@"count":@0,@"unavailableCount":@(unavailableCount)} error:nil];
   return;
  }
  // Reconciliation is idempotent: repeated imports, resumes and retries never
  // append a reference already present in the album.
  BOOL needsRename=existing&&![(existing.localizedTitle?:@"") isEqualToString:title];
  NSMutableSet<NSString *> *present=[NSMutableSet set];
  if(existing){
   PHFetchResult<PHAsset *> *members=[PHAsset fetchAssetsInAssetCollection:existing options:nil];
   [members enumerateObjectsUsingBlock:^(PHAsset *member,NSUInteger index,BOOL *stop){
    if(member.localIdentifier)[present addObject:member.localIdentifier];
   }];
  }
  NSMutableArray<PHAsset *> *assetsToAdd=[NSMutableArray arrayWithCapacity:assets.count];
  [assets enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger index,BOOL *stop){
   if(![present containsObject:asset.localIdentifier])[assetsToAdd addObject:asset];
  }];
  if(existing){
   if(assetsToAdd.count&&![existing canPerformEditOperation:PHCollectionEditOperationAddContent]){
    [self replyTo:callback value:nil error:@"Cet album ne permet pas l'ajout de photos"];return;
   }
   if(needsRename&&![existing canPerformEditOperation:PHCollectionEditOperationRename]){
    [self replyTo:callback value:nil error:@"Cet album ne peut pas être renommé"];return;
   }
   if(!assetsToAdd.count&&!needsRename){
    [self replyTo:callback value:@{@"collectionId":collectionId,@"albumId":existing.localIdentifier,@"count":@0,@"unavailableCount":@(unavailableCount)} error:nil];
    return;
   }
  }
  __block NSString *newAlbumId=nil;
  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
   PHAssetCollectionChangeRequest *change=nil;
   if(existing)change=[PHAssetCollectionChangeRequest changeRequestForAssetCollection:existing];
   else {
    change=[PHAssetCollectionChangeRequest creationRequestForAssetCollectionWithTitle:title];
    newAlbumId=change.placeholderForCreatedAssetCollection.localIdentifier;
   }
   if(needsRename)change.title=title; // Also repairs renames that failed while offline.
   if(assetsToAdd.count)[change addAssets:assetsToAdd];
  } completionHandler:^(BOOL success,NSError *error){
   if(success&&newAlbumId)[self storeAlbum:newAlbumId forCollection:collectionId];
   [self replyTo:callback value:success?@{@"collectionId":collectionId,@"albumId":newAlbumId?:(existing.localIdentifier?:@""),@"count":@(assetsToAdd.count),@"unavailableCount":@(unavailableCount)}:nil error:success?nil:(error.localizedDescription?:@"Modification de l’album impossible")];
  }];
 } callback:callback];
}
- (void)renameAlbum:(CDVInvokedUrlCommand *)cmd {
 NSString *callback=cmd.callbackId;
 NSString *collectionId=cmd.arguments.count>0&&[cmd.arguments[0] isKindOfClass:[NSString class]]?cmd.arguments[0]:@"";
 NSString *newTitle=cmd.arguments.count>1&&[cmd.arguments[1] isKindOfClass:[NSString class]]?cmd.arguments[1]:@"";
 if(!collectionId.length||!newTitle.length){[self replyTo:callback value:nil error:@"Identifiant ou titre d’album manquant"];return;}
 // A collection with no photos has no album. Do not create empty albums or request permissions.
 if(![self albumLinks][collectionId]){[self replyTo:callback value:@{@"renamed":@NO} error:nil];return;}
 [self withAlbumAuthorization:^{
  PHAssetCollection *album=[self albumForCollection:collectionId];
  if(!album){
   [self storeAlbum:nil forCollection:collectionId];
   [self replyTo:callback value:@{@"renamed":@NO} error:nil];return;
  }
  if([(album.localizedTitle?:@"") isEqualToString:newTitle]){
   [self replyTo:callback value:@{@"renamed":@NO,@"albumId":album.localIdentifier} error:nil];return;
  }
  if(![album canPerformEditOperation:PHCollectionEditOperationRename]){
   [self replyTo:callback value:nil error:@"Cet album ne peut pas être renommé"];return;
  }
  [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
   [PHAssetCollectionChangeRequest changeRequestForAssetCollection:album].title=newTitle;
  } completionHandler:^(BOOL success,NSError *error){
   [self replyTo:callback value:success?@{@"renamed":@YES,@"albumId":album.localIdentifier}:nil error:success?nil:(error.localizedDescription?:@"Renommage impossible")];
  }];
 } callback:callback];
}
@end
