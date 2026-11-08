(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NearbyCollections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT_CATEGORIES = [
    ['culture', 'Culture'], ['resto', 'Restaurant'], ['musique', 'Musique'],
    ['transport', 'Transport'], ['occasion', 'Occasion'], ['modelisme', 'Modélisme']
  ];
  function identifier(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return prefix + crypto.randomUUID();
    return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
  function initial(places) {
    if (!Array.isArray(places)) throw new TypeError('places must be an array');
    var collectionId = 'collection-default';
    var categories = DEFAULT_CATEGORIES.map(function (item) {
      return { id: item[0], name: item[1], scope: 'global', collectionId: null, icon: null, color: null };
    });
    var memberships = [];
    var seen = new Set();
    places.forEach(function (place) {
      if (!place || typeof place.id !== 'string' || !place.id || seen.has(place.id)) return;
      seen.add(place.id);
      var category = Array.isArray(place.categories) ? place.categories.find(function (id) {
        return categories.some(function (c) { return c.id === id; });
      }) : null;
      memberships.push({ placeId: place.id, collectionId: collectionId, categoryId: category || null });
    });
    return {
      schemaVersion: 2,
      collections: [{ id: collectionId, name: 'Mes lieux', description: '', createdAt: null, updatedAt: null }],
      categories: categories,
      memberships: memberships,
      knownPlaceIds: Array.from(seen)
    };
  }
  function validate(data) {
    if (!data || data.schemaVersion !== 2 || !Array.isArray(data.collections) ||
        !Array.isArray(data.categories) || !Array.isArray(data.memberships)) return false;
    var ids = function (arr) { return new Set(arr.map(function (x) { return x && x.id; })); };
    var collections = ids(data.collections), categories = ids(data.categories);
    if (collections.size !== data.collections.length || categories.size !== data.categories.length ||
        collections.has(null) || categories.has(null) || collections.has(undefined) || categories.has(undefined)) return false;
    if (!data.categories.every(function (c) {
      return c && (c.scope === 'global' ? c.collectionId === null :
        c.scope === 'collection' && collections.has(c.collectionId));
    })) return false;
    if (data.knownPlaceIds !== undefined && (!Array.isArray(data.knownPlaceIds) ||
      data.knownPlaceIds.some(function(id){return typeof id!=='string' || !id;}) ||
      new Set(data.knownPlaceIds).size!==data.knownPlaceIds.length)) return false;
    var pairs = new Set();
    return data.memberships.every(function (m) {
      if (!m || typeof m.placeId !== 'string' || !m.placeId || !collections.has(m.collectionId) ||
          (m.categoryId !== null && !categories.has(m.categoryId))) return false;
      var c = data.categories.find(function (x) { return x.id === m.categoryId; });
      if (c && c.scope === 'collection' && c.collectionId !== m.collectionId) return false;
      var key = JSON.stringify([m.placeId, m.collectionId]);
      if (pairs.has(key)) return false;
      pairs.add(key);
      return true;
    });
  }
  function loadOrMigrate(storage, legacyPlaces) {
    var key = 'nearby-collections-v2', raw = storage.getItem(key);
    if (raw !== null) {
      var existing = JSON.parse(raw);
      if (!validate(existing)) throw new Error('Invalid v2 collections: original data preserved');
      if (!Array.isArray(existing.knownPlaceIds)) {
        existing.knownPlaceIds = Array.from(new Set(legacyPlaces.filter(function(p){return p && typeof p.id==='string' && p.id;}).map(function(p){return p.id;})
          .concat(existing.memberships.map(function(m){return m.placeId;}))));
        storage.setItem(key, JSON.stringify(existing));
      }
      return existing;
    }
    var next = initial(legacyPlaces);
    if (!validate(next)) throw new Error('Invalid migration');
    storage.setItem(key, JSON.stringify(next));
    return next;
  }
  function reconcile(data, places) {
    if (!validate(data) || !Array.isArray(places)) throw new Error('Invalid reconciliation');
    if (!Array.isArray(data.knownPlaceIds)) data.knownPlaceIds = Array.from(new Set(data.memberships.map(function(m){return m.placeId;})));
    var known = new Set(data.knownPlaceIds);
    var additions = 0;
    places.forEach(function(p){
      if (!p || typeof p.id !== 'string' || !p.id || known.has(p.id)) return;
      var legacy = Array.isArray(p.categories) ? p.categories.find(function(id){return data.categories.some(function(c){return c.id===id && c.scope==='global';});}) : null;
      data.memberships.push({placeId:p.id,collectionId:'collection-default',categoryId:legacy||null});
      known.add(p.id); data.knownPlaceIds.push(p.id); additions++;
    });
    return additions;
  }
  function merge(current, incoming) {
    if (!validate(current) || !validate(incoming)) throw new Error('Invalid collections backup');
    function mergeById(first, second){var out = new Map(); first.forEach(function(x){out.set(x.id,x);}); second.forEach(function(x){out.set(x.id,x);}); return Array.from(out.values());}
    var memberships = new Map();
    incoming.memberships.concat(current.memberships).forEach(function(m){
      memberships.set(JSON.stringify([m.collectionId,m.placeId]),m);
    });
    var knownPlaceIds = Array.from(new Set([].concat(incoming.knownPlaceIds || incoming.memberships.map(function(m){return m.placeId;}),current.knownPlaceIds || current.memberships.map(function(m){return m.placeId;}))));
    var result = {schemaVersion:2,collections:mergeById(incoming.collections,current.collections),
      categories:mergeById(incoming.categories,current.categories),memberships:Array.from(memberships.values()),knownPlaceIds:knownPlaceIds};
    if (!validate(result)) throw new Error('Incompatible collections backup');
    return result;
  }
  function save(storage, data) {
    if (!validate(data)) throw new Error('Invalid collections model');
    storage.setItem('nearby-collections-v2', JSON.stringify(data));
  }
  function createCollection(data, name, description) {
    var value = String(name || '').trim();
    if (!value) throw new Error('Collection name required');
    var id = identifier('collection-');
    data.collections.push({ id: id, name: value, description: String(description || ''), createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  }
  function createCategory(data, name, collectionId) {
    var value = String(name || '').trim();
    if (!value) throw new Error('Category name required');
    if (collectionId != null && !data.collections.some(function (c) { return c.id === collectionId; }))
      throw new Error('Unknown collection');
    var id = identifier('category-');
    data.categories.push({ id: id, name: value, scope: collectionId == null ? 'global' : 'collection',
      collectionId: collectionId == null ? null : collectionId, icon: null, color: null });
    return id;
  }
  function attach(data, placeId, collectionId, categoryId) {
    if (!data.collections.some(function (c) { return c.id === collectionId; })) throw new Error('Unknown collection');
    if (typeof placeId !== 'string' || !placeId) throw new Error('Invalid place');
    var category = data.categories.find(function (c) { return c.id === categoryId; });
    if (categoryId != null && (!category || (category.scope === 'collection' && category.collectionId !== collectionId)))
      throw new Error('Category unavailable in collection');
    var existing = data.memberships.find(function (m) { return m.placeId === placeId && m.collectionId === collectionId; });
    if (existing) existing.categoryId = categoryId == null ? null : categoryId;
    else data.memberships.push({ placeId: placeId, collectionId: collectionId, categoryId: categoryId == null ? null : categoryId });
  }
  return { initial: initial, validate: validate, loadOrMigrate: loadOrMigrate, reconcile: reconcile, merge: merge, save: save,
    createCollection: createCollection, createCategory: createCategory, attach: attach };
});
