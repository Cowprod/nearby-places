'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=[
 ['bootswatch/dist/litera/bootstrap.min.css','css/bootswatch-litera.min.css'],
 ['bootstrap/dist/js/bootstrap.bundle.min.js','js/bootstrap.bundle.min.js'],
 ['leaflet/dist/leaflet.css','css/leaflet.css'],
 ['leaflet/dist/leaflet.js','js/leaflet.js'],
 ['leaflet/dist/images/marker-icon.png','css/images/marker-icon.png'],
 ['leaflet/dist/images/marker-icon-2x.png','css/images/marker-icon-2x.png'],
 ['leaflet/dist/images/marker-shadow.png','css/images/marker-shadow.png'],
 ['jquery/dist/jquery.min.js','js/jquery.min.js'],
 ['bootbox/dist/bootbox.min.js','js/bootbox.min.js'],
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
