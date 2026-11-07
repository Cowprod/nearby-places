#import <Cordova/CDV.h>

static NSString * const NearbyAppGroup = @"group.fr.cowprod.nearbyplaces.shareextension";
static NSString * const NearbyQueueKey = @"nearbyShareQueue";
static NSString * const NearbyCategoriesKey = @"nearbyCategories";

@interface NearbyResolver : CDVPlugin <NSURLSessionTaskDelegate>
- (void)resolve:(CDVInvokedUrlCommand *)command;
- (void)readShared:(CDVInvokedUrlCommand *)command;
- (void)ackShared:(CDVInvokedUrlCommand *)command;
- (void)syncCategories:(CDVInvokedUrlCommand *)command;
@end

@implementation NearbyResolver

- (NSUserDefaults *)sharedDefaults {
    return [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
}

- (void)sendError:(NSString *)message command:(CDVInvokedUrlCommand *)command {
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:message];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)readShared:(CDVInvokedUrlCommand *)command {
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
    NSDictionary *next = queue.firstObject;
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:next ?: @{}];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)ackShared:(CDVInvokedUrlCommand *)command {
    id rawID = command.arguments.firstObject;
    if (![rawID isKindOfClass:NSString.class] || [(NSString *)rawID length] == 0) {
        [self sendError:@"Identifiant d’import manquant" command:command];
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
    if (![defaults synchronize]) {
        [self sendError:@"Acquittement de l’import impossible" command:command];
        return;
    }
    CDVPluginResult *result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:YES];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

- (void)syncCategories:(CDVInvokedUrlCommand *)command {
    id raw = command.arguments.firstObject;
    if (![raw isKindOfClass:NSArray.class] || [(NSArray *)raw count] == 0 || [(NSArray *)raw count] > 50) {
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
        [categories addObject:@{ @"id": item[@"id"], @"name": item[@"name"] }];
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

- (BOOL)allowedURL:(NSURL *)url {
    if (!url || ![url.scheme.lowercaseString isEqualToString:@"https"]) return NO;
    NSString *host = url.host.lowercaseString ?: @"";
    return [host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.apple.com"] || [host isEqualToString:@"www.maps.apple.com"] ||
        [host isEqualToString:@"maps.app.goo.gl"] || [host isEqualToString:@"goo.gl"] ||
        [@[@"google.com",@"www.google.com",@"maps.google.com",@"google.co.jp",@"www.google.co.jp",@"maps.google.co.jp"] containsObject:host];
}

- (BOOL)isAllowedShortURL:(NSURL *)url {
    NSString *host = url.host.lowercaseString ?: @"";
    if (![url.scheme.lowercaseString isEqualToString:@"https"]) return NO;
    return [host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.app.goo.gl"] ||
        ([host isEqualToString:@"goo.gl"] && [url.path hasPrefix:@"/maps"]);
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
 willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
 completionHandler:(void (^)(NSURLRequest * _Nullable))completionHandler {
    completionHandler([self allowedURL:request.URL] ? request : nil);
}

- (void)resolve:(CDVInvokedUrlCommand *)command {
    id raw = command.arguments.firstObject;
    if (![raw isKindOfClass:NSString.class] || [(NSString *)raw length] > 2048) {
        [self sendError:@"URL invalide" command:command];
        return;
    }
    NSURL *url = [NSURL URLWithString:(NSString *)raw];
    if (![self isAllowedShortURL:url]) {
        [self sendError:@"Domaine de lien court non autorisé" command:command];
        return;
    }
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.timeoutIntervalForRequest = 12;
    config.timeoutIntervalForResource = 18;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
    NSURLSessionDataTask *task = [session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            [self sendError:error.localizedDescription command:command];
            [session finishTasksAndInvalidate];
            return;
        }
        NSURL *finalURL = response.URL;
        NSInteger statusCode = [response isKindOfClass:NSHTTPURLResponse.class] ? [(NSHTTPURLResponse *)response statusCode] : 0;
        if (statusCode < 200 || statusCode >= 300 || ![self allowedURL:finalURL]) {
            [self sendError:@"Redirection ou réponse Maps non autorisée" command:command];
            [session finishTasksAndInvalidate];
            return;
        }
        NSMutableDictionary *result = [NSMutableDictionary dictionaryWithDictionary:@{
            @"url": finalURL.absoluteString ?: @"",
            @"httpStatus": @(statusCode)
        }];
        NSString *html = data.length <= 262144 ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
        if (html) {
            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"(?:https?://maps\\.apple\\.com/[^\\\"'<> ]+|https?://(?:www\\.)?google\\.[a-z.]+/maps/[^\\\"'<> ]+)" options:NSRegularExpressionCaseInsensitive error:nil];
            NSTextCheckingResult *match = [regex firstMatchInString:html options:0 range:NSMakeRange(0, html.length)];
            if (match) result[@"htmlMapURL"] = [[html substringWithRange:match.range] stringByReplacingOccurrencesOfString:@"&amp;" withString:@"&"];
        }
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:result];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
        [session finishTasksAndInvalidate];
    }];
    [task resume];
}

@end
