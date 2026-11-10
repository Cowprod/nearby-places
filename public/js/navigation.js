(function () {
  'use strict';
  function ready() {
    var panel = document.getElementById('collections-panel');
    var places = document.getElementById('places');
    if (!panel || !places) return;
    var main = document.createElement('main');
    main.id = 'nearby-tabs-content';
    var nav = document.createElement('nav');
    nav.className = 'nearby-tabs nav nav-tabs nav-fill';
    nav.setAttribute('role','tablist');
    nav.setAttribute('aria-label', 'Navigation principale');
    var tabs = [
      {id:'collections',label:'Collections',nodes:[panel]},
      {id:'map',label:'Carte',nodes:[]},
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
    tabs[3].nodes.push(legacyContainer);
    collect(importTitle,backupTitle,tabs[2].nodes);
    collect(addTitle,document.querySelector('body > script'),tabs[2].nodes);
    collect(proximityTitle,importTitle,tabs[3].nodes);
    collect(backupTitle,addTitle,tabs[3].nodes);
    var mapSection=document.createElement('div');
    mapSection.innerHTML='<h2>Carte des lieux proches</h2><div class="nearby-map-controls"><label for="map-radius">Rayon affiché (m)</label><input id="map-radius" type="number" min="100" max="50000" step="100" value="1000"></div><p id="map-status" class="muted" role="status">Ouvrez la carte pour vous localiser.</p><div id="nearby-map" aria-label="Carte des lieux enregistrés"></div><p id="map-tiles-status" class="muted" role="status"></p><div id="map-results" aria-live="polite"></div>';
    tabs[1].nodes.push(mapSection);
    var diagnostics=document.getElementById('proximity-diagnostics');
    if(diagnostics){
      var diagDetails=document.createElement('details');
      diagDetails.className='nearby-diagnostics';
      var diagSummary=document.createElement('summary');
      diagSummary.textContent='Journal technique';
      diagnostics.parentNode.insertBefore(diagDetails,diagnostics);
      diagDetails.append(diagSummary,diagnostics);
      tabs[3].nodes.push(diagDetails);
    }
    var bulk = document.getElementById('collections-bulk');
    if (bulk) tabs[3].nodes.push(bulk);
    var globalCategories = document.getElementById('collections-global-categories');
    if (globalCategories) tabs[3].nodes.push(globalCategories);
    // Appearance is a UI preference only; never modify stored places.
    var appearance=document.createElement('section');
    appearance.className='nearby-appearance-settings';
    appearance.innerHTML='<h2>Apparence</h2><label for="nearby-appearance-mode">Thème</label><select id="nearby-appearance-mode" aria-label="Thème de l’application"><option value="auto">Automatique (iOS)</option><option value="light">Jour</option><option value="dark">Nuit</option></select>';
    tabs[3].nodes.unshift(appearance);
    var themeSelect=appearance.querySelector('select');
    var themeMedia=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
    function applyAppearance(){
      var mode=themeSelect.value;
      document.documentElement.dataset.theme=mode==='auto'?(themeMedia&&themeMedia.matches?'dark':'light'):mode;
      document.documentElement.style.colorScheme=document.documentElement.dataset.theme;
      var meta=document.querySelector('meta[name="color-scheme"]');
      if(meta)meta.content=document.documentElement.dataset.theme;
    }
    try{var savedTheme=localStorage.getItem('nearby-appearance-mode');if(['auto','light','dark'].includes(savedTheme))themeSelect.value=savedTheme;}catch(_){}
    themeSelect.onchange=function(){try{localStorage.setItem('nearby-appearance-mode',themeSelect.value);}catch(_){}applyAppearance();};
    if(themeMedia){if(themeMedia.addEventListener)themeMedia.addEventListener('change',applyAppearance);else if(themeMedia.addListener)themeMedia.addListener(applyAppearance);}
    applyAppearance();
    // The settings host is created here; navigator.js runs earlier so its
    // DOMContentLoaded handler cannot reliably find it.
    var status = document.getElementById('status');
    if (status) {
      status.insertAdjacentElement('afterend',nav);
      tabs[3].nodes.unshift(status);
    }
    nav.insertAdjacentElement('afterend',main);
    tabs.forEach(function (tab) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-link';
      button.setAttribute('role','tab');
      button.id='nearby-tab-button-'+tab.id;
      button.textContent = tab.label;
      button.dataset.tab = tab.id;
      button.setAttribute('aria-controls','nearby-tab-'+tab.id);
      button.setAttribute('aria-selected','false');
      var section = document.createElement('section');
      section.id = 'nearby-tab-'+tab.id;
      section.className = 'nearby-tab-page tab-pane';
      section.setAttribute('role','tabpanel');
      section.setAttribute('aria-labelledby',button.id);
      section.setAttribute('aria-label',tab.label);
      tab.nodes.forEach(function (node) { section.append(node); });
      main.append(section);
      nav.append(button);
      button.onclick = function () { activate(tab.id); };
    });
    // Settings nodes must be mounted before navigator inserts its section.
    if(window.NearbyNavigator&&window.NearbyNavigator.setup)window.NearbyNavigator.setup();
    function activate(id) {
      if (!tabs.some(function (tab) { return tab.id === id; })) return;
      tabs.forEach(function (tab) {
        var active = tab.id === id;
        document.getElementById('nearby-tab-'+tab.id).hidden = !active;
        var button = nav.querySelector('[data-tab="'+tab.id+'"]');
        button.classList.toggle('active',active);
        button.setAttribute('aria-current',active?'page':'false');
        button.setAttribute('aria-selected',active?'true':'false');
      });
      if(id==='map' && window.NearbyMap)window.NearbyMap.activate();
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
