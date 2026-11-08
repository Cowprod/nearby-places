'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=[
 ['bootswatch/dist/litera/bootstrap.min.css','css/bootswatch-litera.min.css'],
 ['@fortawesome/fontawesome-free/css/all.min.css','css/fontawesome.min.css'],
 ...['fa-solid-900.woff2','fa-regular-400.woff2','fa-brands-400.woff2'].map(f=>['@fortawesome/fontawesome-free/webfonts/'+f,'webfonts/'+f])
];
for(const surface of ['www','public']){
 for(const [source,target] of assets){
  const src=path.join(root,'node_modules',source);
  if(!fs.existsSync(src))throw Error('UI asset missing: '+source+'; run npm install');
  const dest=path.join(root,surface,'assets',target);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(src,dest);
 }
}
console.log('Bootswatch Litera and Font Awesome Free copied locally into www/public');
