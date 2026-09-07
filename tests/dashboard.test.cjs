'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {available,bestOffer,feature,comparisonRows,parseOfferCountFilter,productMatch,offerHistory,chartSeries,stepPath,chartSvg,safeUrl}=require('../app.js');
const day=n=>`2026-09-${String(n).padStart(2,'0')}T12:00:00Z`;
const offer=(extra={})=>({id:1,store:'padelnuestro',price:100,availability:'InStock',active:true,status:'ok',last_checked:day(7),last_successful_check:day(7),features:{Forma:'Lágrima',Cara:'Carbono 12K'},...extra});
const filters=(extra={})=>({q:'',brand:'',store:'',availability:'',shape:'',level:'',play:'',min:null,max:null,count:null,...extra});
const product=offers=>({id:'master-1',name:'Pala de prueba',brand:'Nox',offers,stores:offers.map(o=>o.store)});

test('unchanged price extends to successful check without making up a daily observation',()=>{
 const points=offerHistory(offer(),{'1':[{at:day(1),price:100}]});
 assert.deepEqual(points.map(p=>[p.at,p.price]),[[day(1),100],[day(7),100]]);
 assert.equal(stepPath(points,p=>(p-Date.parse(day(1)))/86400000,p=>p),'M 0.00 100.00 H 6.00 V 100.00');
});
test('price changes are horizontal then vertical; never diagonal',()=>{
 const points=offerHistory(offer({price:80}),{'1':[{at:day(1),price:100},{at:day(4),price:80}]});
 assert.equal(stepPath(points,p=>(p-Date.parse(day(1)))/86400000,p=>p),'M 0.00 100.00 H 3.00 V 80.00 H 6.00 V 80.00');
});
test('failed checks do not extend last valid observation',()=>{
 const points=offerHistory(offer({status:'error',last_checked:day(9),last_successful_check:day(7)}),{'1':[{at:day(1),price:100},{at:day(9),price:100,status:'error'}]});
 assert.equal(points.at(-1).at,day(7));
 const legacy=offerHistory(offer({status:'error',last_successful_check:null}),{'1':[{at:day(1),price:100}]});
 assert.equal(legacy.at(-1).at,day(1));
});
test('each store ends at its own observation, not the newest date of another store',()=>{
 const a=offer({last_checked:day(4),last_successful_check:day(4)}),b=offer({id:2,store:'padelmarket',last_checked:day(9),last_successful_check:day(9)});
 const model=chartSeries(product([a,b]),{'1':[{at:day(1),price:100}],'2':[{at:day(2),price:110}]});
 assert.equal(model.series[0].points.at(-1).time,Date.parse(day(4)));
 assert.equal(model.maxT,Date.parse(day(9)));
});
test('window keeps the known price before its left boundary',()=>{
 const model=chartSeries(product([offer({last_successful_check:day(9)})]),{'1':[{at:day(1),price:120},{at:day(8),price:100}]},7);
 assert.equal(model.series[0].points[0].time,Date.parse(day(2)));
 assert.equal(model.series[0].points[0].price,120);
 assert.equal(model.series[0].points[0].kind,'carry');
});
test('window cannot resurrect a series that ended before the selected period',()=>{
 const a=offer({last_successful_check:day(1)}),b=offer({id:2,store:'padelmarket',last_successful_check:day(9)});
 const model=chartSeries(product([a,b]),{},7);
 assert.deepEqual(model.series.map(s=>s.offer.id),[2]);
});
test('invalid and unknown prices do not become zero; empty graphs explain absence',()=>{
 const points=offerHistory(offer({price:null}),{'1':[{at:'bad',price:50},{at:day(1),price:null},{at:day(2),price:'bad'},{at:day(3),price:''}]});
 assert.equal(points.length,0);
 assert.match(chartSvg({series:[]}),/No hay precios registrados/);
});
test('single observation shows a point but does not invent a line to the next day',()=>{
 const model=chartSeries(product([offer()]),{}),svg=chartSvg(model);
 assert.equal(model.series[0].points.length,1);
 assert.match(svg,/<circle/);assert.doesNotMatch(svg,/NaN|Infinity/);
 assert.doesNotMatch(stepPath(model.series[0].points,x=>x,x=>x),/ H /);
});
test('same timestamps are deduplicated, current verified price wins',()=>{
 const points=offerHistory(offer(),{'1':[{at:day(7),price:120}]});
 assert.equal(points.length,1);assert.equal(points[0].price,100);
});
test('hidden stores disappear and a hidden-all selection is safe',()=>{
 const p=product([offer()]);
 assert.equal(chartSeries(p,{},0,new Set(['padelnuestro'])).series.length,0);
});
test('stock is explicit, valid across all stores and schema URL forms',()=>{
 assert.equal(available(offer()),true);
 assert.equal(available(offer({availability:'https://schema.org/InStock'})),true);
 for(const store of ['padelnuestro','padelmarket','zonadepadel']){
  for(const extra of [{status:'error'},{availability:null},{availability:'OutOfStock'},{active:false}])assert.equal(available(offer({store,...extra})),false);
 }
 assert.equal(bestOffer([offer({price:10,status:'error'}),offer({id:2,price:100})]).id,2);
});
test('features from different stores remain separate while aliases compare together',()=>{
 const a=offer({features:{'Nivel de Juego':'Avanzado','Forma':'Lágrima'}}),b=offer({id:2,features:{'Nivel':'Intermedio','Forma':'Diamante','Peso':'365 g'}});
 assert.equal(feature(a,'level'),'Avanzado');
 const rows=comparisonRows([a,b]);
 assert.deepEqual(rows.find(r=>r.label==='Nivel de juego').values,['Avanzado','Intermedio']);
 assert.deepEqual(rows.find(r=>r.label==='Peso').values,[null,'365 g']);
});
test('store, features and price filters must match the same offer',()=>{
 const p=product([offer(),offer({id:2,store:'padelmarket',price:200,features:{Forma:'Diamante'}})]);
 assert.equal(productMatch(p,filters({shape:'diamante',max:150})),null);
 assert.equal(productMatch(p,filters({store:'padelmarket',shape:'lagrima'})),null);
 const found=productMatch(p,filters({shape:'diamante',min:150}));
 assert.equal(found.best.id,2);
});
test('unknown prices do not pass price filters, unavailable does not mean cheap',()=>{
 const p=product([offer({price:null})]);
 assert.equal(productMatch(p,filters({max:200})),null);
 assert.equal(productMatch(product([offer({availability:'OutOfStock'})]),filters()).best,null);
});
test('offer count syntax preserves existing numeric comparisons',()=>{
 assert.deepEqual(parseOfferCountFilter('>=2'),{valid:true,filter:{operator:'>=',value:2}});
 assert.equal(parseOfferCountFilter('foo').valid,false);
 assert.equal(productMatch(product([offer()]),filters({count:{operator:'>',value:1}})),null);
});
test('unsafe product links cannot execute scripts',()=>{
 assert.equal(safeUrl('javascript:alert(1)'), '');
 assert.equal(safeUrl('data:text/html,test'),'');
 assert.equal(safeUrl('https://example.com/pala'),'https://example.com/pala');
});

test('removal from the catalog is not a fresh price observation',()=>{
 const removed=offer({availability:'MissingFromCatalog',active:false,status:'retirada del catálogo',last_successful_check:day(4),last_checked:day(9)});
 const points=offerHistory(removed,{'1':[{at:day(1),price:100},{at:day(9),price:100,availability:'MissingFromCatalog'}]});
 assert.equal(points.at(-1).at,day(4));
 const legacy=offerHistory({...removed,last_successful_check:null},{'1':[{at:day(1),price:100},{at:day(9),price:100,availability:'MissingFromCatalog'}]});
 assert.equal(legacy.at(-1).at,day(1));
});
