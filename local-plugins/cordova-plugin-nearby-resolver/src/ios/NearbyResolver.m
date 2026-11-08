#import <Cordova/CDV.h>
#import "NearbyMapsResolver.h"
#import "NearbyPlacePicker.h"

static NSString * const NearbyAppGroup = @"group.fr.cowprod.nearbyplaces.shareextension";
static NSString * const NearbyQueueKey = @"nearbyShareQueue";
static NSString * const NearbyCategoriesKey = @"nearbyCategories";
static NSString * const NearbyCollectionsKey = @"nearbyCollections";

@interface NearbyResolver : CDVPlugin <NSURLSessionTaskDelegate>
- (void)resolve:(CDVInvokedUrlCommand *)command;
- (void)chooseShared:(CDVInvokedUrlCommand *)command;
- (void)readShared:(CDVInvokedUrlCommand *)command;
- (void)ackShared:(CDVInvokedUrlCommand *)command;
- (void)syncCategories:(CDVInvokedUrlCommand *)command;
- (void)syncCollections:(CDVInvokedUrlCommand *)command;
@end

@implementation NearbyResolver
- (void)chooseShared:(CDVInvokedUrlCommand *)command {
    NSString *shareID = command.arguments.firstObject;
    if (![shareID isKindOfClass:NSString.class] || ![[NSUUID alloc] initWithUUIDString:shareID]) {
        [self sendError:@"Identifiant partagé invalide" command:command]; return;
    }
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:NearbyAppGroup];
    NSURL *file = [[container URLByAppendingPathComponent:@"NearbyShares"] URLByAppendingPathComponent:[shareID stringByAppendingPathExtension:@"json"]];
    NSData *data = file ? [NSData dataWithContentsOfURL:file] : nil;
    id object = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    if (!object) {
        for (NSDictionary *item in [[self sharedDefaults] arrayForKey:NearbyQueueKey]) {
            if ([item isKindOfClass:NSDictionary.class] && [item[@"shareID"] isEqualToString:shareID]) { object=item; break; }
        }
    }
    if (![object isKindOfClass:NSDictionary.class] || ![object[@"shareID"] isEqualToString:shareID]) {
        [self sendError:@"Import introuvable ou illisible ; aucune donnée modifiée" command:command]; return;
    }
    NSMutableDictionary *record = [object mutableCopy];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.viewController.presentedViewController) {
            [self sendError:@"Fermez la fenêtre ouverte avant de choisir le lieu" command:command]; return;
        }
        NearbyPlacePicker *picker = [[NearbyPlacePicker alloc] init];
        picker.placeName = [record[@"nearbyName"] isKindOfClass:NSString.class] ? record[@"nearbyName"] : @"";
        picker.completion = ^(NSDictionary *selection, NSString *error) {
            if (error) { [self sendError:error command:command]; return; }
            record[@"nearbyName"] = selection[@"name"];
            record[@"nearbyURL"] = [NSString stringWithFormat:@"https://maps.apple.com/?coordinate=%.8f,%.8f",[selection[@"latitude"] doubleValue],[selection[@"longitude"] doubleValue]];
            // Persist the user's correction before returning to JavaScript.
            if (file && [NSFileManager.defaultManager fileExistsAtPath:file.path]) {
                NSError *writeError = nil;
                NSData *updated = [NSJSONSerialization dataWithJSONObject:record options:0 error:&writeError];
                if (!updated || ![updated writeToURL:file options:NSDataWritingAtomic error:&writeError]) {
                    [self sendError:writeError.localizedDescription ?: @"Correction non enregistrée" command:command]; return;
                }
            } else {
                NSMutableArray *queue = [[[self sharedDefaults] arrayForKey:NearbyQueueKey] mutableCopy];
                NSUInteger index = [queue indexOfObjectPassingTest:^BOOL(id item, NSUInteger idx, BOOL *stop) { return [item isKindOfClass:NSDictionary.class] && [item[@"shareID"] isEqualToString:shareID]; }];
                if (!queue || index == NSNotFound) { [self sendError:@"Import supprimé pendant la sélection" command:command]; return; }
                queue[index]=record;
                [[self sharedDefaults] setObject:queue forKey:NearbyQueueKey];
            }
            [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:record] callbackId:command.callbackId];
        };
        UINavigationController *navigation = [[UINavigationController alloc] initWithRootViewController:picker];
        navigation.modalPresentationStyle = UIModalPresentationFullScreen;
        [self.viewController presentViewController:navigation animated:YES completion:nil];
    });
}

- (NSUserDefaults *)sharedDefaults {
    return [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
}

- (void)sendError:(NSString *)message command:(CDVInvokedUrlCommand *)command {
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:message];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)readShared:(CDVInvokedUrlCommand *)command {
    NSArray *excluded = [command.arguments.firstObject isKindOfClass:NSArray.class] ? command.arguments.firstObject : @[];
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:NearbyAppGroup];
    if (!container) { [self sendError:@"Conteneur App Group inaccessible" command:command]; return; }
    NSURL *directory = [container URLByAppendingPathComponent:@"NearbyShares" isDirectory:YES];
    NSError *fileError = nil;
    NSArray *files = [NSFileManager.defaultManager contentsOfDirectoryAtURL:directory includingPropertiesForKeys:nil options:0 error:&fileError];
    if (fileError && fileError.code != NSFileReadNoSuchFileError) {
        [self sendError:fileError.localizedDescription command:command]; return;
    }
    NSArray *sorted = [files sortedArrayUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) { return [a.lastPathComponent compare:b.lastPathComponent]; }];
    for (NSURL *file in sorted) {
        if (![file.pathExtension isEqualToString:@"json"]) continue;
        if ([excluded containsObject:file.lastPathComponent.stringByDeletingPathExtension]) continue;
        NSData *data = [NSData dataWithContentsOfURL:file options:0 error:&fileError];
        id record = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&fileError] : nil;
        if (![record isKindOfClass:NSDictionary.class] || ![record[@"shareID"] isEqualToString:file.lastPathComponent.stringByDeletingPathExtension]) {
            NSDictionary *invalid = @{ @"shareID": file.lastPathComponent.stringByDeletingPathExtension,
                @"nearbyName": @"Partage illisible", @"readError": @"Le fichier partagé est illisible ; il a été conservé." };
            [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:invalid] callbackId:command.callbackId]; return;
        }
        [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:record] callbackId:command.callbackId];
        return;
    }
    NSUserDefaults *defaults = [self sharedDefaults];
    id stored = [defaults objectForKey:NearbyQueueKey];
    if (stored && ![stored isKindOfClass:NSArray.class]) {
        [self sendError:@"File d’import partagée illisible" command:command];
        return;
    }
    NSMutableArray *queue = stored ? [(NSArray *)stored mutableCopy] : [NSMutableArray array];

    // Preserve one pending record written by builds predating the durable queue.
    NSDictionary *legacy = [defaults dictionaryForKey:@"shared"];
    if (legacy) {
        NSMutableDictionary *migrated = [legacy mutableCopy];
        migrated[@"schemaVersion"] = @1;
        migrated[@"shareID"] = [legacy[@"shareID"] isKindOfClass:NSString.class] ? legacy[@"shareID"] : NSUUID.UUID.UUIDString;
        migrated[@"createdAt"] = [legacy[@"createdAt"] isKindOfClass:NSNumber.class] ? legacy[@"createdAt"] : @([NSDate.date timeIntervalSince1970]);
        [queue addObject:migrated];
        [defaults setObject:queue forKey:NearbyQueueKey];
        [defaults removeObjectForKey:@"shared"];
        if (![defaults synchronize]) {
            [self sendError:@"Migration de l’import partagé impossible" command:command];
            return;
        }
    }

    if (queue.count && ![queue.firstObject isKindOfClass:NSDictionary.class]) {
        [self sendError:@"Premier import partagé illisible ; aucun élément supprimé" command:command];
        return;
    }
    NSDictionary *next = nil;
    for (id record in queue) {
        if ([record isKindOfClass:NSDictionary.class] && ![excluded containsObject:record[@"shareID"] ?: @""]) { next = record; break; }
    }
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:next ?: @{}];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)ackShared:(CDVInvokedUrlCommand *)command {
    id rawID = command.arguments.firstObject;
    if (![rawID isKindOfClass:NSString.class] || [(NSString *)rawID length] == 0) {
        [self sendError:@"Identifiant d’import manquant" command:command];
        return;
    }
    if (![[NSUUID alloc] initWithUUIDString:rawID]) {
        [self sendError:@"Identifiant partagé invalide" command:command]; return;
    }
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:NearbyAppGroup];
    NSURL *directory = [container URLByAppendingPathComponent:@"NearbyShares" isDirectory:YES];
    NSURL *file = [directory URLByAppendingPathComponent:[rawID stringByAppendingPathExtension:@"json"]];
    if (file && [NSFileManager.defaultManager fileExistsAtPath:file.path]) {
        NSError *error = nil;
        if (![NSFileManager.defaultManager removeItemAtURL:file error:&error]) { [self sendError:error.localizedDescription command:command]; return; }
        [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:YES] callbackId:command.callbackId];
        return;
    }
    NSUserDefaults *defaults = [self sharedDefaults];
    id stored = [defaults objectForKey:NearbyQueueKey];
    if (stored && ![stored isKindOfClass:NSArray.class]) {
        [self sendError:@"File d’import partagée illisible" command:command];
        return;
    }
    NSMutableArray *remaining = [NSMutableArray array];
    for (id item in (NSArray *)(stored ?: @[])) {
        NSString *shareID = [item isKindOfClass:NSDictionary.class] && [item[@"shareID"] isKindOfClass:NSString.class] ? item[@"shareID"] : nil;
        if (![shareID isEqualToString:rawID]) [remaining addObject:item];
    }
    [defaults setObject:remaining forKey:NearbyQueueKey];
    if (remaining.count != [(NSArray *)(stored ?: @[]) count] && ![defaults synchronize]) {
        [self sendError:@"Acquittement de l’import impossible" command:command];
        return;
    }
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:YES];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)syncCategories:(CDVInvokedUrlCommand *)command {
    id raw = command.arguments.firstObject;
    if (![raw isKindOfClass:NSArray.class] || [(NSArray *)raw count] == 0 || [(NSArray *)raw count] > 250) {
        [self sendError:@"Liste de catégories invalide" command:command];
        return;
    }
    NSMutableArray *categories = [NSMutableArray array];
    for (id item in (NSArray *)raw) {
        if (![item isKindOfClass:NSDictionary.class] || ![item[@"id"] isKindOfClass:NSString.class] ||
            ![item[@"name"] isKindOfClass:NSString.class] || [item[@"id"] length] == 0 || [item[@"name"] length] == 0) {
            [self sendError:@"Catégorie invalide" command:command];
            return;
        }
        [categories addObject:@{ @"id": item[@"id"], @"name": item[@"name"], @"collectionId": [item[@"collectionId"] isKindOfClass:NSString.class] ? item[@"collectionId"] : @"" }];
    }
    NSUserDefaults *defaults = [self sharedDefaults];
    [defaults setObject:categories forKey:NearbyCategoriesKey];
    if (![defaults synchronize]) {
        [self sendError:@"Synchronisation des catégories impossible" command:command];
        return;
    }
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:YES];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)syncCollections:(CDVInvokedUrlCommand *)command {
    id raw = command.arguments.firstObject;
    if (![raw isKindOfClass:NSArray.class] || [(NSArray *)raw count] > 200) {
        [self sendError:@"Liste de collections invalide" command:command]; return;
    }
    NSMutableArray *collections = [NSMutableArray array];
    for (id item in (NSArray *)raw) {
        if (![item isKindOfClass:NSDictionary.class] || ![item[@"id"] isKindOfClass:NSString.class] ||
            ![item[@"name"] isKindOfClass:NSString.class] || [item[@"id"] length] == 0 || [item[@"name"] length] == 0) {
            [self sendError:@"Collection invalide" command:command]; return;
        }
        [collections addObject:@{@"id":item[@"id"],@"name":item[@"name"]}];
    }
    NSUserDefaults *defaults = [self sharedDefaults];
    [defaults setObject:collections forKey:NearbyCollectionsKey];
    if (![defaults synchronize]) {
        [self sendError:@"Synchronisation des collections impossible" command:command]; return;
    }
    [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:YES] callbackId:command.callbackId];
}

- (void)resolve:(CDVInvokedUrlCommand *)command {
    NearbyMapsResolver *resolver = [[NearbyMapsResolver alloc] init];
    [resolver resolveURL:command.arguments.firstObject completion:^(NSDictionary *result, NSString *error) {
        if (error) { [self sendError:error command:command]; return; }
        [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:result] callbackId:command.callbackId];
    }];
}

@end
