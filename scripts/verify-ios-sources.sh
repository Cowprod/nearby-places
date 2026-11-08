#!/bin/sh
set -eu
cd "$1"

compare() {
  if ! /usr/bin/cmp -s "$1" "$2"; then
    echo "error: Nearby Places: iOS sources are stale ($2). Run npm run ios:prepare before building." >&2
    exit 1
  fi
}

for file in ShareViewController.h ShareViewController.m MainInterface.storyboard; do
  compare "native/ios/$file" "platforms/ios/ShareExtension/$file"
done
compare native/ios/ShareExt.entitlements platforms/ios/ShareExt.entitlements
plugin=local-plugins/cordova-plugin-nearby-resolver/src/ios
compare "$plugin/NearbyResolver.m" platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyResolver.m
for file in NearbyMapsResolver.h NearbyPlacePicker.h; do
  compare "$plugin/$file" "platforms/ios/ShareExtension/$file"
  compare "$plugin/$file" "platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/$file"
done
echo 'Nearby Places: native sources match Git working tree.'
