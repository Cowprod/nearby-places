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
 NSString *callback=cmd.callbackId;
 NSString *identifier=cmd.arguments.firstObject;
 if(![identifier isKindOfClass:[NSString class]]||!identifier.length){
  [self replyTo:callback value:nil error:@"Identifiant photo invalide"];return;
 }
 // Thumbnail and preview reads must not reuse an earlier permission decision.
 // Camera capture may have add-only authorization, which is not read access.
 if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
  [self replyTo:callback value:nil error:@"Application en arrière-plan : actualisez l'album au retour."];return;
 }
 PHAuthorizationStatus readAccess=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(readAccess!=PHAuthorizationStatusAuthorized&&readAccess!=PHAuthorizationStatusLimited){
  [self replyTo:callback value:nil error:@"Accès aux photos indisponible : autorisez la lecture dans les réglages iOS puis actualisez l'album."];return;
 }
 PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil];
 PHAsset *asset=assets.firstObject;
 if(!asset){[self replyTo:callback value:nil error:@"Photo introuvable ou accès limité"];return;}
 // 320 px for the album grid; up to 1280 px for a tapped preview.
  // The default remains backward-compatible with existing thumbnail calls.
  NSUInteger edge=320;
  if(cmd.arguments.count>1&&[cmd.arguments[1] isKindOfClass:[NSNumber class]]&&[cmd.arguments[1] integerValue]==1280)edge=1280;
  PHImageRequestOptions *options=[PHImageRequestOptions new];
  // A linked PHAsset may be represented only by an iCloud placeholder. Fetch
  // the requested 320/1280 px rendition on demand; never change or duplicate
  // its original, even when the device is offline or download fails.
  options.networkAccessAllowed=YES;
  options.deliveryMode=PHImageRequestOptionsDeliveryModeHighQualityFormat;
 // PhotoKit can send intermediate/degraded images, then a terminal result.
 // A Cordova callback is single-use: do not resolve it twice or treat a
 // degraded image as the definitive thumbnail. All terminal replies are
 // serialized on the main queue so concurrent PhotoKit callbacks cannot race.
 __block BOOL finished=NO;
 // Grid tiles may be cropped, but full-screen previews must preserve the
 // original aspect ratio (portraits and panoramas alike).
 PHImageContentMode mode=edge==1280?PHImageContentModeAspectFit:PHImageContentModeAspectFill;
 [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(edge,edge) contentMode:mode options:options resultHandler:^(UIImage *image,NSDictionary *info){
  dispatch_async(dispatch_get_main_queue(),^{
   if(finished)return;
   // Even a degraded callback can be terminal if PhotoKit cancelled the
   // request or reports an error (for example, a failed iCloud download).
   // Never strand the Cordova callback waiting for a final image that will
   // not arrive. Ignore only nonterminal degraded previews.
   BOOL cancelled=[info[PHImageCancelledKey] boolValue];
   NSError *terminalError=info[PHImageErrorKey];
   if([info[PHImageResultIsDegradedKey] boolValue]&&!cancelled&&!terminalError)return;
   finished=YES;
   // PhotoKit may finish an iCloud fetch while the app is suspended.
   // Never send a potentially large image payload to an inactive WebView.
   // The gallery retries its read-only requests on the next resume.
   if([UIApplication sharedApplication].applicationState!=UIApplicationStateActive){
    [self replyTo:callback value:nil error:@"Application en arrière-plan : actualisez l'album au retour."];return;
   }
   // The user may revoke Photos access while an iCloud image is loading.
   PHAuthorizationStatus latestReadAccess=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
   if(latestReadAccess!=PHAuthorizationStatusAuthorized&&latestReadAccess!=PHAuthorizationStatusLimited){
    [self replyTo:callback value:nil error:@"Accès Photos modifié pendant le chargement : actualisez l'album après autorisation."];return;
   }
   if(cancelled){[self replyTo:callback value:nil error:@"Demande de miniature annulée"];return;}
   if(terminalError){[self replyTo:callback value:nil error:terminalError.localizedDescription?:@"Lecture Photos impossible"];return;}
   if(!image){
     NSString *reason=[info[PHImageResultIsInCloudKey] boolValue]?
       @"Photo dans iCloud indisponible : vérifiez la connexion Internet et réessayez.":
       @"Miniature inaccessible dans Photos.";
     [self replyTo:callback value:nil error:reason];return;
    }
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
 // Only an explicit restore may replace an album deleted in Photos.
 // Ordinary synchronization and resume never silently recreate it.
 BOOL allowRestore=cmd.arguments.count>3&&[cmd.arguments[3] isKindOfClass:[NSNumber class]]&&[cmd.arguments[3] boolValue];
 [self withAlbumAuthorization:^{
  PHFetchResult<PHAsset *> *fetched=[PHAsset fetchAssetsWithLocalIdentifiers:identifiers options:nil];
  // Only image PHAssets belong in a Nearby Places photo album. Stale,
  // inaccessible and non-image identifiers must not create an album or
  // prevent valid original photographs from being linked.
  NSMutableArray<PHAsset *> *images=[NSMutableArray array];
  [fetched enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger index,BOOL *stop){
   if(asset.mediaType==PHAssetMediaTypeImage)[images addObject:asset];
  }];
  // Keep the place-photo links unchanged when PhotoKit rejects an identifier.
  NSUInteger unavailableCount=identifiers.count-images.count;
  PHAssetCollection *existing=[self albumForCollection:collectionId];
  NSString *previousAlbumId=[self albumLinks][collectionId];
  if(!existing && [previousAlbumId isKindOfClass:[NSString class]] && previousAlbumId.length && !allowRestore){
   [self replyTo:callback value:nil error:@"Album Photos supprimé manuellement : ouvrez la collection et utilisez Reconstruire l'album. Associations locales conservées."];
   return;
  }
  // An entirely stale set must not create an empty album. However, if an
  // album already exists, continue: its title may need repairing even when
  // every linked original has since been deleted from Photos.
  if(!images.count && !existing){
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
  NSMutableArray<PHAsset *> *assetsToAdd=[NSMutableArray arrayWithCapacity:images.count];
  [images enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger index,BOOL *stop){
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
// Read-only paginated preview of the PhotoKit album bound to this application
// collection. Reading never creates an empty album, removes an asset, or
// modifies the durable collection -> PHAssetCollection.localIdentifier mapping.
- (void)listAlbumAssets:(CDVInvokedUrlCommand *)cmd {
 NSString *callback=cmd.callbackId;
 NSString *collectionId=cmd.arguments.count>0&&[cmd.arguments[0] isKindOfClass:[NSString class]]?cmd.arguments[0]:@"";
 NSNumber *offsetArg=cmd.arguments.count>1&&[cmd.arguments[1] isKindOfClass:[NSNumber class]]?cmd.arguments[1]:nil;
 NSNumber *limitArg=cmd.arguments.count>2&&[cmd.arguments[2] isKindOfClass:[NSNumber class]]?cmd.arguments[2]:nil;
 if(!collectionId.length||!offsetArg||!limitArg||offsetArg.doubleValue<0||offsetArg.doubleValue>1000000||
    offsetArg.doubleValue!=(double)offsetArg.unsignedIntegerValue||limitArg.doubleValue<1||limitArg.doubleValue>48||
    limitArg.doubleValue!=(double)limitArg.unsignedIntegerValue){
  [self replyTo:callback value:nil error:@"Paramètres de galerie Photos invalides"];return;
 }
 NSUInteger offset=offsetArg.unsignedIntegerValue,limit=limitArg.unsignedIntegerValue;
 // Without the first associated original, an album does not exist yet.
 // Do not ask for photo access or create an empty album for a preview.
 if(![self albumLinks][collectionId]){
  [self replyTo:callback value:@{@"exists":@NO,@"reason":@"not-created",@"count":@0,@"offset":@(offset),@"ids":@[]} error:nil];return;
 }
 [self withAlbumAuthorization:^{
  PHAssetCollection *album=[self albumForCollection:collectionId];
  if(!album){
   // An album may have been deleted manually in Photos. Only the explicit
   // Restore action may recreate it; this read never clears the mapping.
   [self replyTo:callback value:@{@"exists":@NO,@"reason":@"missing",@"count":@0,@"offset":@(offset),@"ids":@[]} error:nil];return;
  }
  PHFetchOptions *options=[PHFetchOptions new];
  options.predicate=[NSPredicate predicateWithFormat:@"mediaType == %d",PHAssetMediaTypeImage];
  options.sortDescriptors=@[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
  PHFetchResult<PHAsset *> *assets=[PHAsset fetchAssetsInAssetCollection:album options:options];
  NSMutableArray<NSString *> *ids=[NSMutableArray array];
  NSUInteger end=MIN(assets.count,offset+limit);
  for(NSUInteger index=offset;index<end;index++){
   NSString *assetId=[assets objectAtIndex:index].localIdentifier;
   if(assetId.length)[ids addObject:assetId];
  }
  [self replyTo:callback value:@{@"exists":@YES,@"count":@(assets.count),@"offset":@(offset),@"ids":ids} error:nil];
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
   // Preserve the historical album identifier so a later resume cannot
   // mistake a manually deleted album for one that was never created.
   [self replyTo:callback value:@{@"renamed":@NO,@"missing":@YES} error:nil];return;
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
