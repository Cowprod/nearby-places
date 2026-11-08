(function () {
  'use strict';
  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function readPlaces() {
    try {
      var value = JSON.parse(localStorage.getItem('nearby-places-v1') || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { throw new Error('Liste de lieux illisible : migration interrompue'); }
  }
  function init() {
    var api = window.NearbyCollections;
    if (!api) return;
    var anchor = document.querySelector('h1');
    if (!anchor) return;
    var panel = el('section', null, 'collections-panel');
    panel.id = 'collections-panel';
    var title = el('h2', 'Collections');
    var notice = el('p', 'Tous les lieux sont surveillés, quelle que soit leur collection.', 'muted');
    var list = el('div');
    var controls = el('div', null, 'collections-controls');
    var newName = el('input');
    newName.placeholder = 'Nouvelle collection';
    newName.setAttribute('aria-label', 'Nom de la collection');
    var add = el('button', 'Créer');
    var feedback = el('p', '', 'muted');
    feedback.setAttribute('role', 'status');
    controls.append(newName, add);
    panel.append(title, notice, list, controls, feedback);
    anchor.insertAdjacentElement('afterend', panel);
    var state;
    try { state = api.loadOrMigrate(localStorage, readPlaces()); }
    catch (error) { feedback.textContent = error.message; controls.hidden = true; return; }
    function persist() { api.save(localStorage, state); render(); }
    function render() {
      list.replaceChildren();
      var places = readPlaces();
      state.collections.forEach(function (collection) {
        var card = el('article', null, 'collection-card');
        var name = el('strong', collection.name);
        var count = state.memberships.filter(function (m) {
          return m.collectionId === collection.id && places.some(function (p) { return p && p.id === m.placeId; });
        }).length;
        var counter = el('span', count + ' lieu(x)', 'muted');
        var details = el('details');
        var summary = el('summary', 'Gérer');
        var edit = el('input');
        edit.value = collection.name;
        edit.setAttribute('aria-label', 'Renommer ' + collection.name);
        var rename = el('button', 'Renommer');
        rename.onclick = function () {
          if (!edit.value.trim()) { feedback.textContent = 'Nom obligatoire'; return; }
          collection.name = edit.value.trim();
          collection.updatedAt = Date.now();
          persist();
        };
        var categoryTitle = el('h3', 'Catégories spécifiques');
        var categoryList = el('ul');
        state.categories.filter(function (c) { return c.collectionId === collection.id; }).forEach(function (c) {
          categoryList.append(el('li', c.name));
        });
        var categoryName = el('input');
        categoryName.placeholder = 'Nouvelle catégorie';
        categoryName.setAttribute('aria-label', 'Nouvelle catégorie pour ' + collection.name);
        var addCategory = el('button', 'Ajouter une catégorie');
        addCategory.onclick = function () {
          try { api.createCategory(state, categoryName.value, collection.id); persist(); feedback.textContent = 'Catégorie créée'; }
          catch (error) { feedback.textContent = error.message; }
        };
        var placeList = el('ul');
        state.memberships.filter(function (m) { return m.collectionId === collection.id; }).forEach(function (m) {
          var place = places.find(function (p) { return p && p.id === m.placeId; });
          if (place) placeList.append(el('li', place.name || m.placeId));
        });
        details.append(summary, edit, rename, categoryTitle, categoryList, categoryName, addCategory, el('h3', 'Lieux'), placeList);
        card.append(name, counter, details);
        list.append(card);
      });
    }
    add.onclick = function () {
      try { api.createCollection(state, newName.value); newName.value = ''; persist(); feedback.textContent = 'Collection créée'; }
      catch (error) { feedback.textContent = error.message; }
    };
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
