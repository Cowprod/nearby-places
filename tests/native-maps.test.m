#import "../local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyMapsResolver.h"

int main(void) {
    @autoreleasepool {
        NSCAssert([NearbyMapsResolver validatedPlaceURL:@"https://maps.apple.com/place?coordinate=35.7,139.8"], @"Apple coordinates");
        NSCAssert([NearbyMapsResolver validatedPlaceURL:@"https://www.google.com/maps/place/Test/data=!3d35.7!4d139.8"], @"Google POI marker");
        NSCAssert([NearbyMapsResolver validatedPlaceURL:@"https://www.google.com/maps/search/?query=35.7,139.8"], @"Google numeric query");
        NSCAssert(![NearbyMapsResolver validatedPlaceURL:@"https://www.google.com/maps/place/Test/@35.7,139.8,16z"], @"Camera is not POI");
        NSCAssert(![NearbyMapsResolver validatedPlaceURL:@"https://evil.example/?coordinate=35.7,139.8"], @"Untrusted host");
        NSCAssert(![NearbyMapsResolver validatedPlaceURL:@"https://maps.apple.com/?coordinate=95,139"], @"Invalid latitude");
        NSLog(@"PASS native Maps validation: coordinates, Google POI, camera and host rejection");
    }
    return 0;
}
