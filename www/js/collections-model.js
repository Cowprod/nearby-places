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
      memberships: memberships
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
      return existing;
    }
    var next = initial(legacyPlaces);
    if (!validate(next)) throw new Error('Invalid migration');
    storage.setItem(key, JSON.stringify(next));
    return next;
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
  return { initial: initial, validate: validate, loadOrMigrate: loadOrMigrate, save: save,
    createCollection: createCollection, createCategory: createCategory, attach: attach };
});
