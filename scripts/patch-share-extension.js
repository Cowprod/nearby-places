'use strict';

// Rebuild the complete ShareExt target from versioned sources after every prepare.
const fs = require('fs');
const path = require('path');
const plist = require('plist');
const xcode = require('xcode');

const APP_GROUP = 'group.fr.cowprod.nearbyplaces.shareextension';
const EXTENSION_BUNDLE_SUFFIX = '.shareextension';
const NATIVE_FILES = [
  'ShareViewController.h',
  'ShareViewController.m',
  'MainInterface.storyboard',
  'ShareExtension-Info.plist'
];

function widgetMetadata(root) {
  const xml = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');
  const id = xml.match(/<widget\b[^>]*\bid="([^"]+)"/);
  const version = xml.match(/<widget\b[^>]*\bversion="([^"]+)"/);
  if (!id || !version) throw Error('config.xml: widget id/version missing');
  return {id:id[1], version:version[1]};
}

function patch(source, metadata) {
  return source
    .replace(/__APP_VERSION__/g, metadata.version)
    .replace(/__BUILD_VERSION__/g, metadata.version);
}

function copyIfChanged(source, target, transform) {
  if (!fs.existsSync(source)) throw Error('Versioned native file missing: '+source);
  const expected = transform ? transform(fs.readFileSync(source, 'utf8')) : fs.readFileSync(source);
  const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (current && Buffer.compare(Buffer.from(expected), current) === 0) return false;
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, expected);
  return true;
}

function targetEntry(project, name) {
  const targets = project.pbxNativeTargetSection();
  for (const [uuid, target] of Object.entries(targets)) {
    if (uuid.endsWith('_comment')) continue;
    if (String(target.name || '').replace(/^"|"$/g, '') === name) return {uuid, target};
  }
  return null;
}

function buildConfigurations(project, target) {
  const listID = String(target.buildConfigurationList || '').replace(/^"|"$/g, '');
  const list = project.pbxXCConfigurationList()[listID];
  if (!list) throw Error('Xcode configuration list missing for target');
  const section = project.pbxXCBuildConfigurationSection();
  return list.buildConfigurations.map(item => section[item.value]);
}

function sourcePhase(project, target) {
  const phaseRef = (target.buildPhases || []).find(item => item.comment === 'Sources');
  const phase = phaseRef && project.hash.project.objects.PBXSourcesBuildPhase[phaseRef.value];
  if (!phase) throw Error('Xcode Sources phase missing for target '+target.name);
  return phase;
}

function buildFileForPath(project, suffix) {
  const buildFiles = project.hash.project.objects.PBXBuildFile;
  const references = project.hash.project.objects.PBXFileReference;
  for (const [uuid, buildFile] of Object.entries(buildFiles)) {
    if (uuid.endsWith('_comment')) continue;
    const reference = references[buildFile.fileRef];
    const filePath = reference && String(reference.path || reference.name || '').replace(/^"|"$/g, '');
    if (filePath && filePath.endsWith(suffix)) return {value:uuid, comment:path.basename(suffix)+' in Sources'};
  }
  return null;
}

function repairSourcePhases(project, appTarget, extensionTarget) {
  const buildFiles = project.hash.project.objects.PBXBuildFile;
  const appSources = sourcePhase(project, appTarget);
  const extensionSources = sourcePhase(project, extensionTarget);
  // Cordova plugin removal can leave UUIDs with no PBXBuildFile. Remove only
  // those orphan references; valid source records are preserved.
  appSources.files = (appSources.files || []).filter(item => buildFiles[item.value]);
  extensionSources.files = (extensionSources.files || []).filter(item => buildFiles[item.value]);

  const resolver = buildFileForPath(project, 'cordova-plugin-nearby-resolver/NearbyResolver.m');
  const controller = buildFileForPath(project, 'ShareViewController.m');
  if (!resolver || !controller) throw Error('Required native source reference missing from Xcode project');
  appSources.files = appSources.files.filter(item => item.value !== resolver.value && item.value !== controller.value);
  extensionSources.files = extensionSources.files.filter(item => item.value !== resolver.value && item.value !== controller.value);
  appSources.files.push(resolver);
  extensionSources.files.push(controller);
}

function addTarget(project, metadata) {
  const created = project.addTarget('ShareExt', 'app_extension', 'ShareExtension', metadata.id+EXTENSION_BUNDLE_SUFFIX);
  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', created.uuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', created.uuid);
  let group = project.findPBXGroupKey({name:'ShareExtension'});
  if (!group) {
    group = project.pbxCreateGroup('ShareExtension', 'ShareExtension');
    const parent = project.findPBXGroupKey({name:'CustomTemplate'});
    if (!parent) throw Error('Xcode CustomTemplate group missing');
    project.addToPbxGroup(group, parent);
  }
  project.addFile('ShareExtension-Info.plist', group);
  project.addFile('ShareViewController.h', group);
  project.addSourceFile('ShareViewController.m', {target:created.uuid}, group);
  project.addResourceFile('MainInterface.storyboard', {target:created.uuid}, group);
  return targetEntry(project, 'ShareExt');
}

function ensureAppEntitlements(root) {
  for (const configuration of ['Debug','Release']) {
    const file = path.join(root, 'platforms/ios/App', 'Entitlements-'+configuration+'.plist');
    const data = fs.existsSync(file) ? plist.parse(fs.readFileSync(file, 'utf8')) : {};
    const groups = Array.isArray(data['com.apple.security.application-groups'])
      ? data['com.apple.security.application-groups'].slice() : [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    data['com.apple.security.application-groups'] = groups;
    fs.writeFileSync(file, plist.build(data));
  }
}

function ensureProject(root, metadata) {
  const projectFile = path.join(root, 'platforms/ios/App.xcodeproj/project.pbxproj');
  if (!fs.existsSync(projectFile)) throw Error('Generated iOS Xcode project missing');
  const project = xcode.project(projectFile);
  project.parseSync();
  let extension = targetEntry(project, 'ShareExt');
  if (!extension) extension = addTarget(project, metadata);
  if (!extension) throw Error('Unable to create ShareExt target');

  const app = targetEntry(project, 'Nearby Places') || targetEntry(project, 'App');
  if (!app) throw Error('Main iOS app target missing');
  repairSourcePhases(project, app.target, extension.target);
  for (const entry of [app, extension]) {
    const name = 'Verify Nearby native sources';
    if (!entry.target.buildPhases.some(phase => phase.comment === name)) {
      project.addBuildPhase([], 'PBXShellScriptBuildPhase', name, entry.uuid, {
        shellPath: '/bin/sh',
        shellScript: '/bin/sh "$PROJECT_DIR/../../scripts/verify-ios-sources.sh" "$PROJECT_DIR/../.."'
      });
    }
    const index = entry.target.buildPhases.findIndex(phase => phase.comment === name);
    const [reference] = entry.target.buildPhases.splice(index, 1);
    entry.target.buildPhases.unshift(reference);
    project.hash.project.objects.PBXShellScriptBuildPhase[reference.value].alwaysOutOfDate = 1;
    for (const config of buildConfigurations(project, entry.target)) {
      config.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
  }
  const appSettings = app ? buildConfigurations(project, app.target).map(config => config.buildSettings) : [];
  for (const config of buildConfigurations(project, extension.target)) {
    const settings = config.buildSettings;
    settings.APPLICATION_EXTENSION_API_ONLY = 'YES';
    settings.CODE_SIGN_ENTITLEMENTS = 'ShareExt.entitlements';
    settings.CURRENT_PROJECT_VERSION = metadata.version;
    settings.INFOPLIST_FILE = '"ShareExtension/ShareExtension-Info.plist"';
    settings.IPHONEOS_DEPLOYMENT_TARGET = '15.0';
    settings.MARKETING_VERSION = metadata.version;
    settings.PRODUCT_BUNDLE_IDENTIFIER = '"'+metadata.id+EXTENSION_BUNDLE_SUFFIX+'"';
    settings.PRODUCT_NAME = 'ShareExt';
    settings.REGISTER_APP_GROUPS = 'YES';
    settings.SKIP_INSTALL = 'YES';
    const source = appSettings[0] || {};
    if (source.DEVELOPMENT_TEAM) settings.DEVELOPMENT_TEAM = source.DEVELOPMENT_TEAM;
    if (source.CODE_SIGN_STYLE) settings.CODE_SIGN_STYLE = source.CODE_SIGN_STYLE;
  }
  fs.writeFileSync(projectFile, project.writeSync());

  const written = fs.readFileSync(projectFile, 'utf8');
  const sourceRefs = (written.match(/ShareViewController\.m in Sources/g) || []).length;
  if (sourceRefs < 2 || !written.includes('ShareExt.entitlements') || !written.includes('ShareExt.appex') ||
      written.includes('OpenWithPlugin.m') || !written.includes('NearbyResolver.m in Sources')) {
    throw Error('ShareExt Xcode target is incomplete after prepare');
  }
}

function sync(root) {
  const metadata = widgetMetadata(root);
  const nativeRoot = path.join(root, 'native/ios');
  const generatedRoot = path.join(root, 'platforms/ios/ShareExtension');
  if (!fs.existsSync(path.join(root, 'platforms/ios'))) {
    console.log('Nearby Places: iOS platform absent');
    return false;
  }
  let changed = false;
  for (const destination of [generatedRoot,path.join(root,'platforms/ios/App/Plugins/cordova-plugin-nearby-resolver')]) {
    copyIfChanged(path.join(root,'local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyPlacePicker.h'),path.join(destination,'NearbyPlacePicker.h'));
  }
  copyIfChanged(path.join(root,'local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyMapsResolver.h'),path.join(generatedRoot,'NearbyMapsResolver.h'));
  copyIfChanged(path.join(root,'local-plugins/cordova-plugin-nearby-resolver/src/ios/NearbyMapsResolver.h'),path.join(root,'platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyMapsResolver.h'));
  for (const name of NATIVE_FILES) {
    const transform = name.endsWith('.plist') ? value => patch(value, metadata) : null;
    changed = copyIfChanged(path.join(nativeRoot, name), path.join(generatedRoot, name), transform) || changed;
  }
  changed = copyIfChanged(
    path.join(nativeRoot, 'ShareExt.entitlements'),
    path.join(root, 'platforms/ios/ShareExt.entitlements')
  ) || changed;
  ensureAppEntitlements(root);
  ensureProject(root, metadata);
  syncNearbyPhotos(root);
  console.log('Nearby Places: ShareExt and PhotoKit plugin synced from versioned native sources');
  return changed;
}

// Cordova may retain a previously installed copy of a local plugin after a
// source-only Git update. Keep the generated PhotoKit implementation in sync.
function syncNearbyPhotos(root) {
  const source=path.join(root,'local-plugins/cordova-plugin-nearby-photos');
  const targets=[
    ['src/ios/NearbyPhotos.m','platforms/ios/App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m'],
    ['www/NearbyPhotos.js','platforms/ios/www/plugins/cordova-plugin-nearby-photos/www/NearbyPhotos.js']
  ];
  for(const [from,to] of targets) {
    const target=path.join(root,to);
    const transform=from.endsWith('.js')
      ? value => 'cordova.define("cordova-plugin-nearby-photos.NearbyPhotos", function(require, exports, module) {\\n'+value+'\\n});\\n'
      : null;
    if(fs.existsSync(target))copyIfChanged(path.join(source,from),target,transform);
  }
}

function syncResolver(root) {
  const source = path.join(root, 'local-plugins/cordova-plugin-nearby-resolver');
  const targets = [
    ['src/ios/NearbyResolver.m', 'platforms/ios/App/Plugins/cordova-plugin-nearby-resolver/NearbyResolver.m'],
    ['www/resolver.js', 'platforms/ios/www/plugins/cordova-plugin-nearby-resolver/www/resolver.js']
  ];
  for (const [from, to] of targets) {
    const target = path.join(root, to);
    const transform = from.endsWith('.js')
      ? value => 'cordova.define("cordova-plugin-nearby-resolver.NearbyResolver", function(require, exports, module) {\n'+value+'\n});\n'
      : null;
    if (fs.existsSync(target)) copyIfChanged(path.join(source, from), target, transform);
  }
}

if (require.main === module) {
  const root = process.cwd();
  sync(root);
  syncResolver(root);
}

function prepareHook(context) {
  const root = context.opts.projectRoot;
  sync(root);
  syncResolver(root);
}

// Cordova only invokes function exports; named helpers remain available to tests
// and to the local plugin hook.
module.exports = Object.assign(prepareHook, {APP_GROUP, NATIVE_FILES, patch, sync, syncResolver, syncNearbyPhotos});
