#import <Cordova/CDV.h>
#import <MapKit/MapKit.h>
@interface NearbyResolver : CDVPlugin
- (void)resolve:(CDVInvokedUrlCommand *)command;
@end
@implementation NearbyResolver
- (void)resolve:(CDVInvokedUrlCommand *)command {
 NSString *raw=[command.arguments firstObject];
 NSURL *url=[NSURL URLWithString:raw];
 NSString *host=url.host.lowercaseString;
 if (!url || ![url.scheme.lowercaseString isEqualToString:@"https"] || !([host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.app.goo.gl"])) {
  [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Domaine de lien court non autorisé"] callbackId:command.callbackId];return;
 }
 NSURLSessionConfiguration *config=[NSURLSessionConfiguration ephemeralSessionConfiguration];
 config.timeoutIntervalForRequest=12;
 config.timeoutIntervalForResource=18;
 NSURLSession *session=[NSURLSession sessionWithConfiguration:config];
 NSURLSessionDataTask *task=[session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error){
  if(error){[self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:error.localizedDescription] callbackId:command.callbackId];[session finishTasksAndInvalidate];return;}
  NSURL *finalURL=response.URL;
  NSString *target=finalURL.absoluteString ?: @"";
  NSMutableDictionary *result=[NSMutableDictionary dictionaryWithDictionary:@{@"url":target,@"httpStatus":@([(NSHTTPURLResponse *)response statusCode])}];
  NSString *html=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
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
