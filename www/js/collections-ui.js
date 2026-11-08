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
    var globals = el('section');
    var controls = el('div', null, 'collections-controls');
    var newName = el('input');
    newName.placeholder = 'Nouvelle collection';
    newName.setAttribute('aria-label', 'Nom de la collection');
    var add = el('button', 'Créer');
    var feedback = el('p', '', 'muted');
    feedback.setAttribute('role', 'status');
    controls.append(newName, add);
    panel.append(title, notice, globals, list, controls, feedback);
    anchor.insertAdjacentElement('afterend', panel);
    var state;
    try { state = api.loadOrMigrate(localStorage, readPlaces()); }
    catch (error) { feedback.textContent = error.message; controls.hidden = true; return; }
    function persist() { api.save(localStorage, state); render(); }
    function render() {
      list.replaceChildren();
      globals.replaceChildren();
      var places = readPlaces();
      var globalTitle = el('h3', 'Catégories globales');
      var globalList = el('p', state.categories.filter(function(c){return c.scope === 'global';}).map(function(c){return c.name;}).join(' · '));
      var globalInput = el('input'); globalInput.placeholder = 'Nouvelle catégorie globale'; globalInput.setAttribute('aria-label','Nouvelle catégorie globale');
      var globalButton = el('button','Ajouter');
      globalButton.onclick = function(){try{api.createCategory(state,globalInput.value,null);persist();feedback.textContent='Catégorie globale créée';}catch(error){feedback.textContent=error.message;}};
      globals.append(globalTitle,globalList,globalInput,globalButton);
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
        var assigned = new Set(state.memberships.filter(function(m){return m.collectionId===collection.id;}).map(function(m){return m.placeId;}));
        var assignSelect = el('select'); assignSelect.setAttribute('aria-label','Ajouter un lieu à '+collection.name);
        var placeholder = el('option','Choisir un lieu'); placeholder.value=''; assignSelect.append(placeholder);
        places.filter(function(p){return p && typeof p.id==='string' && p.id && !assigned.has(p.id);}).forEach(function(p){var option=el('option',p.name||p.id);option.value=p.id;assignSelect.append(option);});
        var assignButton=el('button','Affecter le lieu');
        assignButton.onclick=function(){if(!assignSelect.value)return;try{api.attach(state,assignSelect.value,collection.id,null);persist();feedback.textContent='Lieu affecté';}catch(error){feedback.textContent=error.message;}};
        state.memberships.filter(function (m) { return m.collectionId === collection.id; }).forEach(function (m) {
          var place = places.find(function (p) { return p && p.id === m.placeId; });
          if (place) {
            var item=el('li'); item.append(el('span',place.name||m.placeId));
            var categorySelect=el('select');categorySelect.setAttribute('aria-label','Catégorie de '+(place.name||m.placeId));
            var none=el('option','Sans catégorie');none.value='';categorySelect.append(none);
            state.categories.filter(function(c){return c.scope==='global'||c.collectionId===collection.id;}).forEach(function(c){var option=el('option',c.name);option.value=c.id;categorySelect.append(option);});
            categorySelect.value=m.categoryId||'';
            categorySelect.onchange=function(){try{api.attach(state,m.placeId,collection.id,categorySelect.value||null);persist();}catch(error){feedback.textContent=error.message;}};
            var unlink=el('button','Retirer de la collection');
            unlink.onclick=function(){state.memberships=state.memberships.filter(function(x){return x!==m;});persist();};
            item.append(categorySelect,unlink);placeList.append(item);
          }
        });
        details.append(summary, edit, rename, categoryTitle, categoryList, categoryName, addCategory, el('h3', 'Lieux'), placeList, assignSelect, assignButton);
        if(collection.id!=='collection-default'){
          var deleteButton=el('button','Supprimer la collection');
          deleteButton.onclick=function(){
            if(!window.confirm('Supprimer cette collection et ses catégories locales ? Les lieux resteront enregistrés.'))return;
            state.memberships=state.memberships.filter(function(m){return m.collectionId!==collection.id;});
            state.categories=state.categories.filter(function(c){return c.collectionId!==collection.id;});
            state.collections=state.collections.filter(function(c){return c.id!==collection.id;});
            persist();
          };
          details.append(deleteButton);
        }
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
