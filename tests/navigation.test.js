'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Node {
  constructor(tag, text='') { this.tagName=tag; this.textContent=text; this.children=[]; this.attributes={}; this.dataset={}; this.hidden=false; this.parent=null; }
  append(node) { node.parent=this; this.children.push(node); }
  insertAdjacentElement(where,node) { assert.equal(where,'afterend'); const i=this.parent.children.indexOf(this); this.parent.children.splice(i+1,0,node); node.parent=this.parent; }
  setAttribute(k,v) { this.attributes[k]=v; }
  querySelector(selector) { const id=selector.split('"')[1]; return this.children.find(n=>n.dataset.tab===id); }
}
const body=new Node('body');
const status=new Node('p'); status.id='status';
body.append(status);
const panel=new Node('section');
const places=new Node('div');
const headings=['Mes lieux','Notifications de proximité (expérimental)','Importer depuis Apple Plans / Google Maps / ChatGPT','Sauvegarde des lieux personnels','Ajouter un lieu'].map(t=>new Node('h2',t));
const script=new Node('script');
body.append(panel);
for(const h of headings)body.append(h);
body.append(places);
body.append(script);
const document={
  readyState:'complete',
  createElement:t=>new Node(t),
  getElementById:id=>id==='collections-panel'?panel:id==='places'?places:find(body,id),
  querySelectorAll:sel=>sel==='body > h2'?headings:[],
  querySelector:sel=>sel==='body > script'?script:null
};
function find(root,id){ if(root.id===id)return root; for(const n of root.children){const found=find(n,id);if(found)return found;}return null; }
const stored=new Map([['nearby-active-tab','add']]);
const sessionStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
const window={};
vm.runInNewContext(fs.readFileSync('www/js/navigation.js','utf8'),{document,window,sessionStorage,Array});
assert.equal(find(body,'nearby-tab-add').hidden,false,'restores Add tab');
assert.equal(find(body,'nearby-tab-places').hidden,true);
window.NearbyNavigation.show('places');
assert.equal(find(body,'nearby-tab-places').hidden,false);
assert.equal(stored.get('nearby-active-tab'),'places');
window.NearbyNavigation.show('invalid');
assert.equal(stored.get('nearby-active-tab'),'places','invalid tab does not blank UI');
const nav=find(body,'nearby-tabs-content').parent.children.find(n=>n.tagName==='nav');
assert.equal(nav.querySelector('[data-tab="places"]').attributes['aria-selected'],'true');
assert.equal(nav.querySelector('[data-tab="add"]').attributes['aria-selected'],'false');
assert.equal(fs.readFileSync('www/js/navigation.js','utf8'),fs.readFileSync('public/js/navigation.js','utf8'));
console.log('PASS navigation: persisted tab, switch, invalid target, accessibility, www/public parity');
