(function (root) {
  'use strict';
  // Capture URLs received after the WebView starts but before app.js registers
  // its full handler. This cannot recover a URL discarded earlier by iOS native code.
  var queue = [];
  root.__nearbyEarlyDeepLinks = queue;
  root.handleOpenURL = function (url) {
    if (typeof url === 'string' && queue.length < 10) queue.push(url);
  };
})(window);
