(function () {
  'use strict';
  function ready() {
    var panel = document.getElementById('collections-panel');
    var places = document.getElementById('places');
    if (!panel || !places) return;
    var main = document.createElement('main');
    main.id = 'nearby-tabs-content';
    var nav = document.createElement('nav');
    nav.className = 'nearby-tabs';
    nav.setAttribute('aria-label', 'Navigation principale');
    var tabs = [
      {id:'collections',label:'Collections',nodes:[panel]},
      {id:'add',label:'Ajouter',nodes:[]},
      {id:'settings',label:'Réglages',nodes:[]}
    ];
    function collect(start, end, target) {
      var current = start;
      while (current && current !== end) {
        var next = current.nextElementSibling;
        target.push(current);
        current = next;
      }
    }
    var headings = Array.from(document.querySelectorAll('body > h2'));
    var byTitle = function (label) { return headings.find(function (h) { return h.textContent.trim() === label; }); };
    var placesTitle = byTitle('Mes lieux');
    var proximityTitle = byTitle('Notifications de proximité (expérimental)');
    var importTitle = byTitle('Importer depuis Apple Plans / Google Maps / ChatGPT');
    var backupTitle = byTitle('Sauvegarde des lieux personnels');
    var addTitle = byTitle('Ajouter un lieu');
    if (!placesTitle || !proximityTitle || !importTitle || !backupTitle || !addTitle) return;
    // Legacy catalogue is retained in the DOM for app.js, but is not shown as a second list.
    var legacyPlaces = [];
    collect(placesTitle,proximityTitle,legacyPlaces);
    var legacyContainer = document.createElement('div');
    legacyContainer.id = 'nearby-legacy-places';
    legacyContainer.hidden = true;
    legacyPlaces.forEach(function(node){legacyContainer.append(node);});
    tabs[2].nodes.push(legacyContainer);
    collect(importTitle,backupTitle,tabs[1].nodes);
    collect(addTitle,document.querySelector('body > script'),tabs[1].nodes);
    collect(proximityTitle,importTitle,tabs[2].nodes);
    collect(backupTitle,addTitle,tabs[2].nodes);
    var bulk = document.getElementById('collections-bulk');
    if (bulk) tabs[2].nodes.push(bulk);
    var globalCategories = document.getElementById('collections-global-categories');
    if (globalCategories) tabs[2].nodes.push(globalCategories);
    var status = document.getElementById('status');
    if (status) {
      status.insertAdjacentElement('afterend',nav);
      tabs[2].nodes.unshift(status);
    }
    nav.insertAdjacentElement('afterend',main);
    tabs.forEach(function (tab) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = tab.label;
      button.dataset.tab = tab.id;
      button.setAttribute('aria-controls','nearby-tab-'+tab.id);
      button.setAttribute('aria-selected','false');
      var section = document.createElement('section');
      section.id = 'nearby-tab-'+tab.id;
      section.className = 'nearby-tab-page';
      section.setAttribute('aria-label',tab.label);
      tab.nodes.forEach(function (node) { section.append(node); });
      main.append(section);
      nav.append(button);
      button.onclick = function () { activate(tab.id); };
    });
    function activate(id) {
      if (!tabs.some(function (tab) { return tab.id === id; })) return;
      tabs.forEach(function (tab) {
        var active = tab.id === id;
        document.getElementById('nearby-tab-'+tab.id).hidden = !active;
        var button = nav.querySelector('[data-tab="'+tab.id+'"]');
        button.setAttribute('aria-current',active?'page':'false');
        button.setAttribute('aria-selected',active?'true':'false');
      });
      try { sessionStorage.setItem('nearby-active-tab',id); } catch (_) {}
    }
    var remembered;
    try { remembered = sessionStorage.getItem('nearby-active-tab'); } catch (_) {}
    activate(tabs.some(function (t) { return t.id === remembered; }) ? remembered : 'collections');
    window.NearbyNavigation = {show:activate};
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready);
  else ready();
})();
