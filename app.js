'use strict';
const state = {products:[], history:{}, stats:{}, saved:new Set(), page:1, pageSize:24, savedOnly:false, product:null, selectedOffer:null, range:0, hiddenStores:new Set()};
const stores = {padelnuestro:{name:'Padel Nuestro',color:'#119759'}, zonadepadel:{name:'Zona de Pádel',color:'#5a6cdd'}, padelmarket:{name:'Padel Market',color:'#d18323'}};
const storeName = s => stores[s]?.name || s;
const storeColor = s => stores[s]?.color || '#758779';
const dot = s => `<i class="store-dot" style="background:${storeColor(s)}" aria-hidden="true"></i>`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const validPrice = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>=0;
const money = (v,c='EUR') => validPrice(v) ? new Intl.NumberFormat('es-ES',{style:'currency',currency:c||'EUR'}).format(Number(v)) : '—';
const timestamp = v => v ? new Date(v).getTime() : NaN;
const date = (v,full=false) => Number.isFinite(timestamp(v)) ? new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',...(full?{timeStyle:'short'}:{}),timeZone:'Europe/Madrid'}).format(new Date(v)) : 'Sin fecha';
const safeUrl = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const externalLink = (url,label,classes='') => safeUrl(url)?`<a class="${classes}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`:'<span class="muted">Enlace no disponible</span>';
const isError = o => norm(o.status)==='error';
const availabilityCode = o => norm(o.availability).split('/').pop();
const available = o => o.active!==false && !isError(o) && ['instock','limitedavailability','onlineonly','available','disponible','en stock'].includes(availabilityCode(o));
function availabilityLabel(o){
  if(isError(o)) return 'Sin verificar · última lectura con error';
  if(o.active===false || availabilityCode(o)==='missingfromcatalog') return 'Fuera de catálogo';
  if(available(o)) return 'Disponible';
  return ({outofstock:'Agotada',soldout:'Agotada',discontinued:'Descatalogada',preorder:'Preventa',presale:'Preventa',backorder:'Bajo pedido'})[availabilityCode(o)] || 'Stock sin confirmar';
}
const bestOffer = offers => offers.filter(o=>available(o)&&validPrice(o.price)).sort((a,b)=>Number(a.price)-Number(b.price))[0] || null;
const discount = o => o && validPrice(o.original_price) && validPrice(o.price) && Number(o.original_price)>Number(o.price) ? Math.round((1-Number(o.price)/Number(o.original_price))*100) : 0;
const aliases = {shape:['forma'],level:['nivel','nivel de juego'],play:['tipo de juego','juego'],balance:['balance'],weight:['peso'],face:['cara','caras','material caras'],core:['nucleo'],frame:['marco'],hardness:['dureza','tacto'],surface:['superficie','rugosidad'],year:['ano','temporada'],player:['jugador','sexo'],profile:['perfil']};
const featureLabels = {shape:'Forma',level:'Nivel de juego',play:'Tipo de juego',balance:'Balance',weight:'Peso',face:'Caras',core:'Núcleo',frame:'Marco',hardness:'Dureza / tacto',surface:'Superficie',year:'Temporada',player:'Jugador',profile:'Perfil'};
const featureEntries = o => Object.entries(o.features && typeof o.features==='object' && !Array.isArray(o.features)?o.features:{}).filter(([,v])=>v!==null && v!=='' && v!==undefined).map(([k,v])=>[k,typeof v==='object'?JSON.stringify(v):String(v)]);
function feature(o,key){return featureEntries(o).filter(([k])=>(aliases[key]||[key]).includes(norm(k))).map(([,v])=>v).join(' · ');}
function comparisonRows(offers){
  const maps=offers.map(o=>{const m=new Map();for(const [key,value] of featureEntries(o)){const canonical=Object.keys(aliases).find(k=>aliases[k].includes(norm(key)))||norm(key);const prev=m.get(canonical);m.set(canonical,{label:featureLabels[canonical]||key,value:prev?prev.value+' · '+value:value});}return m;});
  return [...new Set(maps.flatMap(m=>[...m.keys()]))].map(key=>({label:maps.find(m=>m.has(key)).get(key).label,values:maps.map(m=>m.get(key)?.value||null)}));
}
function parseOfferCountFilter(value){const raw=String(value||'').trim();if(!raw)return {valid:true,filter:null};const m=raw.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);return m?{valid:true,filter:{operator:m[1]||'=',value:Number(m[2])}}:{valid:false,filter:null};}
function matchesOfferCount(n,f){return !f || ({'>':n>f.value,'<':n<f.value,'>=':n>=f.value,'<=':n<=f.value,'=':n===f.value})[f.operator];}
function productMatch(p,f){
  if(f.brand && norm(p.brand)!==f.brand) return null;
  if(!matchesOfferCount(p.offers.length,f.count)) return null;
  const scoped=p.offers.filter(o=>!f.store||o.store===f.store);
  if(!scoped.length) return null;
  if(f.availability==='unavailable' && scoped.some(available)) return null;
  const eligible=scoped.filter(o=>{
    if(f.availability==='available'&&!available(o)) return false;
    if(f.q&&!norm([p.name,p.brand,p.ean,o.ean,o.reference,o.sku,o.name,...featureEntries(o).flat()].join(' ')).includes(f.q)) return false;
    if(['shape','level','play'].some(k=>f[k]&&norm(feature(o,k))!==f[k])) return false;
    if((f.min!==null||f.max!==null)&&(!available(o)||!validPrice(o.price))) return false;
    if(f.min!==null&&Number(o.price)<f.min) return false;
    if(f.max!==null&&Number(o.price)>f.max) return false;
    return true;
  });
  return eligible.length?{product:p,offers:eligible,best:bestOffer(eligible)}:null;
}
function productImage(p,detail=false){const url=safeUrl(p.image_url);return `<div class="product-media ${detail?'detail-media':''} ${url?'':'is-missing'}">${url?`<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy">`:''}<span>Imagen no disponible</span></div>`;}
function bindImageFallback(root){root.querySelectorAll('.product-media img').forEach(img=>{const fail=()=>{img.parentElement.classList.add('is-missing');img.remove();};img.addEventListener('error',fail,{once:true});if(img.complete&&!img.naturalWidth)fail();});}
const saveButton = p => `<button type="button" class="save-button" data-save="${esc(p.id)}" aria-pressed="${state.saved.has(p.id)}" aria-label="${state.saved.has(p.id)?'Quitar de guardadas':'Guardar'} ${esc(p.name)}" title="Guardar en este dispositivo">${state.saved.has(p.id)?'♥':'♡'}</button>`;
function card(row){
  const {product:p,best,offers}=row, source=best||offers[0], specs=['shape','play','face'].map(k=>feature(source,k)).filter(Boolean), d=discount(best);
  const href='#pala/'+encodeURIComponent(p.id);
  return `<article class="card"><div class="card-visual">${d?`<span class="discount-badge">−${d}% sobre PVP</span>`:''}${saveButton(p)}<a href="${href}" tabindex="-1" aria-hidden="true">${productImage({...p,image_url:source.image_url||p.image_url})}</a></div><div class="card-body"><p class="brand">${esc(p.brand||'Marca sin indicar')}</p><h3><a href="${href}">${esc(p.name)}</a></h3><div class="feature-tags">${specs.map(v=>`<span>${esc(v)}</span>`).join('')}</div><p class="source-caption">${specs.length?'Ficha: '+esc(storeName(source.store)):'Características pendientes'}</p><div class="card-price"><div><small>${best?'Mejor precio disponible':'Sin oferta disponible'}</small><strong>${money(best?.price,best?.currency)}</strong></div><span class="store-name">${best?esc(storeName(best.store)):'Consulta las tiendas'}</span></div></div><div class="card-footer"><span class="store-dots">${p.stores.map(dot).join('')}${p.stores.length} tienda${p.stores.length===1?'':'s'}</span><a href="${href}">Comparar →</a></div></article>`;
}
// A series ends at the last successful observation, never at the export date or today.
function offerHistory(offer,history){
  const checked=offer.last_successful_check || (!isError(offer)&&availabilityCode(offer)!=='missingfromcatalog'?offer.last_checked:null), end=timestamp(checked);
  const points=(history[String(offer.id)]||[]).filter(p=>!isError(p)&&availabilityCode(p)!=='missingfromcatalog'&&validPrice(p.price)&&Number.isFinite(timestamp(p.at))&&(!Number.isFinite(end)||timestamp(p.at)<=end)).map(p=>({...p,price:Number(p.price),time:timestamp(p.at),kind:'record'}));
  if(Number.isFinite(end)&&validPrice(offer.price)) points.push({at:checked,time:end,price:Number(offer.price),kind:'checked'});
  points.sort((a,b)=>a.time-b.time);
  const result=[];
  for(const p of points){if(result.length&&result.at(-1).time===p.time)result[result.length-1]=p;else result.push(p);}
  return result;
}
function chartSeries(product,history,days=0,hidden=new Set()){
  const all=product.offers.map(o=>({offer:o,points:offerHistory(o,history)})).filter(s=>s.points.length);
  if(!all.length)return {series:[],minT:0,maxT:0};
  const maxT=Math.max(...all.map(s=>s.points.at(-1).time));
  const minT=days?maxT-days*86400000:Math.min(...all.map(s=>s.points[0].time));
  const series=all.filter(s=>!hidden.has(s.offer.store)).map(s=>{
    const inside=s.points.filter(p=>p.time>=minT&&p.time<=maxT);
    // Preserve the known value at the left edge, only if this series reaches the window.
    const previous=s.points.filter(p=>p.time<minT).at(-1);
    if(previous&&s.points.at(-1).time>=minT)inside.unshift({...previous,time:minT,at:new Date(minT).toISOString(),kind:'carry'});
    return {...s,points:inside};
  }).filter(s=>s.points.length);
  return {series,minT,maxT};
}
function stepPath(points,x,y){if(!points.length)return '';let path=`M ${x(points[0].time).toFixed(2)} ${y(points[0].price).toFixed(2)}`;for(const p of points.slice(1))path+=` H ${x(p.time).toFixed(2)} V ${y(p.price).toFixed(2)}`;return path;}
function chartSvg(model,currency='EUR'){
  const {series}=model;if(!series.length)return '<div class="spec-empty">No hay precios registrados para las tiendas y el periodo seleccionados.</div>';
  let {minT,maxT}=model;if(minT===maxT){minT-=43200000;maxT+=43200000;}
  const values=series.flatMap(s=>s.points.map(p=>p.price)), low=Math.min(...values),high=Math.max(...values),pad=Math.max((high-low)*.15,5),minP=Math.max(0,low-pad),maxP=high+pad;
  const w=1000,h=330,l=85,r=30,t=25,b=52,x=v=>l+(v-minT)/(maxT-minT)*(w-l-r),y=v=>t+(maxP-v)/(maxP-minP)*(h-t-b);
  const grid=Array.from({length:5},(_,i)=>{const v=maxP-(maxP-minP)*i/4;return `<line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" class="chart-grid"/><text x="${l-12}" y="${y(v)+4}" text-anchor="end" class="chart-axis">${esc(money(v,currency))}</text>`;}).join('');
  const dates=Array.from({length:4},(_,i)=>{const tm=minT+(maxT-minT)*i/3;return `<text x="${x(tm)}" y="${h-15}" text-anchor="${i===0?'start':i===3?'end':'middle'}" class="chart-axis">${esc(date(new Date(tm).toISOString()))}</text>`;}).join('');
  const lines=series.map(s=>`<path data-series="${esc(s.offer.id)}" d="${stepPath(s.points,x,y)}" fill="none" stroke="${storeColor(s.offer.store)}" stroke-width="2.7" stroke-linejoin="round"/>${s.points.map(p=>`<circle cx="${x(p.time)}" cy="${y(p.price)}" r="${p.kind==='carry'?0:3.5}" fill="${storeColor(s.offer.store)}"><title>${esc(storeName(s.offer.store))} · ${esc(date(p.at,true))} · ${esc(money(p.price,currency))}${p.kind==='checked'?' · última lectura correcta':''}</title></circle>`).join('')}`).join('');
  return `<div class="chart-wrap"><svg class="price-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Histórico de precios por tienda: tramos horizontales y cambios verticales. Consulta los valores exactos en la tabla de registros.">${grid}${dates}${lines}</svg></div><div class="chart-legend">${series.map(s=>`<span>${dot(s.offer.store)}${esc(storeName(s.offer.store))}</span>`).join('')}</div>`;
}
function renderOffers(p){const best=bestOffer(p.offers);return p.offers.map(o=>`<article class="offer-row ${best?.id===o.id?'best-offer':''}"><div><div class="offer-store">${dot(o.store)}${esc(storeName(o.store))}</div><p class="offer-info">${best?.id===o.id?'Mejor precio disponible · ':''}${esc(availabilityLabel(o))}</p></div><div class="offer-price">${money(o.price,o.currency)}${validPrice(o.original_price)&&validPrice(o.price)&&Number(o.original_price)>Number(o.price)?`<span class="offer-original">PVP <s>${money(o.original_price,o.currency)}</s> · −${discount(o)}%</span>`:''}</div><div class="offer-ean">EAN: ${esc(o.ean||'No publicado')}<br>Última lectura correcta: ${esc(date(o.last_successful_check||(!isError(o)?o.last_checked:null),true))}</div><span class="badge ${available(o)?'positive':'warning'}">${available(o)?'En stock':'Sin stock confirmado'}</span><div class="offer-actions"><button class="text-button" data-spec-offer="${esc(o.id)}">Ver características</button>${externalLink(o.url,'Ir a la tienda ↗')}</div></article>`).join('');}
function renderComparison(p){
  if(p.offers.length<2)return '';
  const rows=comparisonRows(p.offers);if(!rows.length)return '';
  return `<details class="comparison"><summary>Comparar características entre tiendas</summary><p>Se resaltan los valores publicados que difieren. «No publicado» indica que la tienda no aporta ese dato.</p><div class="table-wrap"><table class="comparison-table"><thead><tr><th scope="col">Característica</th>${p.offers.map(o=>`<th scope="col">${esc(storeName(o.store))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${new Set(r.values.filter(v=>v!==null).map(norm)).size>1?'different':''}"><th scope="row">${esc(r.label)}</th>${r.values.map(v=>`<td>${esc(v??'No publicado')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function renderSpecs(){
  const p=state.product,o=p.offers.find(o=>String(o.id)===String(state.selectedOffer))||p.offers[0];state.selectedOffer=o.id;
  document.querySelector('#store-tabs').innerHTML=p.offers.map(s=>`<button class="store-tab" data-spec-offer="${esc(s.id)}" aria-pressed="${s.id===o.id}">${dot(s.store)}${esc(storeName(s.store))}</button>`).join('');
  const entries=featureEntries(o),identifiers=[['EAN',o.ean],['Referencia',o.reference],['SKU',o.sku],['Referencia del fabricante',o.manufacturer_reference]].filter(([,v])=>v);
  document.querySelector('#spec-content').innerHTML=`<div class="spec-source"><h3>${esc(o.name||p.name)}</h3><p>Según ${esc(storeName(o.store))} · ${externalLink(o.url,'Ver ficha original ↗')}</p></div>${entries.length?`<dl class="spec-grid">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`:'<p class="spec-empty">Esta tienda todavía no tiene características registradas. Puedes consultar su ficha original o elegir otra tienda.</p>'}${identifiers.length?`<details class="description"><summary>Identificadores de esta tienda</summary><dl class="spec-grid">${identifiers.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></details>`:''}${o.description?`<details class="description"><summary>Descripción de ${esc(storeName(o.store))}</summary><p>${esc(o.description)}</p></details>`:'<p class="source-caption">Sin descripción registrada en esta tienda.</p>'}<p class="source-caption">Comprobación: ${esc(date(o.last_checked,true))}${isError(o)?' · Se conservan los últimos datos conocidos.':''}</p>`;
}
function renderChart(){
  const p=state.product,model=chartSeries(p,state.history,state.range,state.hiddenStores),currency=p.offers.find(o=>validPrice(o.price))?.currency||'EUR';
  const points=model.series.flatMap(s=>s.points.map(pt=>({...pt,store:s.offer.store}))),prices=points.map(p=>p.price);
  document.querySelector('#chart-output').innerHTML=`${prices.length?`<div class="history-stats"><div><span>Mínimo del periodo</span><strong>${money(Math.min(...prices),currency)}</strong></div><div><span>Máximo del periodo</span><strong>${money(Math.max(...prices),currency)}</strong></div><div><span>Último dato mostrado</span><strong class="stat-date">${esc(date(new Date(Math.max(...points.map(p=>p.time))).toISOString()))}</strong></div></div>`:''}${chartSvg(model,currency)}`;
  const records=points.filter(p=>p.kind!=='carry').sort((a,b)=>b.time-a.time);
  document.querySelector('#history-records').innerHTML=`<summary>Ver registros del periodo (${records.length})</summary>${records.length?`<div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Tienda</th><th>Precio</th><th>Registro</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(date(r.at,true))}</td><td>${esc(storeName(r.store))}</td><td>${money(r.price,currency)}</td><td>${r.kind==='checked'?'Última lectura correcta':'Dato registrado'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Sin registros en este periodo.</p>'}`;
}
function renderProduct(p){
  state.product=p;state.range=0;state.hiddenStores=new Set();
  const query=new URLSearchParams(location.hash.split('?')[1]||'');state.selectedOffer=query.get('tienda')||bestOffer(p.offers)?.id||p.offers[0].id;
  const best=bestOffer(p.offers),source=best||p.offers[0], eans=[...new Set([p.ean,...p.offers.map(o=>o.ean)].filter(Boolean))];
  const root=document.querySelector('#product-view');
  root.innerHTML=`<div class="breadcrumb"><a href="${state.savedOnly?'#guardadas':'#catalogo'}">← Volver ${state.savedOnly?'a guardadas':'al catálogo'}</a><div class="detail-actions"><button class="secondary-button" id="copy-link">Copiar enlace</button>${saveButton(p)}</div></div><section class="product-hero">${productImage(p,true)}<div><p class="brand">${esc(p.brand||'Marca sin indicar')}${p.year?' / '+esc(p.year):''}</p><h1 class="product-title" tabindex="-1">${esc(p.name)}</h1><div class="feature-tags">${['shape','play','face'].map(k=>feature(source,k)).filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')}</div><p class="source-caption">Características de ${esc(storeName(source.store))}. Consulta cada ficha más abajo.</p><p class="product-meta">${p.stores.length} tiendas asociadas · ${p.offers.length} ofertas<br>EAN: ${eans.length?eans.map(esc).join(' · '):'No publicado'}</p></div><aside class="buy-box"><div><p class="eyebrow">${best?'MEJOR PRECIO DISPONIBLE':'DISPONIBILIDAD'}</p><div class="hero-price">${best?money(best.price,best.currency):'Sin stock'}</div><p>${best?esc(storeName(best.store)):'Consulta las ofertas registradas'}</p></div>${best?externalLink(best.url,'Ver oferta ↗','primary-button'):''}<small>Sin gastos de envío. Confirma el precio final en la tienda.</small></aside></section><nav class="detail-nav" aria-label="Secciones de la pala"><a href="#ofertas" data-scroll="offers-panel">Ofertas (${p.offers.length})</a><a href="#caracteristicas" data-scroll="specs-panel">Características por tienda</a><a href="#historico" data-scroll="history-panel">Histórico de precios</a></nav><div class="detail-grid"><section class="panel" id="offers-panel"><div class="panel-heading"><div><p class="eyebrow">DÓNDE COMPRAR</p><h2>Todas las ofertas</h2><p>Precio y disponibilidad de cada web.</p></div></div><div class="offer-list">${renderOffers(p)}</div>${renderComparison(p)}</section><section class="panel" id="specs-panel"><div class="panel-heading"><div><p class="eyebrow">CONOCE TU PALA</p><h2>Su ficha, tienda a tienda</h2><p>Elige la web para ver sus características.</p></div></div><div class="store-tabs" id="store-tabs" role="group" aria-label="Tienda de la ficha técnica"></div><div id="spec-content" aria-live="polite"></div></section></div><section class="panel chart-panel" id="history-panel"><div class="panel-heading"><div><p class="eyebrow">SIGUE SU EVOLUCIÓN</p><h2>El precio, con perspectiva</h2><p>Compara el histórico registrado en cada tienda.</p></div></div><div class="chart-toolbar"><div class="segmented" role="group" aria-label="Periodo del histórico">${[[7,'7 días'],[30,'30 días'],[90,'90 días'],[0,'Todo']].map(([n,l])=>`<button data-range="${n}" aria-pressed="${n===0}">${l}</button>`).join('')}</div><div class="chart-stores">${p.stores.map(s=>`<label><input type="checkbox" data-chart-store="${esc(s)}" checked>${dot(s)}${esc(storeName(s))}</label>`).join('')}</div></div><div id="chart-output"></div><p class="chart-note">Cada precio se mantiene en horizontal hasta el siguiente cambio registrado. La línea termina en la última lectura correcta de esa tienda; no se prolonga hasta hoy si no hay datos nuevos. Los saltos verticales señalan cuándo se detectó un cambio. Las fechas se muestran en horario de Madrid.</p><details class="history-list" id="history-records"></details></section>`;
  renderSpecs();renderChart();bindImageFallback(root);
  root.querySelectorAll('[data-scroll]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.getElementById(a.dataset.scroll).scrollIntoView({behavior:'smooth'});}));
  root.querySelector('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace de la pala copiado');}catch{toast('Puedes copiar el enlace desde la barra de direcciones');}});
  root.querySelector('.product-title').focus({preventScroll:true});
}
function populate(id,values){const select=document.getElementById(id),unique=new Map();for(const [value,label] of values)if(value&&!unique.has(value))unique.set(value,label);select.insertAdjacentHTML('beforeend',[...unique].sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(''));}
const filterIds=['search','brand','store','availability','shape','level','play','min-price','max-price','offer-count'];
function readFilters(){
  const val=id=>document.getElementById(id).value,parsed=parseOfferCountFilter(val('offer-count')),min=val('min-price')===''?null:Number(val('min-price')),max=val('max-price')===''?null:Number(val('max-price'));
  const priceError=(min!==null&&(!Number.isFinite(min)||min<0))||(max!==null&&(!Number.isFinite(max)||max<0))||(min!==null&&max!==null&&min>max);
  document.getElementById('offer-count').setAttribute('aria-invalid',String(!parsed.valid));
  ['min-price','max-price'].forEach(id=>document.getElementById(id).setAttribute('aria-invalid',String(priceError)));
  document.getElementById('filter-error').textContent=!parsed.valid?'Usa un filtro de ofertas como >=2 o =3.':priceError?'Revisa el rango: el mínimo no puede superar al máximo ni ser negativo.':'';
  return {valid:parsed.valid&&!priceError,q:norm(val('search')),brand:val('brand'),store:val('store'),availability:val('availability'),shape:val('shape'),level:val('level'),play:val('play'),min,max,count:parsed.filter};
}
function renderCatalog(){
  const f=readFilters(),root=document.getElementById('products'),sort=document.getElementById('sort').value;
  const rows=f.valid?state.products.filter(p=>!state.savedOnly||state.saved.has(p.id)).map(p=>productMatch(p,f)).filter(Boolean):[];
  rows.sort((a,b)=>{const ap=a.best?Number(a.best.price):null,bp=b.best?Number(b.best.price):null;let result=0;
    if(sort==='name')result=a.product.name.localeCompare(b.product.name,'es');
    else if(sort==='compare')result=b.product.stores.length-a.product.stores.length;
    else if(sort==='discount')result=discount(b.best)-discount(a.best);
    else result=ap===null?bp===null?0:1:bp===null?-1:sort==='price-desc'?bp-ap:ap-bp;
    return result||a.product.name.localeCompare(b.product.name,'es');
  });
  const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));state.page=Math.min(state.page,pages);
  root.innerHTML=rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize).map(card).join('')||`<div class="empty"><h3>${!f.valid?'Revisa los filtros':state.savedOnly?'No hay palas guardadas con estos filtros':'No encontramos palas con estos filtros'}</h3><p>${state.savedOnly?'Pulsa el corazón de una pala para guardarla en este dispositivo.':'Prueba otra marca, amplía el precio o limpia la búsqueda.'}</p><button class="secondary-button" data-reset>Limpiar filtros</button></div>`;
  root.setAttribute('aria-busy','false');bindImageFallback(root);
  document.getElementById('results-title').textContent=state.savedOnly?'Tus palas guardadas':'Encuentra tu pala';
  document.getElementById('result-count').textContent=`${rows.length.toLocaleString('es-ES')} palas · ${rows.reduce((n,r)=>n+r.offers.length,0).toLocaleString('es-ES')} ofertas coinciden`;
  document.getElementById('pagination').innerHTML=rows.length?`<button data-page="${state.page-1}" ${state.page===1?'disabled':''}>← Anterior</button><span>Página ${state.page} de ${pages}</span><button data-page="${state.page+1}" ${state.page===pages?'disabled':''}>Siguiente →</button>`:'';
  document.getElementById('active-filters').innerHTML=filterIds.map(id=>{const el=document.getElementById(id);return el.value?`<button class="chip" data-clear="${id}" aria-label="Quitar filtro ${esc(el.closest('label').querySelector('span').textContent)}">${esc(el.closest('label').querySelector('span').textContent)}: ${esc(el.tagName==='SELECT'?el.selectedOptions[0].textContent:el.value)} ×</button>`:'';}).join('');
}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function toggleSaved(id){const was=state.saved.has(id);was?state.saved.delete(id):state.saved.add(id);let persisted=true;try{localStorage.setItem('comparatupala:saved',JSON.stringify([...state.saved]));}catch{persisted=false;}document.getElementById('saved-count').textContent=state.saved.size;document.querySelectorAll('[data-save]').forEach(el=>{if(el.dataset.save===id){const saved=state.saved.has(id),p=state.products.find(p=>p.id===id);el.setAttribute('aria-pressed',String(saved));el.setAttribute('aria-label',(saved?'Quitar de guardadas ':'Guardar ')+p.name);el.textContent=saved?'♥':'♡';}});if(state.savedOnly&&!state.product)renderCatalog();toast(persisted?(was?'Pala quitada de guardadas':'Pala guardada en este dispositivo'):'Guardada solo durante esta sesión: el navegador no permite almacenamiento');}
function resetFilters(){document.getElementById('filters').reset();state.page=1;renderCatalog();}
function route(){
  const hash=location.hash,match=hash.match(/^#pala\/([^?]+)/);let p=null;
  if(match){try{p=state.products.find(p=>p.id===decodeURIComponent(match[1]));}catch{}}
  state.product=p;document.getElementById('catalog-view').hidden=!!p;document.getElementById('product-view').hidden=!p;
  if(p){document.title=p.name+' — ComparaTuPala.es';renderProduct(p);window.scrollTo(0,0);}
  else{state.savedOnly=hash==='#guardadas';document.title='ComparaTuPala.es — Explora, compara y elige';renderCatalog();if(match)toast('Esta pala ya no está en el catálogo exportado');}
  document.getElementById('nav-catalog').classList.toggle('active',!state.savedOnly);document.getElementById('nav-saved').classList.toggle('active',state.savedOnly);
}
async function load(){
  const get=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw new Error('No se pudo leer '+path);return r.json();};
  const [products,history,stats]=await Promise.all(['products','history','stats'].map(n=>get('data/'+n+'.json')));
  if(!Array.isArray(products)||!stats||typeof history!=='object')throw new Error('Formato de catálogo no válido');
  Object.assign(state,{products,history,stats});
  try{const saved=JSON.parse(localStorage.getItem('comparatupala:saved')||'[]');if(Array.isArray(saved))state.saved=new Set(saved.filter(id=>products.some(p=>p.id===id)));}catch{}
  document.getElementById('saved-count').textContent=state.saved.size;
  populate('store',stats.stores.map(s=>[s,storeName(s)]));populate('brand',products.map(p=>[norm(p.brand),p.brand||'']));
  for(const k of ['shape','level','play'])populate(k,products.flatMap(p=>p.offers.map(o=>{const v=feature(o,k);return [norm(v),v];})));
  document.getElementById('updated').textContent=date(stats.latest_check,true);
  const multi=products.filter(p=>p.stores.length>1).length;
  document.getElementById('stats').innerHTML=[[products.length,'Palas en el catálogo','↗'],[stats.offers,'Ofertas registradas','€'],[stats.stores.length,'Tiendas comparadas','⌘'],[multi,'Palas en varias tiendas','⇄']].map(([n,l,i])=>`<div class="stat"><div><strong>${Number(n).toLocaleString('es-ES')}</strong><span>${l}</span></div><div class="stat-icon" aria-hidden="true">${i}</div></div>`).join('');
  route();
}
function init(){
  document.getElementById('filter-toggle').addEventListener('click',e=>{const panel=e.currentTarget.closest('aside'),collapsed=panel.classList.toggle('mobile-collapsed');e.currentTarget.setAttribute('aria-expanded',String(!collapsed));e.currentTarget.querySelector('span').textContent=collapsed?'Marca, precio y características ＋':'Ocultar filtros −';});
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();const el=document.querySelector(state.product?'.product-title':'#results-title');el.setAttribute('tabindex','-1');el.focus();});
  document.getElementById('filters').addEventListener('submit',e=>e.preventDefault());
  let timer;document.getElementById('filters').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.page=1;renderCatalog();},140);});
  document.getElementById('sort').addEventListener('change',()=>{state.page=1;renderCatalog();});
  document.getElementById('reset').addEventListener('click',resetFilters);
  document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el)return;
    if(el.dataset.save)toggleSaved(el.dataset.save);
    if(el.hasAttribute('data-reset'))resetFilters();
    if(el.dataset.clear){document.getElementById(el.dataset.clear).value='';state.page=1;renderCatalog();}
    if(el.dataset.page){state.page=Number(el.dataset.page);renderCatalog();document.getElementById('results-title').scrollIntoView();}
    if(el.dataset.specOffer){const inTabs=!!el.closest('#store-tabs');state.selectedOffer=el.dataset.specOffer;renderSpecs();history.replaceState(null,'','#pala/'+encodeURIComponent(state.product.id)+'?tienda='+state.selectedOffer);if(inTabs)document.querySelector(`#store-tabs [data-spec-offer="${state.selectedOffer}"]`).focus({preventScroll:true});else document.getElementById('specs-panel').scrollIntoView();}
    if(el.hasAttribute('data-range')){state.range=Number(el.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.range)===state.range)));renderChart();}
  });
  document.addEventListener('change',e=>{if(e.target.hasAttribute('data-chart-store')){const s=e.target.dataset.chartStore;e.target.checked?state.hiddenStores.delete(s):state.hiddenStores.add(s);renderChart();}});
  window.addEventListener('hashchange',()=>{if(state.products.length)route();});
  load().catch(err=>{document.getElementById('products').innerHTML=`<div class="empty"><h3>No pudimos cargar el catálogo</h3><p>${esc(err.message)}</p><button class="secondary-button" onclick="location.reload()">Reintentar</button></div>`;document.getElementById('products').setAttribute('aria-busy','false');document.getElementById('updated').textContent='Datos no disponibles';});
}
if(typeof document!=='undefined')init();
if(typeof module!=='undefined'&&module.exports)module.exports={validPrice,available,bestOffer,discount,feature,comparisonRows,parseOfferCountFilter,matchesOfferCount,productMatch,offerHistory,chartSeries,stepPath,chartSvg,safeUrl};
