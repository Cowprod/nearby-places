'use strict';
const assert = require('node:assert/strict');
const model = require('../www/js/collections-model.js');
const memory = () => {
  const data = new Map();
  return { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k,v) => data.set(k,v) };
};
const places = [
  {id:'p1',name:'Museum',categories:['culture']},
  {id:'p2',name:'Shop',categories:['occasion']}
];
const storage = memory();
const original = JSON.stringify(places);
storage.setItem('nearby-places-v1',original);
const migrated = model.loadOrMigrate(storage,places);
assert.equal(migrated.schemaVersion,2);
assert.equal(migrated.memberships.length,2);
assert.equal(migrated.memberships[0].categoryId,'culture');
assert.equal(storage.getItem('nearby-places-v1'),original);
assert.deepEqual(model.loadOrMigrate(storage,[]),migrated,'migration must be idempotent');
const second = model.createCollection(migrated,'Tokyo','Travel');
const local = model.createCategory(migrated,'Gachapon',second);
model.attach(migrated,'p1',second,local);
assert.equal(migrated.memberships.filter(m=>m.placeId==='p1').length,2);
assert.throws(()=>model.attach(migrated,'p2','collection-default',local),/unavailable/);
model.attach(migrated,'p1',second,'culture');
assert.equal(migrated.memberships.filter(m=>m.placeId==='p1'&&m.collectionId===second).length,1);
assert.equal(model.validate(migrated),true);
model.save(storage,migrated);
assert.equal(model.loadOrMigrate(storage,[]).memberships.length,3);
const corrupt = memory();
corrupt.setItem('nearby-collections-v2','{invalid');
assert.throws(()=>model.loadOrMigrate(corrupt,places),SyntaxError);
assert.equal(corrupt.getItem('nearby-collections-v2'),'{invalid');
console.log('collections-model: assertions passed');
