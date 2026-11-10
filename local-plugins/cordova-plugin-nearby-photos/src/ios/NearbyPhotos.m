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
// PhotoKit completions and authorization handlers may arrive on background
// queues. Deliver Cordova results and release pending UI state on the main
// queue, without letting a late result clear a different request.
- (void)replyTo:(NSString*)callback value:(id)value error:(NSString*)error {
 if(!callback.length)return;
 void (^deliver)(void)=^{
  CDVPluginResult *result=error?
   [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error]:
   [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:value];
  [self.commandDelegate sendPluginResult:result callbackId:callback];
  if([callback isEqualToString:self.pending])self.pending=nil;
 };
 if([NSThread isMainThread])deliver();
 else dispatch_async(dispatch_get_main_queue(),deliver);
}
- (void)capture:(CDVInvokedUrlCommand*)cmd {
 // Camera action is independent of the photo-library picker. The permission
 // prompt must happen on first use before presenting the camera UI.
 if(self.pending.length){[self replyTo:cmd.callbackId value:nil error:@"Une opération photo est déjà en cours"];return;}
 NSString *callback=[cmd.callbackId copy];
 self.pending=callback;
 if(![UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]){
  [self replyTo:callback value:nil error:@"Appareil photo indisponible sur cet appareil"];return;
 }
 void (^showCamera)(void)=^{
  dispatch_async(dispatch_get_main_queue(),^{
   if(![self.pending isEqualToString:callback])return;
   // Camera access may be granted after the app has been backgrounded.
   // Never attempt to present UIKit over an inactive application: finish the
   // original request and let the user retry on the next foreground visit.
   if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
    [self replyTo:callback value:nil error:@"Application en arrière-plan : revenez dans Nearby Places et réessayez"];return;
   }
   if(self.viewController.presentedViewController){
    [self replyTo:callback value:nil error:@"Fermez la fenêtre actuelle avant de prendre une photo"];return;
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
   else dispatch_async(dispatch_get_main_queue(),^{[self replyTo:callback value:nil error:@"Accès à l’appareil photo refusé dans les réglages iOS"];});
  }];
  return;
 }
 [self replyTo:callback value:nil error:@"Autorisez l’appareil photo dans les réglages iOS"];
}
- (void)imagePickerControllerDidCancel:(UIImagePickerController*)picker {
 NSString *callback=[self.pending copy];
 [picker dismissViewControllerAnimated:YES completion:^{
  // Cancellation ends only the camera request which presented this sheet.
  [self replyTo:callback value:@{@"cancelled":@YES} error:nil];
 }];
}
- (void)imagePickerController:(UIImagePickerController*)picker didFinishPickingMediaWithInfo:(NSDictionary*)info {
 UIImage *image=info[UIImagePickerControllerOriginalImage];
 NSString *callback=[self.pending copy];
 // Keep the Cordova operation pending until UIKit has fully dismissed the
 // camera. A fast PhotoKit save or permission refusal must not release it
 // while the native camera sheet is still on screen.
 [picker dismissViewControllerAnimated:YES completion:^{
  if(!image){[self replyTo:callback value:nil error:@"Image absente"];return;}
  void (^save)(void)=^{
   __block NSString *identifier=nil;
   [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
    PHAssetChangeRequest *request=[PHAssetChangeRequest creationRequestForAssetFromImage:image];
    identifier=request.placeholderForCreatedAsset.localIdentifier;
   } completionHandler:^(BOOL success,NSError *error){
    dispatch_async(dispatch_get_main_queue(),^{
     if(success&&identifier)[self replyTo:callback value:@{@"id":identifier} error:nil];
     else [self replyTo:callback value:nil error:error.localizedDescription?:@"Enregistrement impossible"];
    });
   }];
  };
  PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelAddOnly];
  if(status==PHAuthorizationStatusNotDetermined){
   [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelAddOnly handler:^(PHAuthorizationStatus result){
    if(result==PHAuthorizationStatusAuthorized)save();
    else dispatch_async(dispatch_get_main_queue(),^{[self replyTo:callback value:nil error:@"Accès Photos refusé"];});
   }];
  }else if(status==PHAuthorizationStatusAuthorized)save();
  else [self replyTo:callback value:nil error:@"Accès Photos refusé"];
 }];
}
- (void)nearby:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;
 // A malformed Cordova call must not index past the argument array or invoke
 // doubleValue on NSNull while the photo library is being queried.
 if(cmd.arguments.count<3||
    ![cmd.arguments[0] respondsToSelector:@selector(doubleValue)]||
    ![cmd.arguments[1] respondsToSelector:@selector(doubleValue)]||
    ![cmd.arguments[2] respondsToSelector:@selector(doubleValue)]){
  [self replyTo:callback value:nil error:@"Coordonnées ou rayon invalides"];return;
 }
 double lat=[cmd.arguments[0] doubleValue],lon=[cmd.arguments[1] doubleValue],radius=MAX(10,MIN(5000,[cmd.arguments[2] doubleValue]));
 if(!isfinite(lat)||!isfinite(lon)||fabs(lat)>90||fabs(lon)>180){
  [self replyTo:callback value:nil error:@"Coordonnées invalides"];return;
 }
 void (^query)(void)=^{
  PHFetchOptions *options=[PHFetchOptions new];
  options.sortDescriptors=@[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];
  CLLocation *center=[[CLLocation alloc] initWithLatitude:lat longitude:lon];
  NSMutableArray *items=[NSMutableArray array];
  [assets enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger idx,BOOL *stop){
   if(items.count>=150){*stop=YES;return;}
   if(!asset.location)return;
   CLLocationDistance d=[asset.location distanceFromLocation:center];
   if(d<=radius)[items addObject:@{@"id":asset.localIdentifier,@"distance":@(round(d)),@"createdAt":@([asset.creationDate timeIntervalSince1970]*1000)}];
  }];
  [self replyTo:callback value:@{@"items":items} error:nil];
 };
 // An authorization prompt may finish after a Settings change or app
 // backgrounding. Recheck *current* access on the UIKit queue before reading
 // photos, rather than returning a misleading empty set of suggestions.
 void (^runIfStillAuthorized)(void)=^{
  dispatch_async(dispatch_get_main_queue(),^{
   if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
    [self replyTo:callback value:nil error:@"Application en arrière-plan : réessayez la recherche de photos au retour."];return;
   }
   PHAuthorizationStatus current=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
   if(current==PHAuthorizationStatusAuthorized||current==PHAuthorizationStatusLimited){
    // Scanning the library can be expensive on large iCloud libraries.
    // Avoid blocking the UIKit queue; check access again at the actual read.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
     PHAuthorizationStatus latest=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
     if(latest!=PHAuthorizationStatusAuthorized&&latest!=PHAuthorizationStatusLimited){
      [self replyTo:callback value:nil error:@"Accès Photos modifié avant la recherche : réessayez après autorisation."];return;
     }
     query();
    });
    return;
   }
   [self replyTo:callback value:nil error:@"Accès à la photothèque modifié ou refusé : vérifiez les réglages iOS."];
  });
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(status==PHAuthorizationStatusNotDetermined){
  [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus result){
   if(result==PHAuthorizationStatusAuthorized||result==PHAuthorizationStatusLimited)runIfStillAuthorized();
   else [self replyTo:callback value:nil error:@"Accès à la photothèque refusé"];
  }];
 }else if(status==PHAuthorizationStatusAuthorized||status==PHAuthorizationStatusLimited)runIfStillAuthorized();
 else [self replyTo:callback value:nil error:@"Accès à la photothèque refusé"];
}
- (void)thumbnail:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;NSString *identifier=cmd.arguments.firstObject;if(![identifier isKindOfClass:[NSString class]]||!identifier.length){[self replyTo:callback value:nil error:@"Identifiant photo invalide"];return;}PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil];PHAsset *asset=assets.firstObject;
 if(!asset){[self replyTo:callback value:nil error:@"Photo introuvable ou accès limité"];return;}
 PHImageRequestOptions *options=[PHImageRequestOptions new];options.networkAccessAllowed=NO;options.deliveryMode=PHImageRequestOptionsDeliveryModeHighQualityFormat;
 // PhotoKit can send intermediate/degraded images, then a terminal result.
 // A Cordova callback is single-use: do not resolve it twice or treat a
 // degraded image as the definitive thumbnail. All terminal replies are
 // serialized on the main queue so concurrent PhotoKit callbacks cannot race.
 __block BOOL finished=NO;
 [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(320,320) contentMode:PHImageContentModeAspectFill options:options resultHandler:^(UIImage *image,NSDictionary *info){
  dispatch_async(dispatch_get_main_queue(),^{
   if(finished||[info[PHImageResultIsDegradedKey] boolValue])return;
   finished=YES;
   if([info[PHImageCancelledKey] boolValue]){[self replyTo:callback value:nil error:@"Demande de miniature annulée"];return;}
   NSError *photoError=info[PHImageErrorKey];
   if(photoError){[self replyTo:callback value:nil error:photoError.localizedDescription];return;}
   if(!image){[self replyTo:callback value:nil error:@"Miniature inaccessible ou non téléchargée"];return;}
   NSData *data=UIImageJPEGRepresentation(image,0.72);
   if(!data){[self replyTo:callback value:nil error:@"Encodage de miniature impossible"];return;}
   [self replyTo:callback value:@{@"dataUrl":[NSString stringWithFormat:@"data:image/jpeg;base64,%@",[data base64EncodedStringWithOptions:0]]} error:nil];
  });
 }];
}
- (void)pick:(CDVInvokedUrlCommand*)cmd {
 if(self.pending.length){[self replyTo:cmd.callbackId value:nil error:@"Une opération photo est déjà en cours"];return;}
 self.pending=cmd.callbackId;
 // PhotoKit selection can be invoked while another native sheet is visible.
 // Never leave the callback pending if UIKit cannot present the picker.
 dispatch_async(dispatch_get_main_queue(),^{
  if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
   [self replyTo:cmd.callbackId value:nil error:@"Application en arrière-plan : revenez dans Nearby Places et réessayez"];
   return;
  }
  if(self.viewController.presentedViewController){
   [self replyTo:cmd.callbackId value:nil error:@"Fermez la fenêtre actuelle avant de choisir des photos"];
   return;
  }
  PHPickerConfiguration *config=[[PHPickerConfiguration alloc] initWithPhotoLibrary:[PHPhotoLibrary sharedPhotoLibrary]];
  config.filter=[PHPickerFilter imagesFilter];
  config.selectionLimit=0;
  PHPickerViewController *picker=[[PHPickerViewController alloc] initWithConfiguration:config];
  picker.delegate=self;
  [self.viewController presentViewController:picker animated:YES completion:nil];
 });
}
- (void)picker:(PHPickerViewController*)picker didFinishPicking:(NSArray<PHPickerResult*>*)results {
 // PHPicker may return a usable image without a PHAsset identifier (for
 // example, a provider-backed item). Such images cannot be linked to a place
 // or album by localIdentifier. Report them instead of silently dropping them.
 // Deduplicate selected identifiers; never create a second PHAsset.
 NSMutableOrderedSet<NSString *> *ids=[NSMutableOrderedSet orderedSet];
 NSUInteger unavailableCount=0;
 for(PHPickerResult *result in results){
  if(result.assetIdentifier.length)[ids addObject:result.assetIdentifier];
  else unavailableCount++;
 }
 NSDictionary *payload=@{@"ids":ids.array,@"selectedCount":@(results.count),@"unavailableCount":@(unavailableCount)};
 NSString *callback=[self.pending copy];
 // Only release pending after UIKit finishes dismissing the picker. Capture
 // the original callback so a late dismissal never resolves a newer request.
 [picker dismissViewControllerAnimated:YES completion:^{
  [self replyTo:callback value:payload error:nil];
 }];
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
 // Authorization prompts and PhotoKit completions may run off-main.
 // Check app state and current read-write permission on the main queue,
 // including after the permission prompt. Failed work is retried on resume.
 void (^runIfStillAuthorized)(void)=^{
  dispatch_async(dispatch_get_main_queue(),^{
   if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
    [self replyTo:callback value:nil error:@"Application en arrière-plan : synchronisation Photos reportée au retour. Les associations aux lieux sont conservées."];
    return;
   }
   PHAuthorizationStatus current=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
   if(current==PHAuthorizationStatusAuthorized){work();return;}
   NSString *reason=current==PHAuthorizationStatusLimited?
    @"Accès limité : les albums nécessitent l’accès complet à Photos. Les associations aux lieux sont conservées.":
    @"Accès Photos refusé ou modifié dans les réglages iOS. Les associations aux lieux sont conservées.";
   [self replyTo:callback value:nil error:reason];
  });
 };
 dispatch_async(dispatch_get_main_queue(),^{
  if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
   [self replyTo:callback value:nil error:@"Application en arrière-plan : synchronisation Photos reportée au retour. Les associations aux lieux sont conservées."];
   return;
  }
  PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
  if(status==PHAuthorizationStatusAuthorized){runIfStillAuthorized();return;}
  if(status==PHAuthorizationStatusLimited){
   [self replyTo:callback value:nil error:@"Pour créer ou modifier des albums, autorisez l’accès complet à Photos dans les réglages iOS. Les associations aux lieux sont conservées."];
   return;
  }
  if(status==PHAuthorizationStatusNotDetermined){
   [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus result){
    if(result==PHAuthorizationStatusAuthorized)runIfStillAuthorized();
    else [self replyTo:callback value:nil error:result==PHAuthorizationStatusLimited?@"Accès limité : les albums nécessitent l’accès complet à Photos. Les associations aux lieux sont conservées.":@"Autorisation Photos refusée. Les associations aux lieux sont conservées."];
   }];
   return;
  }
  [self replyTo:callback value:nil error:@"Autorisation Photos refusée. Les associations aux lieux sont conservées."];
 });
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
