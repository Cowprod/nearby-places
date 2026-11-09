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
    panel.append(title, notice, controls, list, detailView, feedback, bulk, globals);
    var selectedCollectionId = null;
    var highlightedPlaceId = null, highlightTimer = null;
    anchor.insertAdjacentElement('afterend', panel);
    var state;
    // Visual state only: no change to persisted collections or the legacy catalogue.
    var expandedCollections = new Set();
    try { state = api.loadOrMigrate(localStorage, readPlaces()); }
    catch (error) { feedback.textContent = error.message; controls.hidden = true; return; }
    function persist() { api.save(localStorage, state); render(); if(typeof window.dispatchEvent==='function' && typeof Event==='function')window.dispatchEvent(new Event('nearby-collections-changed')); }
    function syncPhotoAlbums(){if(window.NearbyPhotos&&window.NearbyPlacePhotos){window.NearbyPlacePhotos.syncMemberships(state).catch(function(error){feedback.textContent='Collections enregistrées, mais albums Photos non synchronisés : '+error.message;});}}
    function refresh() {
      try { state=api.loadOrMigrate(localStorage,readPlaces()); if(api.reconcile(state,readPlaces())) api.save(localStorage,state); render(); }
      catch(error){feedback.textContent='Actualisation impossible : '+error.message;}
    }
    window.addEventListener('nearby-places-changed',refresh);
    function openNotificationPlace(placeId){
      if(typeof placeId!=='string'||!placeId)return;
      refresh();
      var matches=state.memberships.filter(function(m){return m.placeId===placeId&&m.collectionId!=='collection-default';});
      if(!matches.length){feedback.textContent='Lieu de la notification introuvable dans les collections';return;}
      var target=matches[0];
      selectedCollectionId=target.collectionId;
      highlightedPlaceId=placeId;
      if(highlightTimer)clearTimeout(highlightTimer);
      if(window.NearbyNavigation)window.NearbyNavigation.show('collections');
      render();
      var row=Array.from(detailView.querySelectorAll('[data-place-id]')).find(function(node){return node.dataset.placeId===placeId;});
      if(row){row.scrollIntoView({behavior:'smooth',block:'center'});}
      highlightTimer=setTimeout(function(){highlightedPlaceId=null;var marked=detailView.querySelector('.collection-place-notification-highlight');if(marked)marked.classList.remove('collection-place-notification-highlight');},15000);
    }
    window.addEventListener('nearby-notification-open',function(event){openNotificationPlace(event.detail&&event.detail.placeId);});
    try{
      var pending=JSON.parse(sessionStorage.getItem('nearby-notification-target')||'null');
      sessionStorage.removeItem('nearby-notification-target');
      if(pending&&Date.now()-pending.at<60000)openNotificationPlace(pending.placeId);
    }catch(_){}

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
        syncPhotoAlbums();
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
        if(collection.id==='collection-default' && selectedCollectionId!==collection.id)return;
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
          try { persist(); feedback.textContent = 'Fiche enregistrée'; if(window.NearbyPhotos&&window.NearbyPlacePhotos&&before.name!==collection.name){window.NearbyPlacePhotos.renameCollection(collection.id,collection.name).catch(function(error){feedback.textContent='Collection enregistrée ; renommage de l’album Photos impossible : '+error.message;});} }
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
        var categoryGroups = new Map();
        state.memberships.filter(function(m){return m.collectionId===collection.id;}).forEach(function(m){
          var place=places.find(function(p){return p && p.id===m.placeId;});
          if(!place)return;
          var category=state.categories.find(function(c){return c.id===m.categoryId;});
          var group=place.visited?'Lieux désactivés':(category?category.name:'Sans catégorie');
          if(!categoryGroups.has(group))categoryGroups.set(group,[]);
          categoryGroups.get(group).push({membership:m,place:place});
        });
        Array.from(categoryGroups.keys()).sort(function(a,b){
          if(a==='Sans catégorie')return -1;
          if(b==='Sans catégorie')return 1;
          if(a==='Lieux désactivés')return 1;
          if(b==='Lieux désactivés')return -1;
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
            var item=el('li',null,'collection-place-item'); item.dataset.placeId=place.id; if(highlightedPlaceId===place.id)item.classList.add('collection-place-notification-highlight');item.addEventListener('click',function(){if(item.classList.contains('collection-place-notification-highlight')){item.classList.remove('collection-place-notification-highlight');highlightedPlaceId=null;}}); item.append(el('span',place.name||m.placeId));
            if(place.comment){item.append(el('small',place.comment,'muted collection-place-comment'));}
            if(place.visited){
              var originalCategory=state.categories.find(function(c){return c.id===m.categoryId;});
              item.append(el('small',originalCategory?originalCategory.name:'Sans catégorie','muted collection-original-category'));
              if(Number.isFinite(Number(place.visitedAt))&&Number(place.visitedAt)>0){item.append(el('small','Désactivé le '+new Date(Number(place.visitedAt)).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}),'muted collection-visited-date'));}
            }
            var editor=el('div',null,'collection-place-editor');
            editor.hidden=true;
            var nameInput=el('input');nameInput.value=place.name||'';nameInput.setAttribute('aria-label','Nom du lieu');
            var commentInput=el('textarea');commentInput.value=place.comment||'';commentInput.rows=3;commentInput.setAttribute('aria-label','Commentaire du lieu');
            var categorySelect=el('select');categorySelect.setAttribute('aria-label','Catégorie de '+(place.name||m.placeId));
            var none=el('option','Sans catégorie');none.value='';categorySelect.append(none);
            state.categories.filter(function(c){return c.scope==='global'||c.collectionId===collection.id;}).forEach(function(c){var option=el('option',c.name);option.value=c.id;categorySelect.append(option);});
            categorySelect.value=m.categoryId||'';
            var saveEdit=el('button','Enregistrer');
            var cancelEdit=el('button','Annuler');
            cancelEdit.onclick=function(){editor.hidden=true;};
            saveEdit.onclick=function(){
              var name=nameInput.value.trim(),categoryId=categorySelect.value||null;
              if(!name){feedback.textContent='Nom obligatoire';return;}
              var snapshot=JSON.stringify(state),beforeName=place.name,beforeComment=place.comment;
              try{
                api.attach(state,m.placeId,collection.id,categoryId);
                api.save(localStorage,state);
                window.NearbyPlaceActions.updatePlace(place.id,name,commentInput.value);
                syncPhotoAlbums();
                editor.hidden=true;
                feedback.textContent='';
              }catch(error){
                state=JSON.parse(snapshot);
                try{api.save(localStorage,state);}catch(_){}
                place.name=beforeName;place.comment=beforeComment;
                feedback.textContent='Modification impossible : '+error.message;
              }
            };
            editor.append(nameInput,commentInput,categorySelect,saveEdit,cancelEdit);
            var actions=el('div',null,'collection-place-actions');
            var visited=el('button',null,'collection-icon-button');
            visited.append(el('i',null,place.visited?'fa-solid fa-bell':'fa-solid fa-bell-slash'));
            visited.setAttribute('aria-label',place.visited?'Réactiver les alertes de '+place.name:'Marquer '+place.name+' comme visité');
            visited.onclick=function(){try{window.NearbyPlaceActions.setVisited(place.id,!place.visited);feedback.textContent='Statut du lieu actualisé';}catch(error){feedback.textContent=error.message;}};
            var trash=el('button',null,'collection-icon-button collection-danger');
            trash.append(el('i',null,'fa-solid fa-trash'));
            trash.setAttribute('aria-label','Supprimer '+place.name+' de cette collection');
            trash.onclick=function(){
              var others=state.memberships.filter(function(x){return x.placeId===place.id && x.collectionId!==collection.id;});
              var permanent=others.length===0;
              var message=permanent
                ? 'Supprimer définitivement « '+place.name+' » ?'
                : 'Retirer « '+place.name+' » de cette collection ? Le lieu restera dans les autres collections.';
              function performDelete(){
                var previous=JSON.stringify(state);
                try{
                  state.memberships=state.memberships.filter(function(x){return !(x.placeId===m.placeId && x.collectionId===collection.id);});
                  // Save membership changes before deleting the underlying place.
                  api.save(localStorage,state);
                  if(permanent){
                    if(!window.NearbyPlaceActions || !window.NearbyPlaceActions.deletePlace)throw Error('Suppression indisponible');
                    window.NearbyPlaceActions.deletePlace(place.id);
                  }
                  persist();
                  feedback.textContent=permanent?'Lieu supprimé définitivement':'Lieu retiré de cette collection';
                }catch(error){
                  state=JSON.parse(previous);
                  try{api.save(localStorage,state);}catch(_){}
                  feedback.textContent='Suppression impossible : '+error.message;
                }
              }
              if(window.bootbox && typeof window.bootbox.confirm==='function'){
                window.bootbox.confirm({
                  title:'Confirmer la suppression',
                  message:message,
                  centerVertical:true,
                  buttons:{cancel:{label:'Annuler',className:'btn-secondary'},confirm:{label:'Supprimer',className:'btn-danger'}},
                  callback:function(confirmed){if(confirmed)performDelete();}
                });
              }else if(window.confirm(message)){performDelete();}
            };
            var directions=el('a',null,'collection-icon-button');
            directions.href='https://maps.apple.com/?daddr='+encodeURIComponent(place.latitude+','+place.longitude)+'&dirflg=w&q='+encodeURIComponent(place.name||'Lieu');
            directions.target='_blank';directions.rel='noopener noreferrer';
            directions.setAttribute('aria-label','Plans : itinéraire à pied vers '+place.name);
            directions.title='Plans';
            directions.append(el('i',null,'fa-solid fa-person-walking'));
            var transit=el('a',null,'collection-icon-button');
            transit.href='https://maps.apple.com/?daddr='+encodeURIComponent(place.latitude+','+place.longitude)+'&dirflg=r&q='+encodeURIComponent(place.name||'Lieu');
            transit.target='_blank';transit.rel='noopener noreferrer';
            transit.setAttribute('aria-label','Plans : itinéraire en transports en commun vers '+place.name);
            transit.title='Transports en commun';
            transit.append(el('i',null,'fa-solid fa-train-subway'));
            var editPlace=el('button',null,'collection-icon-button');
            editPlace.setAttribute('aria-label','Modifier '+place.name);
            editPlace.title='Modifier le lieu';
            editPlace.append(el('i',null,'fa-solid fa-pen'));
            editPlace.onclick=function(){editor.hidden=!editor.hidden;};
            var cameraPhoto=el('button',null,'collection-icon-button');cameraPhoto.type='button';cameraPhoto.title='Prendre une photo';cameraPhoto.setAttribute('aria-label','Prendre une photo de '+place.name);cameraPhoto.append(el('i',null,'fa-solid fa-camera'));cameraPhoto.onclick=function(){if(window.NearbyPlacePhotos)window.NearbyPlacePhotos.capture(place);};
            var albumPhoto=el('button',null,'collection-icon-button');albumPhoto.type='button';albumPhoto.title='Album du lieu';albumPhoto.setAttribute('aria-label','Album photo de '+place.name);albumPhoto.append(el('i',null,'fa-solid fa-images'));albumPhoto.onclick=function(){if(window.NearbyPlacePhotos)window.NearbyPlacePhotos.open(place,false,collection.name);};
            actions.append(directions,transit,cameraPhoto,albumPhoto,editPlace,visited,trash);
            item.append(actions,editor);placeList.append(item);
          }
          });
        });
        details.append(summary, edit, description, rename, categoryTitle, categoryList, categoryName, addCategory);
        if(collection.id!=='collection-default'){
          var deleteButton=el('button','Supprimer la collection');
          deleteButton.onclick=function(){
            function performCollectionDelete(){
            state.memberships=state.memberships.filter(function(m){return m.collectionId!==collection.id;});
            state.categories=state.categories.filter(function(c){return c.collectionId!==collection.id;});
            state.collections=state.collections.filter(function(c){return c.id!==collection.id;});
            persist();
            }
            if(window.bootbox && typeof window.bootbox.confirm==='function')window.bootbox.confirm({title:'Supprimer la collection',message:'Supprimer « '+collection.name+' » et ses catégories spécifiques ? Les lieux resteront enregistrés.',buttons:{cancel:{label:'Annuler',className:'btn-secondary'},confirm:{label:'Supprimer',className:'btn-danger'}},callback:function(ok){if(ok)performCollectionDelete();}});
            else if(window.confirm('Supprimer cette collection ? Les lieux seront conservés.'))performCollectionDelete();
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
          card.append(el('h3', 'Lieux'), placeList);
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
    // Retry album reconciliation after Photos permission changes or an offline session.
    // The native layer compares membership and repairs missed renames without copying photos.
    if(typeof document.addEventListener==='function'){
      document.addEventListener('deviceready',function(){refresh();syncPhotoAlbums();},false);
      document.addEventListener('resume',function(){refresh();syncPhotoAlbums();},false);
    }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
