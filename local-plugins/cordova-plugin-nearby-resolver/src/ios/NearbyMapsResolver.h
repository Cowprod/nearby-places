#pragma once
#import <Foundation/Foundation.h>
#import <MapKit/MapKit.h>

// Compiled once per executable: the app and extension use the same resolver.
@interface NearbyMapsResolver : NSObject <NSURLSessionTaskDelegate>
- (void)resolveURL:(NSString *)url completion:(void (^)(NSDictionary *, NSString *))completion;
+ (NSString *)validatedPlaceURL:(NSString *)value;
@end

@implementation NearbyMapsResolver
+ (NSString *)validatedPlaceURL:(NSString *)value {
    NSURLComponents *url = [NSURLComponents componentsWithString:value];
    if (![url.scheme.lowercaseString isEqualToString:@"https"]) return nil;
    NSString *host = url.host.lowercaseString;
    BOOL apple = [@[@"maps.apple.com", @"www.maps.apple.com"] containsObject:host];
    BOOL google = [@[@"google.com", @"www.google.com", @"maps.google.com", @"google.co.jp", @"www.google.co.jp", @"maps.google.co.jp"] containsObject:host];
    if (!apple && !google) return nil;
    NSMutableDictionary *query = [NSMutableDictionary dictionary];
    for (NSURLQueryItem *item in url.queryItems) if (item.value) query[item.name] = item.value;
    NSString *coordinates = apple ? (query[@"coordinate"] ?: query[@"destination"] ?: query[@"daddr"] ?: query[@"ll"] ?: query[@"q"]) : (query[@"query"] ?: query[@"q"] ?: query[@"ll"]);
    NSString *number = @"(-?[0-9]+(?:\\.[0-9]+)?)";
    NSRegularExpression *pair = [NSRegularExpression regularExpressionWithPattern:[NSString stringWithFormat:@"^\\s*%@\\s*,\\s*%@\\s*$", number, number] options:0 error:nil];
    NSTextCheckingResult *match = coordinates ? [pair firstMatchInString:coordinates options:0 range:NSMakeRange(0, coordinates.length)] : nil;
    if (!match && google) {
        NSRegularExpression *marker = [NSRegularExpression regularExpressionWithPattern:[NSString stringWithFormat:@"!3d%@!4d%@",number,number] options:0 error:nil];
        coordinates = url.path;
        match = [marker firstMatchInString:coordinates options:0 range:NSMakeRange(0,coordinates.length)];
    }
    if (!match) return nil;
    double lat = [[coordinates substringWithRange:[match rangeAtIndex:1]] doubleValue];
    double lon = [[coordinates substringWithRange:[match rangeAtIndex:2]] doubleValue];
    if (!isfinite(lat) || !isfinite(lon) || fabs(lat)>90 || fabs(lon)>180) return nil;
    return [NSString stringWithFormat:@"https://maps.apple.com/?coordinate=%.8f,%.8f",lat,lon];
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

- (void)resolveURL:(NSString *)raw completion:(void (^)(NSDictionary *, NSString *))completion {
    if (![raw isKindOfClass:NSString.class] || [(NSString *)raw length] > 2048) {
        completion(nil, @"URL invalide");
        return;
    }
    NSURL *url = [NSURL URLWithString:(NSString *)raw];
    NSString *direct = [NearbyMapsResolver validatedPlaceURL:raw];
    if (direct) { completion(@{@"url":direct,@"httpStatus":@200},nil); return; }
    if (![self isAllowedShortURL:url]) {
        completion(nil, @"Domaine de lien court non autorisé");
        return;
    }
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.timeoutIntervalForRequest = 12;
    config.timeoutIntervalForResource = 18;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
    NSURLSessionDataTask *task = [session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            completion(nil, error.localizedDescription);
            [session finishTasksAndInvalidate];
            return;
        }
        NSURL *finalURL = response.URL;
        NSInteger statusCode = [response isKindOfClass:NSHTTPURLResponse.class] ? [(NSHTTPURLResponse *)response statusCode] : 0;
        if (statusCode < 200 || statusCode >= 300 || ![self allowedURL:finalURL]) {
            completion(nil, @"Redirection ou réponse Maps non autorisée");
            [session finishTasksAndInvalidate];
            return;
        }
        NSMutableDictionary *result = [NSMutableDictionary dictionaryWithDictionary:@{
            @"url": finalURL.absoluteString ?: @"",
            @"httpStatus": @(statusCode)
        }];
        NSURLComponents *components = [NSURLComponents componentsWithURL:finalURL resolvingAgainstBaseURL:NO];
        NSString *googleQuery = nil;
        for (NSURLQueryItem *item in components.queryItems) {
            if ([item.name isEqualToString:@"q"]) googleQuery = [item.value stringByReplacingOccurrencesOfString:@"+" withString:@" "];
        }
        if ([finalURL.host.lowercaseString isEqualToString:@"www.google.com"] && googleQuery.length && [finalURL.absoluteString containsString:@"ftid="]) {
            MKLocalSearchRequest *request = [[MKLocalSearchRequest alloc] init];
            request.naturalLanguageQuery = googleQuery;
            MKLocalSearch *search = [[MKLocalSearch alloc] initWithRequest:request];
            [search startWithCompletionHandler:^(MKLocalSearchResponse *searchResponse, NSError *searchError) {
                NSString *expectedName = [[googleQuery componentsSeparatedByString:@","] firstObject];
                if (searchError || searchResponse.mapItems.count != 1) {
                    completion(nil, @"Adresse Google Maps ambiguë ; partage conservé"); return;
                }
                CLLocationCoordinate2D addressCoordinate = searchResponse.mapItems.firstObject.placemark.coordinate;
                MKLocalSearchRequest *poiRequest = [[MKLocalSearchRequest alloc] init];
                poiRequest.naturalLanguageQuery = expectedName;
                poiRequest.region = MKCoordinateRegionMakeWithDistance(addressCoordinate, 1000, 1000);
                poiRequest.resultTypes = MKLocalSearchResultTypePointOfInterest;
                MKLocalSearch *poiSearch = [[MKLocalSearch alloc] initWithRequest:poiRequest];
                [poiSearch startWithCompletionHandler:^(MKLocalSearchResponse *poiResponse, NSError *poiError) {
                NSMutableArray<MKMapItem *> *matches = [NSMutableArray array];
                CLLocation *addressLocation = [[CLLocation alloc] initWithLatitude:addressCoordinate.latitude longitude:addressCoordinate.longitude];
                for (MKMapItem *item in poiResponse.mapItems) {
                    if ([item.name compare:expectedName options:NSCaseInsensitiveSearch | NSDiacriticInsensitiveSearch] == NSOrderedSame && CLLocationCoordinate2DIsValid(item.placemark.coordinate) && [item.placemark.location distanceFromLocation:addressLocation] < 1000) [matches addObject:item];
                }
                if (poiError || matches.count != 1) {
                    completion(nil, @"La fiche Google Maps n’a pas pu être identifiée sans ambiguïté. Le partage est conservé.");
                } else {
                    MKMapItem *item = matches.firstObject;
                    result[@"htmlMapURL"] = [NSString stringWithFormat:@"https://maps.apple.com/?coordinate=%.8f,%.8f&name=%@", item.placemark.coordinate.latitude, item.placemark.coordinate.longitude, [item.name stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLQueryAllowedCharacterSet]];
                    completion(result, nil);
                }
                }];
            }];
            [session finishTasksAndInvalidate];
            return;
        }
        NSString *html = data.length <= 262144 ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
        if (html) {
            NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"(?:https?://maps\\.apple\\.com/[^\\\"'<> ]+|https?://(?:www\\.)?google\\.[a-z.]+/maps/[^\\\"'<> ]+)" options:NSRegularExpressionCaseInsensitive error:nil];
            NSTextCheckingResult *match = [regex firstMatchInString:html options:0 range:NSMakeRange(0, html.length)];
            if (match) result[@"htmlMapURL"] = [[html substringWithRange:match.range] stringByReplacingOccurrencesOfString:@"&amp;" withString:@"&"];
        }
        completion(result, nil);
        [session finishTasksAndInvalidate];
    }];
    [task resume];
}


@end
