'use strict';

const path = require('path');

module.exports = function (context) {
  const root = context.opts.projectRoot;
  const hook = require(path.join(root, 'scripts/patch-share-extension.js'));
  hook.sync(root);
  hook.syncResolver(root);
};
