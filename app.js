const state={products:[],history:{},stats:{}};
const money=(v,c='EUR')=>v==null?'—':new Intl.NumberFormat('es-ES',{style:'currency',currency:c||'EUR'}).format(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const isError=o=>String(o.status||'').trim().toLowerCase()==='error';
const isUnknownAvailability=o=>{
  const value=String(o.availability||'').trim().toLowerCase();
  return !value || ['desconocida','desconocido','unknown'].includes(value);
};
const available=o=>{
  if(o.store==='padelnuestro' && (isError(o) || isUnknownAvailability(o))) return false;
  return o.active!==false && !['OutOfStock','SoldOut','Discontinued','MissingFromCatalog'].includes(o.availability);
};
const parseOfferCountFilter=value=>{
  const raw=String(value||'').trim();
  if(!raw) return {valid:true,filter:null};
  const match=raw.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
  if(!match) return {valid:false,filter:null};
  return {valid:true,filter:{operator:match[1]||'=',value:Number(match[2])}};
};
const matchesOfferCount=(count,filter)=>{
  if(!filter) return true;
  if(filter.operator==='>') return count>filter.value;
  if(filter.operator==='<') return count<filter.value;
  if(filter.operator==='>=') return count>=filter.value;
  if(filter.operator==='<=') return count<=filter.value;
  return count===filter.value;
};

function productImage(p,detail=false){
  const classes=`product-media ${detail?'detail-media':'card-media'}`;
  if(!p.image_url) return `<div class="${classes} is-missing"><span>Sin imagen</span></div>`;
  return `<div class="${classes}"><img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"><span>Sin imagen</span></div>`;
}

function bindImageFallback(root=document){
  root.querySelectorAll('.product-media img').forEach(img=>img.addEventListener('error',()=>{
    const media=img.closest('.product-media');
    if(media){media.classList.add('is-missing');img.remove();}
  },{once:true}));
}

function productEans(product){
  const values=[product.ean,...product.offers.map(o=>o.ean)]
    .map(value=>String(value??'').trim())
    .filter(value=>value && !['none','null','n/a','-'].includes(value.toLowerCase()));
  return [...new Set(values)];
}

async function load(){
  const [products,history,stats]=await Promise.all([
    fetch('data/products.json').then(r=>r.json()),
    fetch('data/history.json').then(r=>r.json()),
    fetch('data/stats.json').then(r=>r.json())
  ]);
  Object.assign(state,{products,history,stats});
  const store=document.querySelector('#store');
  stats.stores.forEach(s=>store.insertAdjacentHTML('beforeend',`<option value="${esc(s)}">${esc(s)}</option>`));
  document.querySelector('#updated').textContent=`Datos exportados: ${new Date(stats.generated_at).toLocaleString('es-ES')}`;
  document.querySelector('#stats').innerHTML=`<div><strong>${stats.products}</strong><span>productos</span></div><div><strong>${stats.offers}</strong><span>ofertas</span></div><div><strong>${stats.stores.length}</strong><span>tiendas</span></div>`;
  render();
}

function render(){
  const q=document.querySelector('#search').value.trim().toLowerCase();
  const store=document.querySelector('#store').value;
  const availability=document.querySelector('#availability').value;
  const offerCountInput=document.querySelector('#offer-count');
  const parsedOfferCountFilter=parseOfferCountFilter(offerCountInput.value);
  offerCountInput.setAttribute('aria-invalid',String(!parsedOfferCountFilter.valid));
  if(!parsedOfferCountFilter.valid){
    document.querySelector('#products').innerHTML='<p class="empty">Filtro de ofertas no válido. Usa, por ejemplo: &gt;1, &lt;2, &gt;=1, &lt;=3, =2 o 2.</p>';
    return;
  }
  const offerCountFilter=parsedOfferCountFilter.filter;
  const rows=state.products.filter(p=>{
    const scopedOffers=store?p.offers.filter(o=>o.store===store):p.offers;
    if(store && !scopedOffers.length) return false;
    const offerCount=p.offers.length;
    if(!matchesOfferCount(offerCount,offerCountFilter)) return false;
    const text=[p.name,p.brand,...scopedOffers.flatMap(o=>[o.ean,o.reference,o.store,o.name])].join(' ').toLowerCase();
    if(q && !text.includes(q)) return false;
    if(availability==='available' && !scopedOffers.some(available)) return false;
    if(availability==='unavailable' && scopedOffers.some(available)) return false;
    return true;
  });
  const products=document.querySelector('#products');
  products.innerHTML=rows.map(card).join('') || '<p class="empty">No hay resultados.</p>';
  products.querySelectorAll('[data-product]').forEach(el=>el.addEventListener('click',()=>openProduct(el.dataset.product)));
  bindImageFallback(products);
}

function card(p){
  const best=p.offers.find(o=>o.price===p.best_price) || p.offers[0];
  const offerCount=p.offers.length;
  return `<article class="card" data-product="${esc(p.id)}">
    <div class="card-main">
      ${productImage(p)}
      <div class="card-content">
        <div class="card-top"><div><span class="brand">${esc(p.brand||'Marca desconocida')}</span><h2>${esc(p.name)}</h2></div><div class="price"><small>Desde</small><strong>${money(p.best_price,best?.currency)}</strong></div></div>
        <div class="tags">${p.stores.map(s=>`<span>${esc(s)}</span>`).join('')}<span>${offerCount} oferta${offerCount===1?'':'s'}</span></div>
      </div>
    </div>
  </article>`;
}

function historyPoints(product){
  return product.offers.flatMap(o=>(state.history[String(o.id)]||[])
    .filter(x=>x.price!=null)
    .map(x=>({...x,store:o.store,currency:o.currency,url:o.url,offerId:o.id})))
    .sort((a,b)=>String(a.at).localeCompare(String(b.at)));
}

function historyStats(points){
  const prices=points.map(p=>Number(p.price)).filter(Number.isFinite);
  if(!prices.length) return null;
  const min=Math.min(...prices),max=Math.max(...prices),avg=prices.reduce((a,b)=>a+b,0)/prices.length;
  return {min,max,avg};
}

function chartSvg(points,currency='EUR'){
  if(!points.length) return '<p class="muted">Sin histórico público todavía.</p>';
  const width=900,height=360,left=72,right=24,top=30,bottom=52;
  const times=points.map(p=>new Date(p.at).getTime()).filter(Number.isFinite);
  const prices=points.map(p=>Number(p.price)).filter(Number.isFinite);
  if(!times.length||!prices.length) return '<p class="muted">Sin histórico público todavía.</p>';
  let minT=Math.min(...times),maxT=Math.max(...times); if(minT===maxT) maxT=minT+86400000;
  let minP=Math.min(...prices),maxP=Math.max(...prices); const pad=Math.max((maxP-minP)*.12,1); minP=Math.max(0,minP-pad); maxP+=pad; if(minP===maxP) maxP=minP+1;
  const x=t=>left+(t-minT)/(maxT-minT)*(width-left-right);
  const y=p=>top+(maxP-p)/(maxP-minP)*(height-top-bottom);
  const stores=[...new Set(points.map(p=>p.store))];
  const palette=['#2563eb','#dc2626','#059669','#7c3aed','#ea580c','#0891b2'];
  const series=stores.map((store,i)=>({store,color:palette[i%palette.length],points:points.filter(p=>p.store===store)}));
  const grid=Array.from({length:5},(_,i)=>{const value=maxP-(maxP-minP)*i/4;const yy=top+(height-top-bottom)*i/4;return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="chart-grid"/><text x="${left-10}" y="${yy+4}" text-anchor="end" class="chart-axis">${esc(money(value,currency))}</text>`}).join('');
  const lines=series.map(s=>{
    const normalized=s.points
      .map(p=>({point:p,time:new Date(p.at).getTime(),price:Number(p.price)}))
      .filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.price));
    if(!normalized.length) return '';
    let path=`M ${x(normalized[0].time).toFixed(1)} ${y(normalized[0].price).toFixed(1)}`;
    for(let i=1;i<normalized.length;i++){
      const next=normalized[i];
      path+=` H ${x(next.time).toFixed(1)} V ${y(next.price).toFixed(1)}`;
    }
    const dots=normalized.map(({point,time,price})=>`<circle cx="${x(time)}" cy="${y(price)}" r="4" fill="${s.color}"><title>${esc(s.store)} · ${new Date(point.at).toLocaleDateString('es-ES')} · ${esc(money(point.price,point.currency||currency))}</title></circle>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const startLabel=new Date(minT).toLocaleDateString('es-ES');
  const endLabel=new Date(maxT).toLocaleDateString('es-ES');
  const legend=series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.store)}</span>`).join('');
  return `<div class="chart-wrap"><svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución histórica del precio por tienda">${grid}<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" class="chart-axis-line"/><text x="${left}" y="${height-16}" class="chart-axis">${esc(startLabel)}</text><text x="${width-right}" y="${height-16}" text-anchor="end" class="chart-axis">${esc(endLabel)}</text>${lines}</svg><div class="chart-legend">${legend}</div></div>`;
}

function openProduct(id){
  const p=state.products.find(x=>x.id===id); if(!p) return;
  const offers=p.offers.map(o=>`<tr><td>${esc(o.store)}</td><td>${esc(o.ean||'—')}</td><td>${money(o.price,o.currency)}</td><td>${o.original_price==null?'—':money(o.original_price,o.currency)}</td><td>${o.discount_percent==null?'—':esc(o.discount_percent)+' %'}</td><td>${esc(o.availability||'Desconocida')}</td><td><a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">Ver tienda</a></td></tr>`).join('');
  const eans=productEans(p);
  const points=historyPoints(p);
  const stats=historyStats(points);
  const currency=p.offers.find(o=>o.price!=null)?.currency||'EUR';
  const summary=stats?`<section class="history-stats"><div><span>Mínimo histórico</span><strong>${money(stats.min,currency)}</strong></div><div><span>Máximo histórico</span><strong>${money(stats.max,currency)}</strong></div><div><span>Precio medio</span><strong>${money(stats.avg,currency)}</strong></div></section>`:'';
  const detail=document.querySelector('#detail-content');
  detail.innerHTML=`<section class="detail-header">${productImage(p,true)}<div><p class="brand">${esc(p.brand||'')}</p><h2>${esc(p.name)}</h2><p class="best">Mejor precio actual: <strong>${money(p.best_price,currency)}</strong></p><p class="product-ean"><strong>EAN:</strong> ${eans.length?eans.map(esc).join(' · '):'No disponible'}</p></div></section>
    <div class="table-wrap"><table><thead><tr><th>Tienda</th><th>EAN</th><th>Precio</th><th>PVP</th><th>Descuento</th><th>Disponibilidad</th><th></th></tr></thead><tbody>${offers}</tbody></table></div>
    <h3>Evolución del precio</h3>${summary}${chartSvg(points,currency)}
    <details class="history-list"><summary>Ver histórico en lista (${points.length})</summary>${points.length?`<div class="history">${points.map(x=>`<div><span>${new Date(x.at).toLocaleDateString('es-ES')}</span><span>${esc(x.store)}</span><strong>${money(x.price,x.currency)}</strong></div>`).join('')}</div>`:'<p class="muted">Sin histórico público todavía.</p>'}</details>`;
  bindImageFallback(detail);
  document.querySelector('#detail').showModal();
}

document.querySelectorAll('#search,#store,#availability,#offer-count').forEach(el=>el.addEventListener('input',render));
document.querySelector('#close').addEventListener('click',()=>document.querySelector('#detail').close());
load().catch(err=>{document.querySelector('#products').innerHTML=`<p class="empty">No se pudieron cargar los datos: ${esc(err.message)}</p>`;});
