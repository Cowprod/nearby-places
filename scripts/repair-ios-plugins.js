'use strict';
// Repair an incomplete generated iOS PhotoKit plugin before Cordova's
// after_prepare hook inspects the Xcode target. Never touch application data.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const project=path.join(root,'platforms/ios/App.xcodeproj/project.pbxproj');
if(!fs.existsSync(project)){console.log('iOS platform not generated; Cordova will install plugins during prepare.');process.exit(0);}
const source=fs.readFileSync(project,'utf8');
const installed=path.join(root,'platforms/ios/App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m');
if(source.includes('NearbyPhotos.m')&&fs.existsSync(installed)){process.exit(0);}
console.log('Repairing missing NearbyPhotos iOS plugin registration...');
function cordova(args){
 const bin=path.join(root,'node_modules/.bin/cordova');
 const result=spawnSync(bin,args,{cwd:root,stdio:'inherit',shell:false});
 if(result.error||result.status!==0)throw Error('cordova '+args.join(' ')+' failed: '+(result.error?result.error.message:result.status));
}
// Cordova can retain plugin metadata while losing its Xcode PBXBuildFile.
cordova(['plugin','rm','cordova-plugin-nearby-photos','--nosave']);
cordova(['plugin','add','./local-plugins/cordova-plugin-nearby-photos','--nosave']);
const repaired=fs.readFileSync(project,'utf8');
if(!repaired.includes('NearbyPhotos.m'))throw Error('PhotoKit plugin still missing from generated Xcode project after reinstall.');
console.log('NearbyPhotos native plugin registration restored.');
