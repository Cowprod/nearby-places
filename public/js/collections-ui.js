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
    list.className = 'collection-list';
    var detailView = el('section', null, 'collection-detail');
    detailView.hidden = true;
    var backButton = el('button', '← Collections', 'collection-back');
    backButton.type = 'button';
    backButton.onclick = function () { selectedCollectionId = null; render(); };
    detailView.append(backButton);
    var globals = el('section', null, 'collections-global-categories');
    globals.id = 'collections-global-categories';
    panel.append(globals);
    var controls = el('div', null, 'collections-controls');
    var newName = el('input');
    newName.placeholder = 'Nouvelle collection';
    newName.setAttribute('aria-label', 'Nom de la collection');
    var add = el('button', 'Créer');
    var bulk = el('section', null, 'collections-bulk');
    bulk.id = 'collections-bulk';
    var bulkTitle = el('h3', 'Affectation initiale des lieux');
    var bulkSelect = el('select');
    bulkSelect.setAttribute('aria-label', 'Collection de destination');
    var bulkButton = el('button', 'Affecter tous les lieux sans collection');
    var bulkInfo = el('p', '', 'muted');
    bulk.append(bulkTitle, bulkSelect, bulkButton, bulkInfo);
    var feedback = el('p', '', 'muted');
    feedback.setAttribute('role', 'status');
    controls.append(newName, add);
    panel.append(title, notice, controls, list, detailView, feedback, bulk);
    var selectedCollectionId = null;
    anchor.insertAdjacentElement('afterend', panel);
    var state;
    // Visual state only: no change to persisted collections or the legacy catalogue.
    var expandedCollections = new Set();
    try { state = api.loadOrMigrate(localStorage, readPlaces()); }
    catch (error) { feedback.textContent = error.message; controls.hidden = true; return; }
    function persist() { api.save(localStorage, state); render(); if(typeof window.dispatchEvent==='function' && typeof Event==='function')window.dispatchEvent(new Event('nearby-collections-changed')); }
    function refresh() {
      try { state=api.loadOrMigrate(localStorage,readPlaces()); if(api.reconcile(state,readPlaces())) api.save(localStorage,state); render(); }
      catch(error){feedback.textContent='Actualisation impossible : '+error.message;}
    }
    window.addEventListener('nearby-places-changed',refresh);
    bulkButton.onclick = function () {
      var destination = bulkSelect.value;
      if (!destination || destination === 'collection-default') { bulkInfo.textContent = 'Choisir une collection de destination'; return; }
      var places = readPlaces();
      var ids = new Set(state.memberships.filter(function (m) { return m.collectionId !== 'collection-default'; }).map(function (m) { return m.placeId; }));
      var missing = places.filter(function (p) { return p && typeof p.id === 'string' && p.id && !ids.has(p.id); });
      if (!missing.length) { bulkInfo.textContent = 'Aucun lieu sans collection'; return; }
      var snapshot = JSON.stringify(state);
      try {
        missing.forEach(function (p) { api.attach(state, p.id, destination, null); });
        persist();
        bulkInfo.textContent = missing.length + ' lieu(x) affecté(s), sans suppression ni duplication';
      } catch (error) {
        state = JSON.parse(snapshot);
        bulkInfo.textContent = 'Affectation annulée : ' + error.message;
      }
    };
    function render() {
      var selectedDestination = bulkSelect.value;
      bulkSelect.replaceChildren();
      var choose = el('option', 'Choisir une collection'); choose.value = ''; bulkSelect.append(choose);
      state.collections.filter(function (c) { return c.id !== 'collection-default'; }).forEach(function (c) {
        var option = el('option', c.name); option.value = c.id; bulkSelect.append(option);
      });
      bulkSelect.value = state.collections.some(function (c) { return c.id === selectedDestination; }) ? selectedDestination : '';

      // Rebuilding the cards must not close the collection being edited.
      Array.from(list.querySelectorAll('details[data-collection-id]')).concat(Array.from(detailView.querySelectorAll('details[data-collection-id]'))).forEach(function (node) {
        if (node.open) expandedCollections.add(node.dataset.collectionId);
        else expandedCollections.delete(node.dataset.collectionId);
      });
      list.replaceChildren();
      detailView.replaceChildren();
      detailView.append(backButton);
      detailView.hidden = !selectedCollectionId;
      list.hidden = !!selectedCollectionId;
      controls.hidden = !!selectedCollectionId;
      notice.hidden = !!selectedCollectionId;
      title.hidden = !!selectedCollectionId;
      globals.replaceChildren();
      var places = readPlaces();
      var globalTitle = el('h3', 'Catégories globales');
      var globalList = el('ul', null, 'global-category-list');
      state.categories.filter(function(c){return c.scope==='global';}).forEach(function(c){
        var row=el('li');
        var input=el('input'); input.value=c.name;input.setAttribute('aria-label','Nom de catégorie '+c.name);
        var saveButton=el('button',null,'collection-icon-button');saveButton.append(el('i',null,'fa-solid fa-check'));
        saveButton.setAttribute('aria-label','Enregistrer '+c.name);
        saveButton.onclick=function(){var name=input.value.trim();if(!name){feedback.textContent='Nom obligatoire';return;}var old=c.name;c.name=name;try{persist();feedback.textContent='Catégorie modifiée';}catch(error){c.name=old;feedback.textContent=error.message;}};
        row.append(input,saveButton);globalList.append(row);
      });
      var globalInput = el('input'); globalInput.placeholder = 'Nouvelle catégorie globale'; globalInput.setAttribute('aria-label','Nouvelle catégorie globale');
      var globalButton = el('button','Ajouter');
      globalButton.onclick = function(){try{api.createCategory(state,globalInput.value,null);persist();feedback.textContent='Catégorie globale créée';}catch(error){feedback.textContent=error.message;}};
      globals.append(globalTitle,globalList,globalInput,globalButton);
      state.collections.forEach(function (collection) {
        var card = el('article', null, 'collection-card');
        if (selectedCollectionId && selectedCollectionId !== collection.id) return;
        var name = el('strong', collection.name);
        var count = state.memberships.filter(function (m) {
          return m.collectionId === collection.id && places.some(function (p) { return p && p.id === m.placeId; });
        }).length;
        var counter = el('span', count + ' lieu(x)', 'muted');
        var details = el('details');
        details.dataset.collectionId = collection.id;
        details.open = expandedCollections.has(collection.id);
        var summary = el('summary', 'Modifier la fiche');
        var edit = el('input');
        edit.value = collection.name;
        edit.setAttribute('aria-label', 'Renommer ' + collection.name);
        var description = el('textarea');
        description.value = collection.description || '';
        description.rows = 3;
        description.maxLength = 1000;
        description.setAttribute('aria-label', 'Description de ' + collection.name);
        description.placeholder = 'Description de la collection (facultatif)';
        var rename = el('button', 'Enregistrer la fiche');
        rename.onclick = function () {
          if (!edit.value.trim()) { feedback.textContent = 'Nom obligatoire'; return; }
          var before = {name:collection.name, description:collection.description, updatedAt:collection.updatedAt};
          collection.name = edit.value.trim();
          collection.description = description.value.trim();
          collection.updatedAt = Date.now();
          try { persist(); feedback.textContent = 'Fiche enregistrée'; }
          catch (error) {
            collection.name = before.name;
            collection.description = before.description;
            collection.updatedAt = before.updatedAt;
            feedback.textContent = 'Enregistrement impossible : ' + error.message;
          }
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
        var placeList = el('ul', null, 'collection-place-list');
        var assigned = new Set(state.memberships.filter(function(m){return m.collectionId===collection.id;}).map(function(m){return m.placeId;}));
        var assignSelect = el('select'); assignSelect.setAttribute('aria-label','Ajouter un lieu à '+collection.name);
        var placeholder = el('option','Choisir un lieu'); placeholder.value=''; assignSelect.append(placeholder);
        places.filter(function(p){return p && typeof p.id==='string' && p.id && !assigned.has(p.id);}).forEach(function(p){var option=el('option',p.name||p.id);option.value=p.id;assignSelect.append(option);});
        var assignButton=el('button','Affecter le lieu');
        assignButton.onclick=function(){if(!assignSelect.value)return;try{api.attach(state,assignSelect.value,collection.id,null);persist();feedback.textContent='Lieu affecté';}catch(error){feedback.textContent=error.message;}};
        var categoryGroups = new Map();
        state.memberships.filter(function(m){return m.collectionId===collection.id;}).forEach(function(m){
          var place=places.find(function(p){return p && p.id===m.placeId;});
          if(!place)return;
          var category=state.categories.find(function(c){return c.id===m.categoryId;});
          var group=category?category.name:'Sans catégorie';
          if(!categoryGroups.has(group))categoryGroups.set(group,[]);
          categoryGroups.get(group).push({membership:m,place:place});
        });
        Array.from(categoryGroups.keys()).sort(function(a,b){
          if(a==='Sans catégorie')return -1;
          if(b==='Sans catégorie')return 1;
          return a.localeCompare(b,'fr');
        }).forEach(function(group){
          placeList.append(el('li',group,'collection-category-heading'));
          categoryGroups.get(group).sort(function(a,b){
            var visited=Number(!!a.place.visited)-Number(!!b.place.visited);
            return visited || String(a.place.name||'').localeCompare(String(b.place.name||''),'fr');
          }).forEach(function(entry){
          var m=entry.membership;
          var place = places.find(function (p) { return p && p.id === m.placeId; });
          if (place) {
            var item=el('li',null,'collection-place-item'); item.append(el('span',place.name||m.placeId));
            var categorySelect=el('select');categorySelect.setAttribute('aria-label','Catégorie de '+(place.name||m.placeId));
            var none=el('option','Sans catégorie');none.value='';categorySelect.append(none);
            state.categories.filter(function(c){return c.scope==='global'||c.collectionId===collection.id;}).forEach(function(c){var option=el('option',c.name);option.value=c.id;categorySelect.append(option);});
            categorySelect.value=m.categoryId||'';
            categorySelect.onchange=function(){try{api.attach(state,m.placeId,collection.id,categorySelect.value||null);persist();}catch(error){feedback.textContent=error.message;}};
            var actions=el('div',null,'collection-place-actions');
            var visited=el('button',null,'collection-icon-button');
            visited.append(el('i',null,place.visited?'fa-solid fa-bell':'fa-solid fa-bell-slash'));
            visited.setAttribute('aria-label',place.visited?'Réactiver les alertes de '+place.name:'Marquer '+place.name+' comme visité');
            visited.onclick=function(){try{window.NearbyPlaceActions.setVisited(place.id,!place.visited);feedback.textContent='Statut du lieu actualisé';}catch(error){feedback.textContent=error.message;}};
            var trash=el('button',null,'collection-icon-button collection-danger');
            trash.append(el('i',null,'fa-solid fa-trash'));
            trash.setAttribute('aria-label','Supprimer '+place.name+' de cette collection');
            trash.onclick=function(){
              var others=state.memberships.filter(function(x){return x.placeId===place.id && x.collectionId!==collection.id && x.collectionId!=='collection-default';});
              var permanent=others.length===0;
              if(!window.confirm(permanent?'Supprimer définitivement « '+place.name+' » ?':'Supprimer « '+place.name+' » de cette collection uniquement ?'))return;
              var previous=JSON.stringify(state);
              try{
                state.memberships=state.memberships.filter(function(x){return x!==m;});
                if(permanent){
                  state.memberships=state.memberships.filter(function(x){return x.placeId!==place.id;});
                  window.NearbyPlaceActions.deletePlace(place.id);
                }
                persist();
                feedback.textContent=permanent?'Lieu supprimé définitivement':'Lieu retiré de cette collection';
              }catch(error){state=JSON.parse(previous);feedback.textContent='Suppression impossible : '+error.message;}
            };
            actions.append(visited,trash);
            item.append(categorySelect,actions);placeList.append(item);
          }
          });
        });
        details.append(summary, edit, description, rename, categoryTitle, categoryList, categoryName, addCategory);
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
        if (selectedCollectionId === collection.id) {
          var header = el('div', null, 'collection-detail-heading');
          header.append(name, counter);
          var editButton = el('button', null, 'collection-edit');
          var icon = el('i', null, 'fa-solid fa-pen');
          icon.setAttribute('aria-hidden','true');
          editButton.append(icon);
          editButton.setAttribute('aria-label', 'Modifier ' + collection.name);
          editButton.title = 'Modifier le nom et la description';
          editButton.onclick = function () { details.open = !details.open; };
          header.append(editButton);
          card.append(header,details);
          var descriptionText = el('p', collection.description || '', 'muted');
          if (descriptionText.textContent) card.append(descriptionText);
          card.append(el('h3', 'Lieux'), placeList, assignSelect, assignButton);
          detailView.append(card);
        } else {
          var openButton = el('button', null, 'collection-open');
          openButton.type = 'button';
          var label = el('span', collection.name);
          var meta = el('small', count + ' lieu(x)', 'muted');
          openButton.append(label, meta);
          openButton.onclick = function () { selectedCollectionId = collection.id; render(); };
          card.append(openButton);
          list.append(card);
        }
      });
    }
    add.onclick = function () {
      try { api.createCollection(state, newName.value); newName.value = ''; persist(); feedback.textContent = 'Collection créée'; }
      catch (error) { feedback.textContent = error.message; }
    };
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
