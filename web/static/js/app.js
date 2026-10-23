/* OptiFlow Dining: interacción accesible y APIs Django con CSRF. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || (document.cookie.match(/(?:^|; )csrftoken=([^;]*)/) || [])[1] || '';
  let toastTimer;
  function toast(message, kind = '') {
    const el = $('#toast');
    if (!el) { alert(message); return; }
    el.textContent = message; el.className = `toast visible ${kind}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
  }
  async function postJSON(url, obj) {
    const r = await fetch(url, { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json','X-CSRFToken':csrf()}, body:JSON.stringify(obj) });
    let data;
    try { data = await r.json(); } catch (_) { throw new Error('La respuesta del servidor no es válida.'); }
    if (!r.ok) throw new Error(data.error || data.detail || `Error ${r.status}`);
    return data;
  }
  function svg(tag, attributes={}, textContent='') {
    const el = document.createElementNS(SVGNS,tag);
    Object.entries(attributes).forEach(([k,v]) => el.setAttribute(k,String(v)));
    if (textContent) el.textContent = textContent;
    return el;
  }
  const xy = (node) => { const [x,y]=node.split(',').map(Number); return [97+x*186,73+y*113]; };
  function getLayout() { try { return JSON.parse($('#floor-layout').textContent); } catch (_) { return null; } }
  function floorPlan(layout, path=[], destination='mesa08', congested=[]) {
    const canvas=$('#floor-plan'); if(!canvas || !layout) return;
    canvas.replaceChildren();
    canvas.append(svg('rect',{x:16,y:14,width:928,height:579,rx:18,fill:'#f9fcff',stroke:'#dce6f3','stroke-width':2}));
    const zoneDefs=[{x:28,width:324,c:'#dff8ed',t:'ZONA A'},{x:359,width:195,c:'#e8f0fe',t:'ZONA B'},{x:560,width:376,c:'#fff0e8',t:'ZONA C'}];
    zoneDefs.forEach(z=>{canvas.append(svg('rect',{x:z.x,y:20,width:z.width,height:566,rx:11,fill:z.c,opacity:.48}));canvas.append(svg('text',{x:z.x+20,y:42,class:'zone-map-label'},z.t));});
    for(let x=0;x<5;x++)for(let y=0;y<5;y++){
      const p=xy(`${x},${y}`);
      if(x<4)canvas.append(svg('line',{x1:p[0],y1:p[1],x2:p[0]+186,y2:p[1],class:'floor-walk-line'}));
      if(y<4)canvas.append(svg('line',{x1:p[0],y1:p[1],x2:p[0],y2:p[1]+113,class:'floor-walk-line'}));
      canvas.append(svg('circle',{cx:p[0],cy:p[1],r:5,class:'floor-spot'}));
    }
    layout.tables.forEach(t=>{
      const [x,y]=xy(t.node);
      canvas.append(svg('rect',{x:x-63,y:y-37,width:126,height:73,rx:13,class:'plan-table'+(t.id===destination?' plan-table-active':'')}));
      canvas.append(svg('text',{x,y:y-2,class:'plan-table-text'},t.label));
      canvas.append(svg('text',{x,y:y+19,class:'plan-table-subtext'},`${t.seats} personas`));
    });
    const [kx,ky]=xy('0,2');
    canvas.append(svg('rect',{x:kx-71,y:ky-32,width:142,height:64,rx:13,class:'kitchen-box'}));
    canvas.append(svg('text',{x:kx,y:ky+6,class:'kitchen-text'},'♨ COCINA'));
    if(path.length){
      const points=path.map(n=>xy(n).join(',')).join(' ');
      canvas.append(svg('polyline',{points,class:'floor-route-shadow'}));
      canvas.append(svg('polyline',{points,class:'floor-route'}));
      const start=xy(path[0]);const end=xy(path[path.length-1]);
      canvas.append(svg('circle',{cx:start[0],cy:start[1],r:10,class:'floor-route-dot'}));
      canvas.append(svg('circle',{cx:end[0],cy:end[1],r:10,class:'floor-route-dot'}));
    }
    congested.forEach(n=>{const p=xy(n);canvas.append(svg('circle',{cx:p[0],cy:p[1],r:12,class:'congestion-point'}));canvas.append(svg('text',{x:p[0],y:p[1]+5,'text-anchor':'middle',fill:'white','font-size':'15','font-weight':'900'},'!'));});
  }
  // Mobile navigation.
  $('#menu-trigger')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));
  document.addEventListener('click',e=>{if(!e.target.closest('.sidebar')&&!e.target.closest('#menu-trigger'))$('#sidebar')?.classList.remove('open');});
  $$('[data-toggle-password]').forEach(btn=>btn.addEventListener('click',()=>{const input=btn.parentElement.querySelector('input');input.type=input.type==='password'?'text':'password';btn.textContent=input.type==='password'?'◉':'○';}));
  // Route planner (uses independent FastAPI microservice through Django).
  const layout=getLayout();
  if($('#floor-plan')) floorPlan(layout,[],null,[]);
  let lastRouteId=null;
  const routeFeedback=$('#route-feedback');
  function feedback(text,type){if(!routeFeedback)return;routeFeedback.hidden=false;routeFeedback.className=`route-feedback ${type}`;routeFeedback.textContent=text;}
  async function requestRoute(avoid=false){
    const btn=avoid?$('#route-recalculate'):$('#route-submit');
    if(btn)btn.disabled=true;
    try{
      const data=await postJSON('/api/rutas/',{origin:$('#origin').value,destination:$('#destination').value,task_type:$('#task-type').value,avoid_congestion:avoid});
      lastRouteId=data.route_id;
      floorPlan(layout,data.path,data.destination,data.congested_nodes);
      feedback(data.notice+(data.distance?` Distancia: ${data.distance} tramos del plano.`:''),data.congested?'warning':'success');
      $('#route-actions').hidden=false;
      $('#route-complete').hidden=false;
      $('#route-recalculate').hidden=avoid || !data.congested;
      toast(avoid?'Ruta alternativa calculada.':'Ruta consultada correctamente.','success');
    }catch(error){feedback(error.message,'error');$('#route-actions').hidden=false;$('#route-recalculate').hidden=false;$('#route-complete').hidden=true;toast(error.message,'error');}
    finally{if(btn)btn.disabled=false;}
  }
  $('#route-form')?.addEventListener('submit',e=>{e.preventDefault();requestRoute(false);});
  $('#route-recalculate')?.addEventListener('click',()=>requestRoute(true));
  $('#route-complete')?.addEventListener('click',async()=>{if(!lastRouteId)return toast('Primero calcula una ruta.','error');try{const data=await postJSON(`/api/rutas/${lastRouteId}/finalizar/`,{});feedback(data.message,'success');toast(data.message,'success');$('#route-actions').hidden=true;}catch(err){toast(err.message,'error');}});
  // Update saturation levels with role-enforced API.
  $$('.zone-save').forEach(btn=>btn.addEventListener('click',async()=>{
    const code=btn.dataset.zone;
    try{await postJSON(`/api/zonas/${code}/`,{level:$(`#level-${code}`).value,dwell_minutes:Number($(`#dwell-${code}`).value)});toast(`Zona ${code} actualizada.`, 'success');setTimeout(()=>location.reload(),650);}catch(err){toast(err.message,'error');}
  }));
  $$('.table-status-select').forEach(select=>select.addEventListener('change',async()=>{
    try{await postJSON(`/api/mesas/${select.dataset.code}/`,{state:select.value});toast(`${select.dataset.code.toUpperCase()} guardada correctamente.`,'success');}catch(err){toast(err.message,'error');location.reload();}
  }));
  // OpenCV image analysis. The image remains transient unless S3 is explicitly configured.
  $('#image-file')?.addEventListener('change',e=>{$('#upload-filename').textContent=e.target.files?.[0]?.name || 'Ningún archivo seleccionado';});
  $('#vision-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const file=$('#image-file').files?.[0];if(!file)return toast('Selecciona una imagen.','error');
    if(file.size>5*1024*1024)return toast('Máximo 5 MB por fotografía.','error');
    const btn=$('#vision-submit');btn.disabled=true;btn.textContent='Analizando imagen…';
    try{const form=new FormData();form.append('file',file);
      const r=await fetch('/api/vision/',{method:'POST',credentials:'same-origin',headers:{'X-CSRFToken':csrf()},body:form});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo analizar la foto.');
      $('#vision-placeholder').hidden=true;$('#vision-results').hidden=false;
      $('#vision-people').textContent=data.people_count;
      $('#vision-zone-counts').replaceChildren(...['A','B','C'].map(zone=>{const div=document.createElement('div');const strong=document.createElement('strong');strong.textContent=data.zone_counts[zone];const small=document.createElement('small');small.textContent=`Zona ${zone}`;div.append(strong,small);return div;}));
      $('#vision-annotated').src=data.annotated_image;
      $('#vision-note').textContent=data.disclaimer;
      $('#vision-aws-warning').textContent=data.aws_warning||'';
      toast('Análisis OpenCV completado.','success');
    }catch(err){toast(err.message,'error');}
    finally{btn.disabled=false;btn.innerHTML='Analizar con OpenCV <span>→</span>';}
  });
  // Indicator bars use registered values, no invented sample KPIs.
  const chart=$('.bar-chart');if(chart){const values=chart.dataset.values.split(',').map(Number);const max=Math.max(...values,1);$$('.bar-fill').forEach((b,i)=>{b.style.height=`${values[i]===0?0:Math.max(5,values[i]/max*100)}%`;});}
})();
