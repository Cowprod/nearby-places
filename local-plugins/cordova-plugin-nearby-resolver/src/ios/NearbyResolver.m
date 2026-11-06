#import <Cordova/CDV.h>
#import <MapKit/MapKit.h>
@interface NearbyResolver : CDVPlugin <NSURLSessionTaskDelegate>
- (void)resolve:(CDVInvokedUrlCommand *)command;
@end
@implementation NearbyResolver
- (BOOL)allowedURL:(NSURL *)url {
 if(!url || ![url.scheme.lowercaseString isEqualToString:@"https"])return NO;
 NSString *host=url.host.lowercaseString;
 return [@[@"maps.apple",@"maps.apple.com",@"www.maps.apple.com",
           @"maps.app.goo.gl",@"google.com",@"www.google.com",@"maps.google.com"] containsObject:host];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
 willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
 completionHandler:(void (^)(NSURLRequest * _Nullable))completionHandler {
 // Never follow a short Maps link to a third-party or non-HTTPS destination.
 completionHandler([self allowedURL:request.URL] ? request : nil);
}
- (void)resolve:(CDVInvokedUrlCommand *)command {
 id raw=[command.arguments firstObject];
 if(![raw isKindOfClass:[NSString class]] || [(NSString *)raw length]>2048){
  [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"URL invalide"] callbackId:command.callbackId];return;
 }
 NSURL *url=[NSURL URLWithString:(NSString *)raw];
 NSString *host=url.host.lowercaseString;
 if (!url || ![url.scheme.lowercaseString isEqualToString:@"https"] || !([host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.app.goo.gl"])) {
  [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Domaine de lien court non autorisé"] callbackId:command.callbackId];return;
 }
 NSURLSessionConfiguration *config=[NSURLSessionConfiguration ephemeralSessionConfiguration];
 config.timeoutIntervalForRequest=12;
 config.timeoutIntervalForResource=18;
 NSURLSession *session=[NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
 NSURLSessionDataTask *task=[session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error){
  if(error){[self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error.localizedDescription] callbackId:command.callbackId];[session finishTasksAndInvalidate];return;}
  NSURL *finalURL=response.URL;
  NSInteger statusCode=[response isKindOfClass:[NSHTTPURLResponse class]] ? [(NSHTTPURLResponse *)response statusCode] : 0;
  if(statusCode<200 || statusCode>=300 || ![self allowedURL:finalURL]){
   [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Redirection ou réponse Maps non autorisée"] callbackId:command.callbackId];
   [session finishTasksAndInvalidate];return;
  }
  NSString *target=finalURL.absoluteString ?: @"";
  NSMutableDictionary *result=[NSMutableDictionary dictionaryWithDictionary:@{@"url":target,@"httpStatus":@(statusCode)}];
  NSString *html=data.length<=262144 ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
  if(html){
   NSRegularExpression *regex=[NSRegularExpression regularExpressionWithPattern:@"(?:https?://maps\\.apple\\.com/[^\\\"'<> ]+|https?://www\\.google\\.com/maps/[^\\\"'<> ]+)" options:0 error:nil];
   NSTextCheckingResult *match=[regex firstMatchInString:html options:0 range:NSMakeRange(0,html.length)];
   if(match)result[@"htmlMapURL"]=[[html substringWithRange:match.range] stringByReplacingOccurrencesOfString:@"&amp;" withString:@"&"];
  }
  [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:result] callbackId:command.callbackId];
  [session finishTasksAndInvalidate];
 }];
 [task resume];
}
@end
