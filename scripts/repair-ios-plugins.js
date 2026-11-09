'use strict';
// Restore the generated Xcode source entry without Cordova plugin removal.
// Plugin removal can fail on unrelated stale plugin metadata.
const fs=require('node:fs');
const path=require('node:path');
const xcode=require('xcode');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'platforms/ios/App.xcodeproj/project.pbxproj');
if(!fs.existsSync(file)){console.log('iOS platform not generated yet.');process.exit(0);}
const project=xcode.project(file);project.parseSync();
const targets=project.pbxNativeTargetSection();
const app=Object.entries(targets).find(([id,t])=>!id.endsWith('_comment')&&['App','Nearby Places'].includes(String(t.name||'').replace(/^"|"$/g,'')));
if(!app)throw Error('Main iOS app target missing');
const phaseRef=(app[1].buildPhases||[]).find(p=>p.comment==='Sources');
const phase=phaseRef&&project.hash.project.objects.PBXSourcesBuildPhase[phaseRef.value];
if(!phase)throw Error('Main iOS app Sources phase missing');
const buildFiles=project.hash.project.objects.PBXBuildFile;
const references=project.hash.project.objects.PBXFileReference;
const native='App/Plugins/cordova-plugin-nearby-photos/NearbyPhotos.m';
const source=path.join(root,'local-plugins/cordova-plugin-nearby-photos/src/ios/NearbyPhotos.m');
const target=path.join(root,'platforms/ios',native);
if(!fs.existsSync(source))throw Error('Versioned NearbyPhotos.m source missing');
fs.mkdirSync(path.dirname(target),{recursive:true});
if(!fs.existsSync(target)||!fs.readFileSync(target).equals(fs.readFileSync(source)))fs.copyFileSync(source,target);
function matches(ref){
 const entry=ref&&references[ref];
 return entry&&String(entry.path||entry.name||'').replace(/^"|"$/g,'').endsWith('NearbyPhotos.m');
}
let build=Object.entries(buildFiles).find(([id,entry])=>!id.endsWith('_comment')&&matches(entry.fileRef));
if(!build){
 // Register a new source file in the app target; Cordova may have lost the
 // PBXBuildFile entirely while retaining its installed plugin metadata.
 const group=project.findPBXGroupKey({name:'Plugins'})||project.findPBXGroupKey({name:'CustomTemplate'});
 if(!group)throw Error('Xcode Plugins/CustomTemplate group missing');
 project.addSourceFile(native,{target:app[0]},group);
}else if(!(phase.files||[]).some(entry=>entry.value===build[0])){
 phase.files.push({value:build[0],comment:'NearbyPhotos.m in Sources'});
}
fs.writeFileSync(file,project.writeSync());
console.log('NearbyPhotos.m registered in App Sources without removing Cordova plugins.');
