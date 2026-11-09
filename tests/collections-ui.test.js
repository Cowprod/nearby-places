'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../www/js/collections-model.js');

// Small DOM harness: exercises the actual UI handlers without iOS or a browser dependency.
class Element {
  constructor(tag) {
    this.tagName = tag.toLowerCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.open = false;
    this.parent = null;
  }
  append(...items) {
    for (const item of items) {
      item.parent = this;
      this.children.push(item);
    }
  }
  replaceChildren(...items) {
    this.children = [];
    this.append(...items);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  insertAdjacentElement(position, element) {
    assert.equal(position,'afterend');
    const index = this.parent.children.indexOf(this);
    element.parent = this.parent;
    this.parent.children.splice(index + 1, 0, element);
  }
  querySelectorAll(selector) {
    assert.equal(selector, 'details[data-collection-id]');
    const result = [];
    function visit(node) {
      if (node.tagName === 'details' && node.dataset.collectionId) result.push(node);
      node.children.forEach(visit);
    }
    this.children.forEach(visit);
    return result;
  }
}
const body = new Element('body');
const h1 = new Element('h1');
body.append(h1);
const storageData = new Map();
const oldPlaces = [{id:'p1',name:'Musée',categories:['culture']}];
const legacyRaw = JSON.stringify(oldPlaces);
storageData.set('nearby-places-v1',legacyRaw);
// The default (unclassified) collection is intentionally hidden in the list.
// Exercise collection editing with a visible user-created collection.
const seededStorage={getItem:key=>storageData.get(key)??null,setItem:(key,value)=>storageData.set(key,value)};
const seeded=model.loadOrMigrate(seededStorage,oldPlaces);
const collectionId=model.createCollection(seeded,'Initial collection','');
model.save(seededStorage,seeded);
let rejectSave = false;
const storage = {
  getItem(key) { return storageData.has(key) ? storageData.get(key) : null; },
  setItem(key, value) {
    if (rejectSave && key === 'nearby-collections-v2') throw Error('quota exceeded');
    storageData.set(key,value);
  }
};
const events = {};
const window = {
  NearbyCollections: model,
  addEventListener(name, fn) { events[name] = fn; },
  confirm() { return true; }
};
const document = {
  readyState:'complete',
  createElement(tag) { return new Element(tag); },
  querySelector(value) { assert.equal(value,'h1'); return h1; }
};
const context = {window,document,localStorage:storage,Set,Array,Date};
vm.runInNewContext(fs.readFileSync('www/js/collections-ui.js','utf8'),context,{filename:'collections-ui.js'});
const panel = body.children[1];
assert.equal(panel.id,'collections-panel');
const list = panel.children[3];
const detailView = panel.children[4];
list.children[0].children[0].onclick();
assert.equal(list.hidden,true,'opening collection shows its detail');
assert.equal(detailView.hidden,false,'collection detail is visible');
const feedback = panel.children[5];
function editor() { return detailView.children[1].children.find(c=>c.tagName==='details'); }
let details = editor();
assert.equal(details.open,false);
assert.equal(details.children[2].tagName,'textarea','collection description editor exists');
details.open = true;
details.children[1].value='Tokyo';
details.children[2].value='Lieux visités pendant le voyage';
details.children[3].onclick();
assert.equal(feedback.textContent,'Fiche enregistrée');
assert.equal(editor().open,true,'re-render preserves the opened editor');
let saved = JSON.parse(storage.getItem('nearby-collections-v2'));
assert.equal(saved.collections.find(c=>c.id===collectionId).name,'Tokyo');
assert.equal(saved.collections.find(c=>c.id===collectionId).description,'Lieux visités pendant le voyage');
assert.equal(saved.memberships.length,1);
assert.equal(storage.getItem('nearby-places-v1'),legacyRaw,'legacy places are untouched');

// A storage failure must not change the in-memory collection or corrupt the saved copy.
rejectSave = true;
details = editor();
details.children[1].value='Modified but unsaved';
details.children[2].value='Not saved';
details.children[3].onclick();
assert.match(feedback.textContent,/quota exceeded/);
rejectSave = false;
events['nearby-places-changed']();
saved = JSON.parse(storage.getItem('nearby-collections-v2'));
assert.equal(saved.collections[0].name,'Tokyo');
assert.equal(saved.collections[0].description,'Lieux visités pendant le voyage');
assert.equal(editor().open,true,'refresh preserves editor state');
assert.equal(storage.getItem('nearby-places-v1'),legacyRaw);
assert.equal(fs.readFileSync('www/js/collections-ui.js','utf8'),
  fs.readFileSync('public/js/collections-ui.js','utf8'),'Cordova and web preview match');
const iosHTML = fs.readFileSync('www/index.html','utf8');
assert.equal(iosHTML,fs.readFileSync('public/index.html','utf8'),'web and iOS HTML match');
assert.match(iosHTML,/collection-card details textarea\{min-height:82px/,'description usable on iPhone');
const bulk = panel.children[6];
assert.equal(bulk.id,'collections-bulk');
const destination = bulk.children[1];
const bulkButton = bulk.children[2];
destination.value = collectionId;
bulkButton.onclick();
const afterBulk = JSON.parse(storage.getItem('nearby-collections-v2'));
assert.equal(afterBulk.memberships.filter(m=>m.collectionId===collectionId).length,1,'bulk assignment is idempotent');
assert.equal(storage.getItem('nearby-places-v1'),legacyRaw,'bulk assignment preserves places');
console.log('PASS collections UI: description, open editor, persistence rollback, legacy data and public parity');
