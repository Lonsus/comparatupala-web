'use strict';
(() => {
  const SIZES=[12,24,48], STORE_SIZES=[6,12,24], pages=new Map(), VIEW_KEY='comparatupala:store-catalog-view', SIZE_KEY='comparatupala:store-page-size', STORE_SIZE_KEY='comparatupala:stores-page-size';
  let view='cards', size=12, queued=false, resetQueued=false, storeDirectorySize=6, storeDirectoryPage=1, storeDirectoryQuery='';
  try{
    view=localStorage.getItem(VIEW_KEY)==='list'?'list':'cards';
    const saved=Number(localStorage.getItem(SIZE_KEY));if(SIZES.includes(saved))size=saved;
    const savedStoreSize=Number(localStorage.getItem(STORE_SIZE_KEY));if(STORE_SIZES.includes(savedStoreSize))storeDirectorySize=savedStoreSize;
  }catch{}
  if(!document.querySelector('link[data-store-catalog-enhancements]')){const l=document.createElement('link');l.rel='stylesheet';l.href='store-catalog-enhancements.css?v=2';l.dataset.storeCatalogEnhancements='true';document.head.appendChild(l);}

  const slug=()=>{const m=location.hash.match(/^#tienda\/([^?]+)/);if(!m)return'';try{return decodeURIComponent(m[1]);}catch{return m[1];}};
  const money=v=>Number.isFinite(v)?new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(v):'—';
  const pct=v=>Number.isFinite(v)?`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(v)}%`:'—';
  const metric=(label,value)=>`<div class="store-card-metric-extra"><dt>${label}</dt><dd>${value}</dd></div>`;
  const normalizeText=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  function ensureOverviewControls(root){
    const toolbar=root.querySelector('.stores-view-toolbar'),grid=root.querySelector('.stores-grid');if(!toolbar||!grid)return;
    if(!root.querySelector('[data-stores-directory-controls]')){
      const controls=document.createElement('div');controls.className='stores-directory-controls';controls.dataset.storesDirectoryControls='1';
      controls.innerHTML=`<p class="stores-directory-count" data-stores-directory-count role="status" aria-live="polite"></p><label class="field stores-directory-search"><span>Buscar tienda</span><input type="search" autocomplete="off" placeholder="Nombre de la tienda…" data-stores-search></label><label class="field stores-directory-page-size"><span>Tiendas por página</span><select data-stores-page-size>${STORE_SIZES.map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label>`;
      toolbar.insertAdjacentElement('afterend',controls);
    }
    if(!root.querySelector('[data-stores-directory-empty]')){
      const empty=document.createElement('div');empty.className='store-empty store-directory-empty';empty.dataset.storesDirectoryEmpty='1';empty.hidden=true;
      empty.innerHTML='<h3>No hay tiendas que coincidan con la búsqueda</h3><p>Prueba con otro nombre o limpia el buscador.</p>';
      grid.insertAdjacentElement('afterend',empty);
    }
    if(!root.querySelector('[data-stores-pagination]')){
      const nav=document.createElement('nav');nav.className='stores-directory-pagination';nav.dataset.storesPagination='1';nav.setAttribute('aria-label','Páginas del listado de tiendas');
      nav.innerHTML='<button type="button" class="secondary-button" data-stores-page="prev">← Anterior</button><span data-stores-page-status></span><button type="button" class="secondary-button" data-stores-page="next">Siguiente →</button>';
      const empty=root.querySelector('[data-stores-directory-empty]');(empty||grid).insertAdjacentElement('afterend',nav);
    }
  }

  function applyOverview(root,reset=false){
    const grid=root.querySelector('.stores-grid'),nav=root.querySelector('[data-stores-pagination]');if(!grid||!nav)return;
    const search=root.querySelector('[data-stores-search]'),select=root.querySelector('[data-stores-page-size]'),count=root.querySelector('[data-stores-directory-count]'),empty=root.querySelector('[data-stores-directory-empty]');
    if(search&&document.activeElement!==search)search.value=storeDirectoryQuery;
    if(select)select.value=String(storeDirectorySize);
    if(reset)storeDirectoryPage=1;
    const query=normalizeText(storeDirectoryQuery),cards=[...grid.querySelectorAll(':scope > .store-card')];
    const matches=cards.filter(card=>!query||normalizeText(card.querySelector('h2')?.textContent).includes(query));
    const total=matches.length,max=Math.max(1,Math.ceil(total/storeDirectorySize));
    storeDirectoryPage=Math.min(Math.max(1,storeDirectoryPage),max);
    const start=(storeDirectoryPage-1)*storeDirectorySize,end=Math.min(start+storeDirectorySize,total),visible=new Set(matches.slice(start,end));
    cards.forEach(card=>{card.hidden=!visible.has(card);});
    if(count)count.textContent=`${total.toLocaleString('es-ES')} ${total===1?'tienda encontrada':'tiendas encontradas'}`;
    if(empty)empty.hidden=total!==0;
    const prev=nav.querySelector('[data-stores-page="prev"]'),next=nav.querySelector('[data-stores-page="next"]'),status=nav.querySelector('[data-stores-page-status]');
    prev.disabled=storeDirectoryPage<=1;next.disabled=storeDirectoryPage>=max;status.textContent=total?`Página ${storeDirectoryPage} de ${max}`:'';nav.hidden=total===0||total<=storeDirectorySize;
  }

  function overview(root){
    if(!root.querySelector('.stores-page')||typeof window.storeStats!=='function')return;
    root.querySelectorAll('.store-card').forEach(card=>{
      const link=card.querySelector('.store-card-link[href^="#tienda/"]');if(!link)return;
      let id=link.getAttribute('href').slice(8);try{id=decodeURIComponent(id);}catch{}
      link.textContent='Ver datos →';const name=card.querySelector('h2')?.textContent?.trim();if(name)link.setAttribute('aria-label',`Ver datos de ${name}`);
      const dl=card.querySelector('.store-card-metrics');if(!dl||dl.dataset.moreStats)return;
      const s=window.storeStats(id);if(!s)return;
      dl.insertAdjacentHTML('beforeend',metric('Ofertas agotadas',Number(s.soldOutOffers||0).toLocaleString('es-ES'))+metric('Precio medio',money(s.averagePrice))+metric('Descuento medio',pct(s.averageDiscount))+metric('Mayor descuento',pct(s.maxDiscount)));
      dl.dataset.moreStats='1';
    });
    ensureOverviewControls(root);
    applyOverview(root);
  }

  function controls(root){
    const bar=root.querySelector('.store-results-toolbar');if(!bar||bar.querySelector('[data-store-catalog-controls]'))return;
    const box=document.createElement('div');box.className='store-catalog-controls';box.dataset.storeCatalogControls='1';
    box.innerHTML=`<label class="field store-page-size-control"><span>Palas por página</span><select data-store-page-size>${SIZES.map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label><div class="store-catalog-view-control"><span>Vista</span><div class="stores-view-toggle store-product-view-toggle" role="group" aria-label="Vista del catálogo de la tienda"><button type="button" data-store-catalog-view="cards">Fichas</button><button type="button" data-store-catalog-view="list">Lista</button></div></div>`;
    bar.appendChild(box);
  }

  function pagination(root){
    const products=root.querySelector('#store-products');if(!products||root.querySelector('[data-store-pagination]'))return;
    const nav=document.createElement('nav');nav.className='store-products-pagination';nav.dataset.storePagination='1';nav.setAttribute('aria-label','Páginas del catálogo de la tienda');
    nav.innerHTML='<button type="button" class="secondary-button" data-store-page="prev">← Anterior</button><span data-store-page-status></span><button type="button" class="secondary-button" data-store-page="next">Siguiente →</button>';
    products.after(nav);
  }

  function apply(root,reset=false){
    const id=slug(), products=root.querySelector('#store-products'), nav=root.querySelector('[data-store-pagination]');if(!id||!products||!nav)return;
    const select=root.querySelector('[data-store-page-size]');if(select)select.value=String(size);
    products.classList.toggle('is-list-view',view==='list');
    root.querySelectorAll('[data-store-catalog-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storeCatalogView===view)));
    const cards=[...products.querySelectorAll(':scope > .store-product-card')], total=cards.length;if(reset)pages.set(id,1);
    const max=Math.max(1,Math.ceil(total/size)), page=Math.min(Math.max(1,pages.get(id)||1),max);pages.set(id,page);
    const start=(page-1)*size,end=Math.min(start+size,total);cards.forEach((card,i)=>card.hidden=i<start||i>=end);
    const prev=nav.querySelector('[data-store-page="prev"]'),next=nav.querySelector('[data-store-page="next"]'),status=nav.querySelector('[data-store-page-status]');
    prev.disabled=page<=1;next.disabled=page>=max;status.textContent=total?`Página ${page} de ${max}`:'';nav.hidden=total<=size;
    const count=root.querySelector('#store-result-count');if(count&&total){const noun=total===1?'pala encontrada':'palas encontradas';count.textContent=total>size?`${total.toLocaleString('es-ES')} ${noun} · mostrando ${(start+1).toLocaleString('es-ES')}–${end.toLocaleString('es-ES')}`:`${total.toLocaleString('es-ES')} ${noun}`;}
  }

  function enhance(reset=false){const root=document.getElementById('store-view');if(!root||root.hidden)return;overview(root);if(root.querySelector('.store-detail')&&root.querySelector('#store-products')){controls(root);pagination(root);apply(root,reset);}}
  function queue(reset=false){resetQueued=resetQueued||reset;if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;const r=resetQueued;resetQueued=false;enhance(r);});}

  document.addEventListener('click',e=>{
    const toggle=e.target.closest('[data-store-catalog-view]');if(toggle){view=toggle.dataset.storeCatalogView==='list'?'list':'cards';try{localStorage.setItem(VIEW_KEY,view);}catch{}enhance();return;}
    const storesPage=e.target.closest('[data-stores-page]');if(storesPage&&!storesPage.disabled){storeDirectoryPage=Math.max(1,storeDirectoryPage+(storesPage.dataset.storesPage==='prev'?-1:1));enhance();document.querySelector('.stores-view-toolbar')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const page=e.target.closest('[data-store-page]');if(!page||page.disabled)return;const id=slug();if(!id)return;pages.set(id,Math.max(1,(pages.get(id)||1)+(page.dataset.storePage==='prev'?-1:1)));enhance();document.querySelector('.store-catalog-heading')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.addEventListener('input',e=>{const search=e.target.closest('[data-stores-search]');if(!search)return;storeDirectoryQuery=search.value;storeDirectoryPage=1;enhance();});
  document.addEventListener('change',e=>{
    const storesSelect=e.target.closest('[data-stores-page-size]');if(storesSelect){const n=Number(storesSelect.value);if(!STORE_SIZES.includes(n))return;storeDirectorySize=n;storeDirectoryPage=1;try{localStorage.setItem(STORE_SIZE_KEY,String(n));}catch{}enhance();return;}
    const select=e.target.closest('[data-store-page-size]');if(!select)return;const n=Number(select.value);if(!SIZES.includes(n))return;size=n;const id=slug();if(id)pages.set(id,1);try{localStorage.setItem(SIZE_KEY,String(n));}catch{}enhance(true);
  });
  window.addEventListener('hashchange',()=>{const id=slug();if(id)pages.set(id,1);if(location.hash==='#tiendas')storeDirectoryPage=1;queue(true);});

  const observer=new MutationObserver(ms=>{let relevant=false,reset=false;for(const m of ms){const t=m.target instanceof Element?m.target:m.target.parentElement;if(!t)continue;if(t.id==='store-view'||t.closest?.('#store-view'))relevant=true;if(t.id==='store-products'||t.closest?.('#store-products'))reset=true;}if(relevant)queue(reset);});
  const start=()=>{observer.observe(document.body,{childList:true,subtree:true});queue();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
