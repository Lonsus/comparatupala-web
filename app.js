'use strict';
const state = {products:[], history:{}, stats:{}, saved:new Set(), page:1, pageSize:24, savedOnly:false, product:null, selectedOffer:null, range:0, hiddenStores:new Set(), loaded:false, listPosition:null};
const stores = {padelnuestro:{name:'Padel Nuestro',color:'#119759'}, zonadepadel:{name:'Zona de Pádel',color:'#5a6cdd'}, padelmarket:{name:'Padel Market',color:'#d18323'}};
const storeName = s => stores[s]?.name || s;
const storeColor = s => stores[s]?.color || '#758779';
const storeHref = s => stores[s]?.href || '';
const dot = s => `<i class="store-dot" style="background:${storeColor(s)}" aria-hidden="true"></i>`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const validPrice = v => v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) && Number(v)>=0;
const money = (v,c='EUR') => validPrice(v) ? new Intl.NumberFormat('es-ES',{style:'currency',currency:c||'EUR'}).format(Number(v)) : '—';
const timestamp = v => v ? new Date(v).getTime() : NaN;
const date = (v,full=false) => Number.isFinite(timestamp(v)) ? new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',...(full?{timeStyle:'short'}:{}),timeZone:'Europe/Madrid'}).format(new Date(v)) : 'Sin fecha';
const safeUrl = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const publishedImageUrl = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (['https:', 'http:'].includes(url.protocol)) return url.href;
  } catch {}

  const normalized = raw.replace(/^\.\//, '').replace(/^\//, '');
  if (normalized.startsWith('images/products/') && !normalized.includes('..')) return normalized;
  return '';
};
const externalLink = (url,label,classes='') => safeUrl(url)?`<a class="${classes}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`:'<span class="muted">Enlace no disponible</span>';
const storeLabel = s => {const href=storeHref(s),label=esc(storeName(s));return href?`<a class="offer-store-link" href="${esc(href)}">${label}</a>`:`<span class="offer-store-name">${label}</span>`;};
const hasRatingValue = v => v!==null && v!==undefined && v!=='';
const ratingNumber = v => new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(Number(v));
function externalRatingData(o){
  const rawPresent=hasRatingValue(o.external_rating),scalePresent=hasRatingValue(o.external_rating_scale),normalizedPresent=hasRatingValue(o.external_rating_normalized);
  const raw=rawPresent?Number(o.external_rating):null,scale=scalePresent?Number(o.external_rating_scale):null,normalized=normalizedPresent?Number(o.external_rating_normalized):null;
  if(rawPresent&&(!Number.isFinite(raw)||raw<=0))return null;
  if(scalePresent&&(!Number.isFinite(scale)||scale<=0))return null;
  if(rawPresent&&scalePresent&&raw>scale)return null;
  if(normalizedPresent&&(!Number.isFinite(normalized)||normalized<=0||normalized>5))return null;
  const score=normalizedPresent?normalized:(rawPresent&&scalePresent?raw/scale*5:null);
  if(!Number.isFinite(score)||score<=0||score>5)return null;
  const reviewPresent=hasRatingValue(o.external_review_count),review=reviewPresent?Number(o.external_review_count):null;
  const reviewCount=reviewPresent&&Number.isInteger(review)&&review>=0?review:null;
  return {score,reviewCount,raw:rawPresent&&scalePresent?raw:null,scale:rawPresent&&scalePresent?scale:null};
}
function renderExternalRating(o){
  const data=externalRatingData(o);
  if(!data)return '<div class="offer-rating offer-rating-empty" role="group" aria-label="Sin valoración externa publicada">Sin valoración publicada</div>';
  const score=ratingNumber(data.score),reviewText=data.reviewCount===null?'':`${data.reviewCount.toLocaleString('es-ES')} reseña${data.reviewCount===1?'':'s'}`;
  const aria=`Valoración ${score} sobre 5${reviewText?' basada en '+reviewText:''}`;
  const originalTitle=data.raw!==null&&data.scale!==5?` title="${esc('Valoración original: '+ratingNumber(data.raw)+' / '+ratingNumber(data.scale))}"`:'';
  return `<div class="offer-rating" role="group" aria-label="${esc(aria)}"><span class="offer-rating-line"><span class="offer-rating-score"${originalTitle}><span class="offer-rating-star" aria-hidden="true">★</span> ${score} / 5</span>${reviewText?`<span class="offer-rating-count"> · ${esc(reviewText)}</span>`:''}</span><span class="offer-rating-label">Valoración externa</span></div>`;
}
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
function productImage(p,detail=false){
  const offers=p.offers||[];
  const urls=[...new Set([p.image_url,...offers.filter(o=>o.active!==false).map(o=>o.image_url),...offers.filter(o=>o.active===false).map(o=>o.image_url)].map(publishedImageUrl).filter(Boolean))];
  return `<div class="product-media ${detail?'detail-media':''} ${urls.length?'':'is-missing'}">${urls.length?`<img src="${esc(urls[0])}" data-image-fallbacks="${esc(JSON.stringify(urls.slice(1)))}" alt="${esc(p.name)}" loading="lazy">`:''}<span>Imagen no disponible</span></div>`;
}
function bindImageFallback(root){
  root.querySelectorAll('.product-media img').forEach(img=>{
    if(img.dataset.imageFallbackBound)return;
    img.dataset.imageFallbackBound='true';
    const remaining=JSON.parse(img.dataset.imageFallbacks||'[]');
    const fail=()=>{
      if(remaining.length){img.src=remaining.shift();return;}
      img.removeEventListener('error',fail);
      img.parentElement.classList.add('is-missing');
      img.remove();
    };
    img.addEventListener('error',fail);
    if(img.complete&&!img.naturalWidth)fail();
  });
}
const saveButton = p => `<button type="button" class="save-button" data-save="${esc(p.id)}" aria-pressed="${state.saved.has(p.id)}" aria-label="${state.saved.has(p.id)?'Quitar de guardadas':'Guardar'} ${esc(p.name)}" title="Guardar en este dispositivo">${state.saved.has(p.id)?'♥':'♡'}</button>`;
function card(row){
  const {product:p,best,offers}=row, source=best||offers[0], specs=['shape','play','face'].map(k=>feature(source,k)).filter(Boolean), d=discount(best);
  const pvpSource=[best,...offers].find(o=>o&&validPrice(o.original_price)), pvp=pvpSource?.original_price;
  const href='#pala/'+encodeURIComponent(p.id);
  return `<article class="card"><div class="card-visual">${d?`<span class="discount-badge">−${d}% sobre PVP</span>`:''}${saveButton(p)}<a href="${href}" tabindex="-1" aria-hidden="true">${productImage({...p,image_url:source.image_url||p.image_url})}</a></div><div class="card-body"><p class="brand">${esc(p.brand||'Marca sin indicar')}</p><h3><a href="${href}">${esc(p.name)}</a></h3><div class="feature-tags">${specs.map(v=>`<span>${esc(v)}</span>`).join('')}</div><p class="source-caption">${specs.length?'Ficha: '+esc(storeName(source.store)):'Características pendientes'}</p><div class="card-price"><div><small>${best?'Mejor precio disponible':'Sin oferta disponible'}</small><strong>${money(best?.price,best?.currency)}</strong>${validPrice(pvp)?`<span class="card-pvp">PVP ${money(pvp,pvpSource?.currency||best?.currency)}</span>`:''}</div><span class="store-name">${best?esc(storeName(best.store)):'Consulta las tiendas'}</span></div></div><div class="card-footer"><span class="store-dots">${p.stores.map(dot).join('')}${p.stores.length} tienda${p.stores.length===1?'':'s'}</span><a href="${href}">Comparar →</a></div></article>`;
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
  return `<p class="scroll-hint">Desliza el gráfico para recorrer las fechas. Los valores exactos están en los registros.</p><div class="chart-wrap" tabindex="0" role="region" aria-label="Gráfico del histórico de precios"><svg class="price-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Histórico de precios por tienda: tramos horizontales y cambios verticales. Consulta los valores exactos en la tabla de registros.">${grid}${dates}${lines}</svg></div><div class="chart-legend">${series.map(s=>`<span>${dot(s.offer.store)}${esc(storeName(s.offer.store))}</span>`).join('')}</div>`;
}
function renderOffers(p){const best=bestOffer(p.offers);return p.offers.map(o=>`<article class="offer-row ${best?.id===o.id?'best-offer':''}"><div class="offer-store-block"><div class="offer-store">${dot(o.store)}${storeLabel(o.store)}</div>${renderExternalRating(o)}<p class="offer-info">${best?.id===o.id?'Mejor precio disponible · ':''}${esc(availabilityLabel(o))}</p></div><div class="offer-price">${money(o.price,o.currency)}${validPrice(o.original_price)&&validPrice(o.price)&&Number(o.original_price)>Number(o.price)?`<span class="offer-original">PVP <s>${money(o.original_price,o.currency)}</s> · −${discount(o)}%</span>`:''}</div><div class="offer-ean">EAN: ${esc(o.ean||'No publicado')}<br>Última lectura correcta: ${esc(date(o.last_successful_check||(!isError(o)?o.last_checked:null),true))}</div><span class="badge ${available(o)?'positive':'warning'}">${available(o)?'En stock':'Sin stock confirmado'}</span><div class="offer-actions"><button class="text-button" data-spec-offer="${esc(o.id)}">Ver características</button>${externalLink(o.url,'Ir a la tienda ↗')}</div></article>`).join('');}
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
  document.querySelector('#history-records').innerHTML=`<summary>Ver registros del periodo (${records.length})</summary>${records.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="Registros de precios del periodo"><table><thead><tr><th scope="col">Fecha y hora</th><th scope="col">Tienda</th><th scope="col">Precio</th><th scope="col">Registro</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(date(r.at,true))}</td><td>${esc(storeName(r.store))}</td><td>${money(r.price,currency)}</td><td>${r.kind==='checked'?'Última lectura correcta':'Dato registrado'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Sin registros en este periodo.</p>'}`;
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
  clearTimeout(state.filterTimer);
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
  const noSaved=state.savedOnly&&!state.saved.size;
  root.innerHTML=rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize).map(card).join('')||`<div class="empty"><h3>${!f.valid?'Revisa los filtros':noSaved?'Todavía no has guardado ninguna pala':state.savedOnly?'Tus guardadas no coinciden con estos filtros':'No encontramos palas con estos filtros'}</h3><p>${!f.valid?'Corrige los campos indicados o limpia los filtros para continuar.':noSaved?'Guarda las palas que te interesan pulsando el corazón. Las encontrarás aquí en este dispositivo.':'Prueba otra marca, amplía el precio o limpia la búsqueda.'}</p>${noSaved&&f.valid?'<a class="primary-button" href="#catalogo">Explorar catálogo →</a>':'<button class="secondary-button" data-reset>Limpiar filtros</button>'}</div>`;
  root.setAttribute('aria-busy','false');bindImageFallback(root);
  document.getElementById('results-title').textContent=state.savedOnly?'Tus palas guardadas':'Encuentra tu pala';
  document.getElementById('result-count').textContent=`${rows.length.toLocaleString('es-ES')} palas · ${rows.reduce((n,r)=>n+r.offers.length,0).toLocaleString('es-ES')} ofertas coinciden`;
  document.getElementById('pagination').innerHTML=rows.length?`<button data-page="${state.page-1}" ${state.page===1?'disabled':''}>← Anterior</button><span>Página ${state.page} de ${pages}</span><button data-page="${state.page+1}" ${state.page===pages?'disabled':''}>Siguiente →</button>`:'';
  document.getElementById('active-filters').innerHTML=filterIds.map(id=>{const el=document.getElementById(id);return el.value?`<button class="chip" data-clear="${id}" aria-label="Quitar filtro ${esc(el.closest('label').querySelector('span').textContent)}">${esc(el.closest('label').querySelector('span').textContent)}: ${esc(el.tagName==='SELECT'?el.selectedOptions[0].textContent:el.value)} ×</button>`:'';}).join('');
  updateFilterSummary();
}
function focusSection(element,{scroll=true}={}){
  if(!element)return;
  if(element instanceof HTMLDetailsElement)element.open=true;
  const target=element.matches('details')?element.querySelector('summary'):element;
  if(!target.matches('summary'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  if(scroll)element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function setFiltersExpanded(expanded){
  document.getElementById('filter-content').hidden=!expanded;
  document.getElementById('filter-toggle').setAttribute('aria-expanded',String(expanded));
}
function updateFilterSummary(){
  const count=filterIds.filter(id=>id!=='search'&&document.getElementById(id).value).length;
  const invalid=document.getElementById('filters').querySelector('[aria-invalid="true"]');
  document.getElementById('filter-summary').textContent=invalid?'Revisa los filtros':count?`${count} filtro${count===1?' activo':'s activos'}`:'Marca, precio y características';
}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function toggleSaved(id){const was=state.saved.has(id);was?state.saved.delete(id):state.saved.add(id);let persisted=true;try{localStorage.setItem('comparatupala:saved',JSON.stringify([...state.saved]));}catch{persisted=false;}document.getElementById('saved-count').textContent=state.saved.size;document.querySelectorAll('[data-save]').forEach(el=>{if(el.dataset.save===id){const saved=state.saved.has(id),p=state.products.find(p=>p.id===id);el.setAttribute('aria-pressed',String(saved));el.setAttribute('aria-label',(saved?'Quitar de guardadas ':'Guardar ')+p.name);el.textContent=saved?'♥':'♡';}});if(state.savedOnly&&!state.product){const buttons=[...document.querySelectorAll('#products [data-save]')],index=buttons.findIndex(button=>button.dataset.save===id);renderCatalog();const next=document.querySelectorAll('#products [data-save]');(next[Math.min(index,next.length-1)]||document.getElementById('results-title')).focus({preventScroll:true});}toast(persisted?(was?'Pala quitada de guardadas':'Pala guardada en este dispositivo'):'Guardada solo durante esta sesión: el navegador no permite almacenamiento');}
function resetFilters(){document.getElementById('filters').reset();document.getElementById('search').value='';state.page=1;renderCatalog();}
function route(){
  const home=!location.hash||location.hash==='#inicio'||location.hash==='#como-funciona';
  document.getElementById('landing-view').hidden=!home;
  if(home){
    state.product=null;state.savedOnly=false;
    document.getElementById('catalog-view').hidden=true;
    document.getElementById('product-view').hidden=true;
    document.title='ComparaTuPala.es — Elige tu próxima pala con criterio';
    updateNavigation('nav-home');
    const hash=location.hash;
    requestAnimationFrame(()=>{
      if(location.hash!==hash)return;
      if(hash==='#como-funciona')focusSection(document.getElementById('como-funciona'));
      else if(hash==='#inicio'){window.scrollTo(0,0);focusSection(document.getElementById('landing-title'),{scroll:false});}
    });
    return;
  }
  // Navigation and the loading/error surface remain available before data arrives.
  if(!state.loaded){
    document.getElementById('catalog-view').hidden=false;
    document.getElementById('product-view').hidden=true;
    const about=location.hash==='#quienes-somos'||location.hash==='#contacto';
    updateNavigation(about?'nav-about':location.hash==='#guardadas'?'nav-saved':'nav-catalog');
    if(about){document.dispatchEvent(new CustomEvent('show-about'));focusSection(document.getElementById(location.hash.slice(1)));}
    return;
  }
  const previousProduct=state.product,previousSaved=state.savedOnly;
  const hash=location.hash,match=hash.match(/^#pala\/([^?]+)/);let p=null;
  if(match){try{p=state.products.find(p=>p.id===decodeURIComponent(match[1]));}catch{}}
  state.product=p;document.getElementById('catalog-view').hidden=!!p;document.getElementById('product-view').hidden=!p;
  if(p){document.title=p.name+' — ComparaTuPala.es';renderProduct(p);window.scrollTo(0,0);}
  else{
    state.savedOnly=hash==='#guardadas';
    const returning=previousProduct&&state.listPosition?.savedOnly===state.savedOnly;
    if(previousSaved!==state.savedOnly)state.page=1;
    document.title=state.savedOnly?'Tus palas guardadas — ComparaTuPala.es':'ComparaTuPala.es — Explora, compara y elige';
    document.getElementById('catalog-view').classList.toggle('saved-view',state.savedOnly);
    renderCatalog();
    if(match)toast('Esta pala ya no está en el catálogo exportado');
    requestAnimationFrame(()=>{
      if(location.hash!==hash)return;
      if(hash==='#quienes-somos'||hash==='#contacto'){
        document.dispatchEvent(new CustomEvent('show-about'));
        focusSection(document.getElementById(hash.slice(1)));
      }else if(returning){
        const link=[...document.querySelectorAll('.card h3 a')].find(a=>a.getAttribute('href')===state.listPosition.href);
        (link||document.getElementById('results-title')).focus({preventScroll:true});
        window.scrollTo({top:state.listPosition.y,behavior:'instant'});
      }else if(hash==='#catalogo'||state.savedOnly||previousProduct||previousSaved){
        focusSection(document.getElementById('results-title'));
      }
    });
  }
  const currentNav=hash==='#quienes-somos'||hash==='#contacto'?'nav-about':state.savedOnly?'nav-saved':'nav-catalog';
  updateNavigation(currentNav);
}
function updateNavigation(currentNav){
  document.querySelectorAll('.topbar nav a').forEach(link=>{
    const active=link.id===currentNav;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
}
function renderLandingProduct(){
  // Use a real, comparable catalog entry; leave the static introduction if none exists.
  const product=state.products.find(p=>publishedImageUrl(p.image_url)&&new Set(p.offers.filter(o=>available(o)&&validPrice(o.price)&&(o.currency||'EUR')==='EUR').map(o=>o.store)).size>1);
  if(!product)return;
  const offers=product.offers.filter(o=>available(o)&&validPrice(o.price)&&(o.currency||'EUR')==='EUR');
  const price=Math.min(...offers.map(o=>Number(o.price)));
  const root=document.getElementById('landing-product');
  root.innerHTML=`<img class="landing-product-image" src="${esc(publishedImageUrl(product.image_url))}" alt="${esc(product.name)}" width="280" height="200" referrerpolicy="no-referrer"><p class="landing-product-label">DEL CATÁLOGO</p><h2 class="landing-product-name">${esc(product.name)}</h2><div class="landing-product-price"><span>Precio registrado desde</span><strong>${money(price)}</strong></div><a href="#pala/${encodeURIComponent(product.id)}">Comparar en ${new Set(offers.map(o=>o.store)).size} tiendas <span aria-hidden="true">↗</span></a><p class="landing-product-note">Sin gastos de envío · Consulta el precio en tienda</p>`;
  root.querySelector('img').addEventListener('error',event=>{event.currentTarget.hidden=true;},{once:true});
}
function renderStats(products,stats){
  const multi=products.filter(p=>p.stores.length>1).length;
  const inStock=products.filter(p=>p.offers.some(available)).length;
  const brands=new Set(products.map(p=>norm(p.brand)).filter(Boolean)).size;
  const withHistory=products.filter(p=>p.offers.some(o=>(state.history[String(o.id)]||[]).some(point=>validPrice(point.price)))).length;
  const availableOffers=products.reduce((count,p)=>count+p.offers.filter(available).length,0);
  const metrics=[
    {value:products.length,label:'Palas en el catálogo',icon:'↗'},
    {value:inStock,label:'Palas en stock',icon:'✓'},
    {value:stats.offers,label:'Ofertas registradas',icon:'€'},
    {value:stats.stores.length,label:'Tiendas comparadas',icon:'⌘'},
    {value:multi,label:'Palas en varias tiendas',icon:'⇄',featured:true},
    {value:brands,label:'Marcas identificadas',icon:'◎'},
    {value:withHistory,label:'Palas con precios históricos',icon:'↗'},
    {value:availableOffers,label:'Ofertas con stock disponible',icon:'✓'}
  ];
  const highlights=document.getElementById('landing-highlights');
  highlights.innerHTML=[metrics[0],metrics[3],metrics[4]].map(({value,label})=>`<div><strong>${Number(value).toLocaleString('es-ES')}</strong><span>${label}</span></div>`).join('');
  highlights.setAttribute('aria-busy','false');
  document.getElementById('stats').innerHTML=metrics.map(({value,label,icon,featured=false})=>`<div class="stat${featured?' stat-featured':''}"><div><strong>${Number(value).toLocaleString('es-ES')}</strong><span>${label}</span></div><div class="stat-icon" aria-hidden="true">${icon}</div></div>`).join('');
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
  renderStats(products,stats);
  renderLandingProduct();
  state.loaded=true;
  route();
}
function init(){
  const compact=matchMedia('(max-width:800px)');
  setFiltersExpanded(!compact.matches);
  document.getElementById('filter-toggle').addEventListener('click',e=>setFiltersExpanded(e.currentTarget.getAttribute('aria-expanded')!=='true'));
  document.getElementById('results-title').tabIndex=-1;
  document.querySelectorAll('.topbar a, .landing-secondary').forEach(link=>link.addEventListener('click',event=>{
    if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&link.hash===location.hash){event.preventDefault();route();}
  }));
  document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();const el=document.querySelector(!document.getElementById('landing-view').hidden?'#landing-title':state.product?'.product-title':'#results-title');focusSection(el);});
  const filters=document.getElementById('filters'),search=document.getElementById('search');
  filters.addEventListener('submit',e=>e.preventDefault());
  const scheduleCatalogRender=()=>{clearTimeout(state.filterTimer);state.filterTimer=setTimeout(()=>{state.page=1;renderCatalog();},140);};
  filters.addEventListener('input',scheduleCatalogRender);
  if(!filters.contains(search))search.addEventListener('input',scheduleCatalogRender);
  document.getElementById('sort').addEventListener('change',()=>{state.page=1;renderCatalog();});
  document.getElementById('reset').addEventListener('click',resetFilters);
  document.addEventListener('click',e=>{
    const productLink=e.target.closest('.card a[href^="#pala/"]');
    if(productLink&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey)state.listPosition={y:window.scrollY,href:productLink.getAttribute('href'),savedOnly:state.savedOnly};
    const el=e.target.closest('button');if(!el)return;
    if(el.dataset.save)toggleSaved(el.dataset.save);
    if(el.hasAttribute('data-reset')){resetFilters();focusSection(document.getElementById('results-title'));}
    if(el.dataset.clear){const chips=[...document.querySelectorAll('[data-clear]')],index=chips.indexOf(el);document.getElementById(el.dataset.clear).value='';state.page=1;renderCatalog();const next=document.querySelectorAll('[data-clear]');(next[Math.min(index,next.length-1)]||document.getElementById('results-title')).focus({preventScroll:true});}
    if(el.dataset.page){state.page=Number(el.dataset.page);renderCatalog();focusSection(document.getElementById('results-title'));}
    if(el.dataset.specOffer){const inTabs=!!el.closest('#store-tabs');state.selectedOffer=el.dataset.specOffer;renderSpecs();history.replaceState(null,'','#pala/'+encodeURIComponent(state.product.id)+'?tienda='+state.selectedOffer);if(inTabs)document.querySelector(`#store-tabs [data-spec-offer="${state.selectedOffer}"]`).focus({preventScroll:true});else focusSection(document.getElementById('specs-panel'));}
    if(el.hasAttribute('data-range')){state.range=Number(el.dataset.range);document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.range)===state.range)));renderChart();}
  });
  document.addEventListener('change',e=>{if(e.target.hasAttribute('data-chart-store')){const s=e.target.dataset.chartStore;e.target.checked?state.hiddenStores.delete(s):state.hiddenStores.add(s);renderChart();}});
  window.addEventListener('hashchange',()=>route());
  route();
  load().catch(err=>{document.getElementById('products').innerHTML=`<div class="empty"><h3>No pudimos cargar el catálogo</h3><p>${esc(err.message)}</p><button class="secondary-button" onclick="location.reload()">Reintentar</button></div>`;document.getElementById('products').setAttribute('aria-busy','false');document.getElementById('updated').textContent='Datos no disponibles';document.getElementById('stats').textContent='Las métricas estarán disponibles cuando se pueda cargar el catálogo.';const highlights=document.getElementById('landing-highlights');highlights.innerHTML='<p class="landing-data-message">Las cifras del catálogo no están disponibles en este momento.</p>';highlights.setAttribute('aria-busy','false');});
}
init();
