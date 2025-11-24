// Basic helpers and state
document.getElementById('anio').textContent = new Date().getFullYear();
const svgContainer = document.getElementById('svgContainer');
const storeCards = document.getElementById('storeCards');
const storeSearch = document.getElementById('store-search');
const categoryFilters = document.getElementById('category-filters');
const coordsBubble = document.getElementById('coordsBubble');

let scale = 1;
function applyScale(){
    // Prefer applying scale to the SVG element itself so HTML overlay markers (in .pins-overlay)
    // remain in the container coordinate space and don't get double-scaled.
    const svg = svgContainer.querySelector('svg');
    if(svg){
        svg.style.transform = 'scale(' + scale + ')';
        // use top-left origin so pixel positions used for overlays match
        svg.style.transformOrigin = '0 0';
    }else{
        // fallback: if no svg yet, apply to container
        svgContainer.style.transform = 'scale(' + scale + ')';
        svgContainer.style.transformOrigin = '50% 50%';
    }
}
document.getElementById('zoomIn').addEventListener('click', ()=>{ scale = Math.min(2.4, scale + 0.15); applyScale(); });
document.getElementById('zoomOut').addEventListener('click', ()=>{ scale = Math.max(0.6, scale - 0.15); applyScale(); });
document.getElementById('resetZoom').addEventListener('click', ()=>{ scale = 1; applyScale(); });
// Also bind the external floating controls (if present) to the same actions
const zInOuter = document.getElementById('zoomInOuter'); if(zInOuter) zInOuter.addEventListener('click', ()=>{ scale = Math.min(2.4, scale + 0.15); applyScale(); });
const zOutOuter = document.getElementById('zoomOutOuter'); if(zOutOuter) zOutOuter.addEventListener('click', ()=>{ scale = Math.max(0.6, scale - 0.15); applyScale(); });
const zResetOuter = document.getElementById('resetZoomOuter'); if(zResetOuter) zResetOuter.addEventListener('click', ()=>{ scale = 1; applyScale(); });

// Locations of the two SVGs
const floors = { '1': 'mapa/planta_baja.svg', '2': 'mapa/piso_1.svg' };
const currentFloor = { val: '1' };

// External links to attach to some markers (assigned to the first few chosen markers)
const externalLinks = [
    'https://pascual-lucas.github.io/dyd-web-tpo1-segunda-entrega/',
    'https://fmessina-uade.github.io/TPO-LocalComercial-RaizUrbana/productos.html',
    'https://roxrodriguez.github.io/ProyectoDesarrolloWeb/',
    'https://pedromarino99.github.io/OpticaVeoVeo/'
];

// Manual mappings for specific chosen markers, keyed by floor then index.
// Floor '1' -> Planta Baja, Floor '2' -> Primer Piso (as defined in `floors`)
const manualMappings = {
    '1': { // Planta Baja — use PB codes for the five pins
        '0': { name: 'PB 001' },
        '1': { name: 'PB 002' },
        '2': { name: 'PB 003' },
        '3': { name: 'PB 004' },
        '4': { name: 'PB 005' }
    },
    '2': { // Primer Piso — use P1 codes for the five pins
        '0': { name: 'P1 101' },
        '1': { name: 'P1 102' },
        '2': { name: 'P1 103' },
        '3': { name: 'P1 104' },
        '4': { name: 'P1 105', externalUrl: 'https://valentinbrugnoliuade.github.io/Romi-Deco-Web/' }
    }
};

// Display name mappings (what appears as the main store name in cards/popups)
const displayNameMappings = {
    '1': { // Planta Baja original names
        '0': 'PUMA',
        '1': 'PRUNE',
        '2': 'LAS PEPAS',
        '3': 'SELU',
        '4': 'OPI'
    },
    '2': { // Primer Piso original names
        '0': 'GRANOS DORADOS',
        '1': 'RAÍZ URBANA',
        '2': 'AROMANZA',
        '3': 'OPTICA VEO VEO',
        '4': 'ROMI DECO'
    }
};

// Code mappings to show in the smaller meta line and popup (PB / P1)
const codeMappings = {
    '1': { '0':'PB 001','1':'PB 002','2':'PB 003','3':'PB 004','4':'PB 005' },
    '2': { '0':'P1 101','1':'P1 102','2':'P1 103','3':'P1 104','4':'P1 105' }
};

// storeMap: idx -> { area, pin, pinned, name, category, floor }
const storeMap = {};

async function loadFloor(f){
    currentFloor.val = String(f);
    svgContainer.innerHTML = ''; // clear

    // If an inline template for this floor exists (embedded in locales.html), use it first.
    const inlineTpl = document.getElementById('svg-inline-floor-' + String(f));
    if(inlineTpl){
        try{
            const frag = inlineTpl.content ? inlineTpl.content.cloneNode(true) : document.importNode(inlineTpl, true);
            // find svg inside fragment
            let svg = (frag.querySelector) ? frag.querySelector('svg') : (frag.getElementsByTagName ? frag.getElementsByTagName('svg')[0] : null);
            if(!svg){ svgContainer.innerHTML = '<div class="text-center text-muted">Mapa no disponible</div>'; return; }
            // ensure sizing attributes
            svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.maxHeight = '100%';
            // append the whole fragment (so defs/gradients remain available)
            svgContainer.appendChild(frag);
            // after appending, query the svg element (in case the fragment contained multiple nodes)
            const appendedSvg = svgContainer.querySelector('svg');
            processSVG(appendedSvg, f);
            // ensure current zoom is applied to the new svg
            applyScale();
            return;
        }catch(err){ console.warn('Failed to load inline SVG template', err); }
    }

    // Load the SVG for the requested floor (fetch from filesystem or server)
    // Fallback: fetch the SVG (used when serving via http)
    try{
        const res = await fetch(floors[f]);
        const txt = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(txt, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if(!svg){ svgContainer.innerHTML = '<div class="text-center text-muted">Mapa no disponible</div>'; return; }
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.style.maxHeight = '100%';
        svgContainer.appendChild(svg);
        processSVG(svg, f);
        applyScale();
    }catch(e){ console.error('Failed to load svg', e); svgContainer.innerHTML = '<div class="text-center text-muted">Error cargando plano</div>'; }
}

// Helper: attempt to load SVG via an <object> tag if fetch fails (helps when opening page via file://)
async function loadFloorWithFallback(f){
    try{
        await loadFloor(f);
    }catch(e){
        // If loadFloor failed unexpectedly, try object fallback
        console.warn('Primary SVG load failed, attempting <object> fallback', e);
        svgContainer.innerHTML = '';
        const obj = document.createElement('object');
        obj.type = 'image/svg+xml';
        obj.data = floors[f];
        obj.style.width = '100%';
        obj.style.height = '100%';
        // ensure object is visible while loading
        obj.innerHTML = '<div class="text-center text-muted">Cargando mapa...</div>';
        svgContainer.appendChild(obj);
        obj.addEventListener('load', ()=>{
            try{
                const svgDoc = obj.contentDocument || obj.getSVGDocument && obj.getSVGDocument();
                const svg = svgDoc ? svgDoc.querySelector('svg') : null;
                if(!svg){ svgContainer.innerHTML = '<div class="text-center text-muted">Mapa no disponible</div>'; return; }
                // clone into container so scripts can manipulate it reliably
                const clone = svg.cloneNode(true);
                clone.setAttribute('width','100%'); clone.setAttribute('height','100%'); clone.style.maxHeight='100%';
                svgContainer.innerHTML = '';
                svgContainer.appendChild(clone);
                processSVG(clone, f);
                applyScale();
            }catch(err){ console.error('Object fallback failed', err); svgContainer.innerHTML = '<div class="text-center text-muted">Error cargando plano</div>'; }
        });
        // if object fails to load after some time, show message
        setTimeout(()=>{
            const hasSvg = svgContainer.querySelector('svg');
            if(!hasSvg) svgContainer.innerHTML = '<div class="text-center text-muted">No se pudo cargar el plano (prueba con un servidor local)</div>';
        }, 2500);
    }
}

function processSVG(svg, f){
    // detect candidate shapes (rect, path, polygon) with non-zero area
    const candidates = Array.from(svg.querySelectorAll('rect,path,polygon,circle,ellipse')).filter(el => {
        try{ const bb = el.getBBox(); return bb.width*bb.height > 2000; }catch(e){ return false; }
    });

    // clear existing floor entries for this floor
    Object.keys(storeMap).forEach(k=>{ if(storeMap[k].floor === String(f)) delete storeMap[k]; });

    // choose a few well-distributed candidates for visible markers (avoid overlap)
    const maxPins = 5; // number of markers per floor
    function chooseDistributed(cands, maxN, svgEl){
        if(cands.length <= maxN) return cands.slice();
        const bbox = svgEl.getBBox();
        const M = Math.min(maxN, cands.length);
        const rows = Math.round(Math.sqrt(M));
        const cols = Math.ceil(M/rows);
        const cellW = bbox.width / cols;
        const cellH = bbox.height / rows;
        const used = new Set();
        const chosen = [];
        for(let r=0; r<rows; r++){
            for(let c=0; c<cols; c++){
                if(chosen.length >= M) break;
                const cx = bbox.x + (c + 0.5) * cellW;
                const cy = bbox.y + (r + 0.5) * cellH;
                // find nearest candidate not used
                let best = null; let bestDist = Infinity; let bestIdx = -1;
                cands.forEach((el, idx) => {
                    if(used.has(idx)) return;
                    try{ const bb = el.getBBox(); const x = bb.x + bb.width/2; const y = bb.y + bb.height/2; const d = Math.hypot(x-cx, y-cy); if(d < bestDist){ bestDist = d; best = el; bestIdx = idx; } }catch(e){}
                });
                if(best){ used.add(bestIdx); chosen.push(best); }
            }
        }
        // If not enough chosen (due to sparse), fill remaining by picking first unused
        if(chosen.length < M){ cands.forEach((el, idx) => { if(used.has(idx)) return; if(chosen.length>=M) return; chosen.push(el); used.add(idx); }); }
        return chosen;
    }

    const chosenCandidates = chooseDistributed(candidates, maxPins, svg);

    // create entries only for the chosen candidates; hide other areas and don't create sidebar cards for them
    chosenCandidates.forEach((el,i)=>{
        const idx = String(i); // per-floor index
        // keep the original element visible
        el.classList.add('store-area');
        el.setAttribute('data-idx', idx);
        el.setAttribute('data-name', el.getAttribute('id') || ('Local ' + (Number(idx)+1)));
        el.setAttribute('data-floor', String(f));
        el.setAttribute('data-category', el.getAttribute('data-category') || 'Otros');

        // create an HTML marker inside an overlay so hover/click works consistently across browsers
        let overlay = svgContainer.querySelector('.pins-overlay');
        if(!overlay){ overlay = document.createElement('div'); overlay.className = 'pins-overlay'; svgContainer.appendChild(overlay); }
        const marker = document.createElement('button');
        marker.className = 'marker';
        marker.setAttribute('data-idx', idx);
        // apply display name from displayNameMappings (keep original names visible)
        const disp = (displayNameMappings[String(f)] && displayNameMappings[String(f)][String(i)]) || el.getAttribute('id') || ('Local ' + (Number(i)+1));
        el.setAttribute('data-name', disp);
        // set code for meta/popup
        const code = (codeMappings[String(f)] && codeMappings[String(f)][String(i)]) || '';
        if(code) el.setAttribute('data-code', code);

        // allow manual overrides (external link) per chosen index and floor
        const manual = (manualMappings[String(f)] && manualMappings[String(f)][String(i)]) || null;
        const storeExternal = (manual && manual.externalUrl) ? manual.externalUrl : (externalLinks[i] || '');
        // store the external URL in storeMap (so modal can show it) but do NOT attach it to the marker for Planta Baja
        if(String(f) !== '1' && storeExternal){ marker.setAttribute('data-external', storeExternal); }
        // compute position using element bounding rect relative to svgContainer
        try{
            const elRect = el.getBoundingClientRect();
            const parentRect = svgContainer.getBoundingClientRect();
            const left = elRect.left - parentRect.left + (elRect.width/2);
            const top = elRect.top - parentRect.top + (elRect.height/2);
            marker.style.left = left + 'px';
            marker.style.top = top + 'px';
        }catch(e){}
        marker.addEventListener('click', (ev) => { ev.stopPropagation(); const name = el.getAttribute('data-name') || ('Local ' + (Number(idx)+1)); const code = el.getAttribute('data-code') || ''; const url = marker.getAttribute('data-external') || ''; showPinPopup(ev.clientX, ev.clientY, name, code, url); });
        overlay.appendChild(marker);

        storeMap[idx] = { area: el, pin: marker, pinned: true, name: el.getAttribute('data-name'), code: el.getAttribute('data-code') || '', category: el.getAttribute('data-category'), floor: String(f), externalUrl: storeExternal };
    });

    // Keep all SVG shapes visible so the full map is shown.
    if(!svgContainer.querySelector('.pins-overlay')){ const ov = document.createElement('div'); ov.className='pins-overlay'; svgContainer.appendChild(ov); }

    // wire hover/tooltips/coord display
    svg.addEventListener('mousemove', (ev)=>{ coordsBubble.textContent = `X: ${ev.offsetX}, Y: ${ev.offsetY}`; });

    // build UI lists/cards
    rebuildCards();
    // restore any pinned state and reflect current filters
    loadPinnedState();
    applyFilter();
}

function rebuildCards(){
    // categories
    const cats = new Set(Object.values(storeMap).map(s=>s.category || 'Otros'));
    categoryFilters.innerHTML = '';
    const allBtn = document.createElement('button'); allBtn.className='btn btn-sm btn-outline-secondary active'; allBtn.textContent='Todas'; allBtn.addEventListener('click', ()=>{ applyFilter(''); }); categoryFilters.appendChild(allBtn);
    cats.forEach(c=>{ const b=document.createElement('button'); b.className='btn btn-sm btn-outline-secondary'; b.textContent=c; b.addEventListener('click', ()=>{ applyFilter(c); }); categoryFilters.appendChild(b); });

    // cards
    storeCards.innerHTML = '';
    // Only render cards for entries that exist in storeMap for current floor
    Object.keys(storeMap).filter(k=> storeMap[k].floor === currentFloor.val ).sort((a,b)=>Number(a)-Number(b)).forEach(idx=>{
        const s = storeMap[idx];
        const card = document.createElement('div'); card.className='store-card'; card.setAttribute('role','listitem');
        const floorLabel = s.floor === '1' ? 'Planta Baja' : 'Primer Piso';
        const meta = (s.code && s.code.length) ? `${s.code} · ${floorLabel}` : `${s.category} · ${floorLabel}`;
        card.innerHTML = `<div><strong>${s.name}</strong><div class="meta">${meta}</div></div>`;
        const actions = document.createElement('div'); actions.className='actions';
        const view = document.createElement('button'); view.className='btn btn-sm btn-outline-secondary'; view.textContent='Ver'; view.addEventListener('click', ()=>{ showStoreInfo(s.area); });
        actions.appendChild(view); card.appendChild(actions);
        storeCards.appendChild(card);
    });
}

function applyFilter(cat=''){
    const q = (storeSearch.value||'').trim().toLowerCase();
    Object.keys(storeMap).forEach(k=>{
        const s = storeMap[k];
        const matchesCat = !cat || s.category === cat;
        const matchesQ = !q || (s.name || '').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q);
        const visible = matchesCat && matchesQ && s.floor === currentFloor.val;
        if(s.pin){ s.pin.style.display = (s.pinned && s.floor===currentFloor.val && visible) ? 'inline' : 'none'; if(!s.pinned) s.pin.classList.add('hidden'); }
    });
    rebuildCards();
}

function showStoreInfo(el){
    const name = el.getAttribute('data-name') || 'Local';
    const floor = el.getAttribute('data-floor') || '1';
    const idx = el.getAttribute('data-idx');
    const entry = storeMap[String(idx)];
    document.getElementById('storeModalLabel').textContent = name;
    document.getElementById('storeDescription').textContent = 'Detalles del local ' + name + '.';
    document.getElementById('storeFloor').textContent = 'Piso: ' + (floor==='1' ? 'Planta Baja' : 'Primer Piso');

    // populate link area in modal (if any). For Planta Baja pins we DO store the URL but do not assign it to the pin;
    // show here when available.
    const linkContainer = document.getElementById('storeLinkContainer');
    if(linkContainer){
        linkContainer.innerHTML = '';
        const url = (entry && entry.externalUrl) ? entry.externalUrl : '';
        if(url){
            const a = document.createElement('a');
            a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'btn btn-primary';
            a.textContent = 'Ir al sitio';
            linkContainer.appendChild(a);
        }
    }

    // logo images removed per user request (no logo shown in modal)

    const modalEl = document.getElementById('storeModal');
    const modal = new bootstrap.Modal(modalEl);
    // hide map controls and pins overlay while modal is open to avoid overlay collisions
    const mapControls = document.querySelector('.map-controls');
    if(mapControls) mapControls.classList.add('d-none');
    const pinsOverlay = document.querySelector('.pins-overlay');
    if(pinsOverlay) pinsOverlay.classList.add('d-none');

    // ensure controls and overlay are restored when modal closes
    const restoreControls = function(){ if(mapControls) mapControls.classList.remove('d-none'); if(pinsOverlay) pinsOverlay.classList.remove('d-none'); modalEl.removeEventListener('hidden.bs.modal', restoreControls); };
    modalEl.addEventListener('hidden.bs.modal', restoreControls);

    modal.show();
    el.style.transition='fill .25s'; const prev = el.getAttribute('fill'); el.setAttribute('fill','#fff4e6'); setTimeout(()=> el.setAttribute('fill', prev || '#EFE3E3'), 500);
}

function togglePin(idx, btn){ const s = storeMap[idx]; if(!s) return; s.pinned = !s.pinned; if(s.pinned){ s.pin.style.display='inline'; s.pin.classList.remove('hidden'); btn.classList.add('active'); btn.textContent='Desfijar'; }else{ s.pin.style.display='none'; s.pin.classList.add('hidden'); btn.classList.remove('active'); btn.textContent='Fijar'; } savePinnedState(); }

function togglePin(idx, btn){
    const s = storeMap[idx]; if(!s) return;
    s.pinned = !s.pinned;
    if(s.pinned){
        if(!s.pin) s.pin = createPinForEntry(s, idx);
        if(s.pin){ s.pin.style.display='inline'; s.pin.classList.remove('hidden'); }
        if(btn){ btn.classList.add('active'); btn.textContent='Desfijar'; }
    }else{
        if(s.pin){ s.pin.style.display='none'; s.pin.classList.add('hidden'); }
        if(btn){ btn.classList.remove('active'); btn.textContent='Fijar'; }
    }
    savePinnedState();
}

function savePinnedState(){ try{ const arr = Object.keys(storeMap).filter(k=>storeMap[k].pinned).map(k=>Number(k)); localStorage.setItem('pinnedStores', JSON.stringify(arr)); }catch(e){} }
function loadPinnedState(){ try{ const raw = localStorage.getItem('pinnedStores'); if(!raw) return; const arr = JSON.parse(raw); if(!Array.isArray(arr)) return; arr.forEach(i=>{ const key=String(i); const entry = storeMap[key]; if(entry){ entry.pinned = true; if(!entry.pin) entry.pin = createPinForEntry(entry, key); if(entry.pin) { entry.pin.style.display = 'inline'; entry.pin.classList.remove('hidden'); } } }); }catch(e){} }

function createPinForEntry(entry, idx){
    try{
        const svgEl = svgContainer.querySelector('svg'); if(!svgEl) return null;
        const el = entry.area;
        // create HTML marker in overlay for reliable events
        let overlay2 = svgContainer.querySelector('.pins-overlay');
        if(!overlay2){ overlay2 = document.createElement('div'); overlay2.className='pins-overlay'; svgContainer.appendChild(overlay2); }
        const marker2 = document.createElement('button'); marker2.className='marker'; marker2.setAttribute('data-idx', idx);
        try{
            const elRect = el.getBoundingClientRect();
            const parentRect = svgContainer.getBoundingClientRect();
            const left = elRect.left - parentRect.left + (elRect.width/2);
            const top = elRect.top - parentRect.top + (elRect.height/2);
            marker2.style.left = left + 'px'; marker2.style.top = top + 'px';
        }catch(e){}
        if(entry && entry.externalUrl) marker2.setAttribute('data-external', entry.externalUrl);
        marker2.addEventListener('click', (ev) => { ev.stopPropagation(); const name = el.getAttribute('data-name') || ('Local ' + (Number(idx)+1)); const cat = el.getAttribute('data-category') || ''; const url = marker2.getAttribute('data-external') || (entry && entry.externalUrl) || ''; showPinPopup(ev.clientX, ev.clientY, name, cat, url); });
        overlay2.appendChild(marker2);
        return marker2;
    }catch(e){ return null; }
}

// Pin popup: small card shown near marker when clicked
const pinPopup = document.getElementById('pinPopup');
function showPinPopup(clientX, clientY, name, category, url){
    if(!pinPopup) return;
    // 'category' parameter is reused to pass code (e.g. PB 001 / P1 101) when available
    let html = `<div class="title">${name}</div><div class="cat">${category}</div>`;
    if(url){ html += `<div style="margin-top:8px"><a class="btn btn-sm btn-primary" href="${url}" target="_blank" rel="noopener">Ir al sitio</a></div>`; }
    pinPopup.innerHTML = html;
    const rect = svgContainer.getBoundingClientRect();
    const left = clientX - rect.left;
    const top = clientY - rect.top;
    pinPopup.style.left = left + 'px';
    pinPopup.style.top = top + 'px';
    pinPopup.classList.remove('visually-hidden');
    pinPopup.setAttribute('aria-hidden','false');
}

// hide popup when clicking outside or on scroll/zoom
document.addEventListener('click', (e)=>{
    if(!pinPopup) return;
    if(pinPopup.contains(e.target)) return;
    if(e.target.closest && e.target.closest('.store-pin')) return;
    pinPopup.classList.add('visually-hidden'); pinPopup.setAttribute('aria-hidden','true');
});


// Floor tab handling
document.querySelectorAll('.floor-tabs label').forEach(l=> l.addEventListener('click', ()=>{ const f = l.getAttribute('data-floor'); loadFloorWithFallback(f); }));

// search input
storeSearch.addEventListener('input', ()=> applyFilter());

// initial load
(async()=>{ await loadFloorWithFallback('1'); loadPinnedState(); applyFilter(); })();
