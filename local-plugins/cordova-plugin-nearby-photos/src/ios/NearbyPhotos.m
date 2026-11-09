#import <Cordova/CDV.h>
#import <Photos/Photos.h>
#import <PhotosUI/PhotosUI.h>
#import <CoreLocation/CoreLocation.h>
#import <UIKit/UIKit.h>
@interface NearbyPhotos : CDVPlugin <UIImagePickerControllerDelegate,UINavigationControllerDelegate,PHPickerViewControllerDelegate>
@property(nonatomic,copy) NSString *pending;

@end
@implementation NearbyPhotos
- (void)replyTo:(NSString*)callback value:(id)value error:(NSString*)error { CDVPluginResult *r=error?[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error]:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:value];[self.commandDelegate sendPluginResult:r callbackId:callback]; }
- (void)capture:(CDVInvokedUrlCommand*)cmd {
 self.pending=cmd.callbackId;
 if(![UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]){[self replyTo:self.pending value:nil error:@"Appareil photo indisponible"];return;}
 dispatch_async(dispatch_get_main_queue(),^{UIImagePickerController *picker=[UIImagePickerController new];picker.sourceType=UIImagePickerControllerSourceTypeCamera;picker.delegate=self;[self.viewController presentViewController:picker animated:YES completion:nil];});
}
- (void)imagePickerControllerDidCancel:(UIImagePickerController*)picker {[picker dismissViewControllerAnimated:YES completion:^{[self replyTo:self.pending value:nil error:@"Annulé"];}];}
- (void)imagePickerController:(UIImagePickerController*)picker didFinishPickingMediaWithInfo:(NSDictionary*)info {
 UIImage *image=info[UIImagePickerControllerOriginalImage];
 [picker dismissViewControllerAnimated:YES completion:nil];
 if(!image){[self replyTo:self.pending value:nil error:@"Image absente"];return;}
 void (^save)(void)=^{
 __block NSString *identifier=nil;
 [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{PHAssetChangeRequest *request=[PHAssetChangeRequest creationRequestForAssetFromImage:image];identifier=request.placeholderForCreatedAsset.localIdentifier;} completionHandler:^(BOOL success,NSError *error){dispatch_async(dispatch_get_main_queue(),^{if(success&&identifier)[self replyTo:self.pending value:@{@"id":identifier} error:nil];else [self replyTo:self.pending value:nil error:error.localizedDescription?:@"Enregistrement impossible"];});}];
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelAddOnly];
 if(status==PHAuthorizationStatusNotDetermined){[PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelAddOnly completionHandler:^(PHAuthorizationStatus result){if(result==PHAuthorizationStatusAuthorized)save();else [self replyTo:self.pending value:nil error:@"Accès Photos refusé"]; }];}
 else if(status==PHAuthorizationStatusAuthorized)save();else [self replyTo:self.pending value:nil error:@"Accès Photos refusé"];
}
- (void)nearby:(CDVInvokedUrlCommand*)cmd {
 self.pending=cmd.callbackId;
 double lat=[cmd.arguments[0] doubleValue],lon=[cmd.arguments[1] doubleValue],radius=MAX(10,MIN(5000,[cmd.arguments[2] doubleValue]));
 if(!isfinite(lat)||!isfinite(lon)||fabs(lat)>90||fabs(lon)>180){[self replyTo:self.pending value:nil error:@"Coordonnées invalides"];return;}
 NSString *callback=cmd.callbackId;void (^query)(void)=^{
 PHFetchOptions *options=[PHFetchOptions new];options.sortDescriptors=@[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];CLLocation *center=[[CLLocation alloc] initWithLatitude:lat longitude:lon];NSMutableArray *items=[NSMutableArray array];
 [assets enumerateObjectsUsingBlock:^(PHAsset *asset,NSUInteger idx,BOOL *stop){if(items.count>=150){*stop=YES;return;}if(!asset.location)return;CLLocationDistance d=[asset.location distanceFromLocation:center];if(d<=radius)[items addObject:@{@"id":asset.localIdentifier,@"distance":@(round(d)),@"createdAt":@([asset.creationDate timeIntervalSince1970]*1000)}];}];
 [self replyTo:callback value:@{@"items":items} error:nil];
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(status==PHAuthorizationStatusNotDetermined){[PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite completionHandler:^(PHAuthorizationStatus result){if(result==PHAuthorizationStatusAuthorized||result==PHAuthorizationStatusLimited)query();else [self replyTo:self.pending value:nil error:@"Accès à la photothèque refusé"]; }];}
 else if(status==PHAuthorizationStatusAuthorized||status==PHAuthorizationStatusLimited)query();else [self replyTo:self.pending value:nil error:@"Accès à la photothèque refusé"];
}
- (void)thumbnail:(CDVInvokedUrlCommand*)cmd {
 self.pending=cmd.callbackId;NSString *identifier=cmd.arguments.firstObject;PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil];PHAsset *asset=assets.firstObject;
 if(!asset){[self replyTo:self.pending value:nil error:@"Photo introuvable ou accès limité"];return;}
 NSString *callback=cmd.callbackId;PHImageRequestOptions *options=[PHImageRequestOptions new];options.networkAccessAllowed=NO;options.deliveryMode=PHImageRequestOptionsDeliveryModeHighQualityFormat;
 [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(320,320) contentMode:PHImageContentModeAspectFill options:options resultHandler:^(UIImage *image,NSDictionary *info){if(!image)return;NSData *data=UIImageJPEGRepresentation(image,0.72);[self replyTo:callback value:@{@"dataUrl":[NSString stringWithFormat:@"data:image/jpeg;base64,%@",[data base64EncodedStringWithOptions:0]]} error:nil];}];
}
- (void)pick:(CDVInvokedUrlCommand*)cmd {
 self.pending=cmd.callbackId;PHPickerConfiguration *config=[[PHPickerConfiguration alloc] initWithPhotoLibrary:[PHPhotoLibrary sharedPhotoLibrary]];config.filter=[PHPickerFilter imagesFilter];config.selectionLimit=0;PHPickerViewController *picker=[[PHPickerViewController alloc] initWithConfiguration:config];picker.delegate=self;[self.viewController presentViewController:picker animated:YES completion:nil];
}
- (void)picker:(PHPickerViewController*)picker didFinishPicking:(NSArray<PHPickerResult*>*)results {
 [picker dismissViewControllerAnimated:YES completion:nil];NSMutableArray *ids=[NSMutableArray array];for(PHPickerResult *result in results){if(result.assetIdentifier)[ids addObject:result.assetIdentifier];}
 [self replyTo:self.pending value:@{@"ids":ids} error:nil];
}
- (void)addToAlbum:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;
 NSString *title=cmd.arguments.count>0&&[cmd.arguments[0] isKindOfClass:NSString.class]?cmd.arguments[0]:@"";
 NSArray *identifiers=cmd.arguments.count>1&&[cmd.arguments[1] isKindOfClass:NSArray.class]?cmd.arguments[1]:@[];
 if(title.length==0||identifiers.count==0){[self replyTo:callback value:nil error:@"Album ou photos manquants"];return;}
 void (^apply)(void)=^{
 PHFetchResult<PHAsset*> *assets=[PHAsset fetchAssetsWithLocalIdentifiers:identifiers options:nil];
 if(assets.count==0){[self replyTo:callback value:nil error:@"Photos non accessibles"];return;}
 PHFetchOptions *opts=[PHFetchOptions new];opts.predicate=[NSPredicate predicateWithFormat:@"title == %@",title];
 PHAssetCollection *existing=[PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeAlbum subtype:PHAssetCollectionSubtypeAlbumRegular options:opts].firstObject;
 [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
 PHAssetCollectionChangeRequest *request=nil;
 if(existing)request=[PHAssetCollectionChangeRequest changeRequestForAssetCollection:existing];
 else request=[PHAssetCollectionChangeRequest creationRequestForAssetCollectionWithTitle:title];
 [request addAssets:assets];
 } completionHandler:^(BOOL success,NSError *error){[self replyTo:callback value:success?@{@"album":title,@"count":@(assets.count)}:nil error:success?nil:(error.localizedDescription?:@"Impossible de créer l’album")];}];
 };
 PHAuthorizationStatus status=[PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
 if(status==PHAuthorizationStatusNotDetermined)[PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite completionHandler:^(PHAuthorizationStatus result){if(result==PHAuthorizationStatusAuthorized||result==PHAuthorizationStatusLimited)apply();else [self replyTo:callback value:nil error:@"Autorisation Photos refusée"];}];
 else if(status==PHAuthorizationStatusAuthorized||status==PHAuthorizationStatusLimited)apply();
 else [self replyTo:callback value:nil error:@"Autorisation Photos refusée"];
}
- (void)renameAlbum:(CDVInvokedUrlCommand*)cmd {
 NSString *callback=cmd.callbackId;
 NSString *oldName=cmd.arguments.count>0?cmd.arguments[0]:@"";
 NSString *newName=cmd.arguments.count>1?cmd.arguments[1]:@"";
 if(!oldName.length||!newName.length){[self replyTo:callback value:nil error:@"Nom d’album manquant"];return;}
 PHFetchOptions *opts=[PHFetchOptions new];opts.predicate=[NSPredicate predicateWithFormat:@"title == %@",oldName];
 PHAssetCollection *album=[PHAssetCollection fetchAssetCollectionsWithType:PHAssetCollectionTypeAlbum subtype:PHAssetCollectionSubtypeAlbumRegular options:opts].firstObject;
 if(!album){[self replyTo:callback value:@{@"renamed":@NO} error:nil];return;}
 [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{[PHAssetCollectionChangeRequest changeRequestForAssetCollection:album].title=newName;} completionHandler:^(BOOL ok,NSError *error){[self replyTo:callback value:ok?@{@"renamed":@YES}:nil error:ok?nil:error.localizedDescription];}];
}
@end