/**
 * OptiFlow Dining · Lógica de interacción para la Vista Previa
 * Módulos: Dashboard, Ruteo Dijkstra (M2), Control de Saturación (M3),
 * Indicadores Operativos (M3), Plano y Mesas (M1), Visión OpenCV y Autenticación.
 */
(() => {
  'use strict';

  // ==========================================
  // ESTADO GLOBAL DE LA APLICACIÓN
  // ==========================================
  const state = {
    currentRole: 'capitan',
    activeSection: 'dashboard',
    lastRouteId: null,
    currentPath: [],
    currentAvoid: false,
    stats: {
      routesConsulted: 0,
      routesRecalculated: 0,
      tasksCompleted: 0
    },
    zones: {
      A: { code: 'A', name: 'Zona A', level: 'normal', dwell_minutes: 0.8 },
      B: { code: 'B', name: 'Zona B', level: 'moderada', dwell_minutes: 2.4 },
      C: { code: 'C', name: 'Zona C', level: 'critica', dwell_minutes: 4.6 }
    },
    tables: {
      mesa01: { code: 'mesa01', label: 'Mesa 01', node: '1,1', seats: 4, zone: 'A', state: 'disponible' },
      mesa02: { code: 'mesa02', label: 'Mesa 02', node: '2,1', seats: 4, zone: 'B', state: 'activa' },
      mesa03: { code: 'mesa03', label: 'Mesa 03', node: '3,1', seats: 2, zone: 'C', state: 'disponible' },
      mesa04: { code: 'mesa04', label: 'Mesa 04', node: '4,1', seats: 4, zone: 'C', state: 'ocupada' },
      mesa05: { code: 'mesa05', label: 'Mesa 05', node: '1,3', seats: 2, zone: 'A', state: 'disponible' },
      mesa06: { code: 'mesa06', label: 'Mesa 06', node: '2,3', seats: 4, zone: 'B', state: 'activa' },
      mesa07: { code: 'mesa07', label: 'Mesa 07', node: '3,3', seats: 2, zone: 'C', state: 'disponible' },
      mesa08: { code: 'mesa08', label: 'Mesa 08', node: '4,3', seats: 6, zone: 'C', state: 'ocupada' }
    },
    origins: {
      cocina: { id: 'cocina', label: 'Zona de cocina', node: '0,2' },
      entrada: { id: 'entrada', label: 'Entrada principal', node: '0,4' }
    },
    routesHistory: [],
    visionHistory: []
  };

  const CONGESTION_NODES = new Set(['2,2', '3,2']);

  // ==========================================
  // NOTIFICACIONES TOAST
  // ==========================================
  let toastTimer;
  window.toast = function(message, kind = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast visible ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
  };

  const SVGNS = 'http://www.w3.org/2000/svg';
  function createSvg(tag, attrs = {}, text = '') {
    const el = document.createElementNS(SVGNS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (text) el.textContent = text;
    return el;
  }

  // Mapeo de coordenadas cuadrícula 5x5 a píxeles en el SVG
  function nodeToXY(nodeStr) {
    const [x, y] = nodeStr.split(',').map(Number);
    return [97 + x * 186, 73 + y * 113];
  }

  // ==========================================
  // NAVEGACIÓN Y CAMBIO DE APARTADOS
  // ==========================================
  const SECTION_TITLES = {
    dashboard: 'Panel principal',
    routes: 'Consultar rutas',
    saturation: 'Saturación del salón',
    analytics: 'Indicadores operativos',
    layout: 'Plano y mesas',
    vision: 'Análisis con OpenCV'
  };

  window.switchApartado = function(sectionId) {
    const role = state.currentRole;
    if (role === 'mesero' && ['saturation', 'analytics', 'layout', 'vision'].includes(sectionId)) {
      toast('El rol Mesero solo tiene acceso a Rutas y Panel.', 'error');
      return;
    }
    if (role === 'gerente' && ['routes', 'layout', 'vision'].includes(sectionId)) {
      toast('El rol Gerente tiene acceso a Panel, Saturación e Indicadores.', 'error');
      return;
    }

    state.activeSection = sectionId;

    // Actualizar enlaces del sidebar
    document.querySelectorAll('#sidebar-nav .nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.section === sectionId);
    });

    // Actualizar vista visible
    document.querySelectorAll('.apartado-view').forEach(view => {
      view.classList.toggle('active-view', view.id === `section-${sectionId}`);
    });

    // Actualizar título en el breadcrumb
    const breadcrumb = document.getElementById('breadcrumb-title');
    if (breadcrumb) {
      breadcrumb.textContent = SECTION_TITLES[sectionId] || 'Panel';
    }

    // Renderizar contenidos según la sección activa
    if (sectionId === 'routes') {
      const destSelect = document.getElementById('route-destination');
      renderFloorPlan('svg-routes-plan', state.currentPath, destSelect ? destSelect.value : 'mesa08');
    } else if (sectionId === 'layout') {
      renderFloorPlan('svg-layout-plan', [], null);
      renderTablesControls();
    } else if (sectionId === 'saturation') {
      renderSaturationControls();
    } else if (sectionId === 'analytics') {
      renderAnalytics();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ==========================================
  // CONTROL DE ROLES Y PERMISOS
  // ==========================================
  window.onRoleChange = function(role) {
    state.currentRole = role;
    const names = {
      capitan: 'Capitán demo',
      mesero: 'Mesero demo',
      gerente: 'Gerente demo',
      admin: 'Administrador'
    };
    const avatars = { capitan: 'C', mesero: 'M', gerente: 'G', admin: 'A' };
    
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    const welcomeEl = document.getElementById('welcome-name');
    
    if (nameEl) nameEl.textContent = names[role] || 'Usuario demo';
    if (avatarEl) avatarEl.textContent = avatars[role] || 'U';
    if (welcomeEl) welcomeEl.textContent = names[role].split(' ')[0];

    // Actualizar visibilidad de enlaces en el menú lateral
    const navLinks = document.querySelectorAll('#sidebar-nav .nav-link');
    navLinks.forEach(link => {
      const sec = link.dataset.section;
      let allowed = true;
      if (role === 'mesero') {
        allowed = (sec === 'dashboard' || sec === 'routes');
      } else if (role === 'gerente') {
        allowed = (sec === 'dashboard' || sec === 'saturation' || sec === 'analytics');
      }
      link.style.display = allowed ? 'flex' : 'none';
    });

    // Si la sección actual no está permitida para este rol, redirigir a dashboard
    if (role === 'mesero' && ['saturation', 'analytics', 'layout', 'vision'].includes(state.activeSection)) {
      switchApartado('dashboard');
    } else if (role === 'gerente' && ['routes', 'layout', 'vision'].includes(state.activeSection)) {
      switchApartado('dashboard');
    }

    toast(`Perfil cambiado a: ${names[role]}`, 'success');
  };

  window.toggleSidebar = function() {
    document.getElementById('sidebar')?.classList.toggle('open');
  };

  // ==========================================
  // RENDERIZADO DEL PLANO EN SVG (COMÚN)
  // ==========================================
  function renderFloorPlan(svgId, path = [], highlightDestination = null) {
    const canvas = document.getElementById(svgId);
    if (!canvas) return;
    canvas.replaceChildren();

    // Fondo del plano
    canvas.append(createSvg('rect', { x: 16, y: 14, width: 928, height: 579, rx: 18, fill: '#f9fcff', stroke: '#dce6f3', 'stroke-width': 2 }));

    // Fondos de las tres zonas
    const zonesDef = [
      { x: 28, width: 324, fill: '#dff8ed', label: 'ZONA A' },
      { x: 359, width: 195, fill: '#e8f0fe', label: 'ZONA B' },
      { x: 560, width: 376, fill: '#fff0e8', label: 'ZONA C' }
    ];
    zonesDef.forEach(z => {
      canvas.append(createSvg('rect', { x: z.x, y: 20, width: z.width, height: 566, rx: 11, fill: z.fill, opacity: 0.48 }));
      canvas.append(createSvg('text', { x: z.x + 20, y: 44, class: 'zone-map-label' }, z.label));
    });

    // Líneas de cuadrícula 5x5
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const p = nodeToXY(`${x},${y}`);
        if (x < 4) canvas.append(createSvg('line', { x1: p[0], y1: p[1], x2: p[0] + 186, y2: p[1], class: 'floor-walk-line' }));
        if (y < 4) canvas.append(createSvg('line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1] + 113, class: 'floor-walk-line' }));
        canvas.append(createSvg('circle', { cx: p[0], cy: p[1], r: 5, class: 'floor-spot' }));
      }
    }

    // Mesas
    Object.values(state.tables).forEach(t => {
      const [x, y] = nodeToXY(t.node);
      const isTarget = t.code === highlightDestination;
      const stateClass = `table-${t.state}`;
      
      const tableRect = createSvg('rect', {
        x: x - 63, y: y - 37, width: 126, height: 73, rx: 13,
        class: `plan-table ${stateClass} ${isTarget ? 'plan-table-active' : ''}`
      });
      canvas.append(tableRect);
      canvas.append(createSvg('text', { x, y: y - 2, class: 'plan-table-text' }, t.label));
      canvas.append(createSvg('text', { x, y: y + 19, class: 'plan-table-subtext' }, `${t.seats} personas · ${t.state}`));
    });

    // Cocina
    const [kx, ky] = nodeToXY('0,2');
    canvas.append(createSvg('rect', { x: kx - 71, y: ky - 32, width: 142, height: 64, rx: 13, class: 'kitchen-box' }));
    canvas.append(createSvg('text', { x: kx, y: ky + 6, class: 'kitchen-text' }, '♨ COCINA'));

    // Entrada
    const [ex, ey] = nodeToXY('0,4');
    canvas.append(createSvg('rect', { x: ex - 55, y: ey - 22, width: 110, height: 44, rx: 10, fill: '#334155' }));
    canvas.append(createSvg('text', { x: ex, y: ey + 5, fill: '#ffffff', 'font-size': '12', 'font-weight': 'bold', 'text-anchor': 'middle' }, '🚪 ENTRADA'));

    // Nodos de congestión
    if (state.zones.C.level === 'critica' || state.zones.B.level === 'critica') {
      CONGESTION_NODES.forEach(n => {
        const p = nodeToXY(n);
        canvas.append(createSvg('circle', { cx: p[0], cy: p[1], r: 13, class: 'congestion-point' }));
        canvas.append(createSvg('text', { x: p[0], y: p[1] + 5, 'text-anchor': 'middle', fill: 'white', 'font-size': '14', 'font-weight': '900' }, '!'));
      });
    }

    // Ruta trazada
    if (path && path.length > 0) {
      const points = path.map(n => nodeToXY(n).join(',')).join(' ');
      canvas.append(createSvg('polyline', { points, class: 'floor-route-shadow' }));
      canvas.append(createSvg('polyline', { points, class: 'floor-route' }));
      const start = nodeToXY(path[0]);
      const end = nodeToXY(path[path.length - 1]);
      canvas.append(createSvg('circle', { cx: start[0], cy: start[1], r: 10, class: 'floor-route-dot' }));
      canvas.append(createSvg('circle', { cx: end[0], cy: end[1], r: 10, class: 'floor-route-dot' }));
    }
  }

  // ==========================================
  // ALGORITMO DIJKSTRA PARA RUTAS (M2)
  // ==========================================
  function calculateDijkstra(startNode, endNode, avoidCongestion = false) {
    const width = 5, height = 5;
    const hasCongestion = (state.zones.C.level === 'critica' || state.zones.B.level === 'critica');
    const avoidSet = (avoidCongestion && hasCongestion) ? CONGESTION_NODES : new Set();

    const queue = [{ node: startNode, dist: 0, path: [startNode] }];
    const visited = new Map();
    visited.set(startNode, 0);

    let bestPath = null;
    let bestDist = Infinity;

    while (queue.length > 0) {
      queue.sort((a, b) => a.dist - b.dist);
      const current = queue.shift();

      if (current.node === endNode) {
        if (current.dist < bestDist) {
          bestDist = current.dist;
          bestPath = current.path;
        }
        break;
      }

      const [x, y] = current.node.split(',').map(Number);
      const neighbors = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          neighbors.push(`${nx},${ny}`);
        }
      }

      for (const nextNode of neighbors) {
        if (avoidSet.has(nextNode) && nextNode !== endNode) continue;
        const nextY = parseInt(nextNode.split(',')[1]);
        const penalty = (nextY !== 2) ? 0.001 : 0;
        const newDist = current.dist + 1 + penalty;

        if (!visited.has(nextNode) || newDist < visited.get(nextNode)) {
          visited.set(nextNode, newDist);
          queue.push({
            node: nextNode,
            dist: newDist,
            path: [...current.path, nextNode]
          });
        }
      }
    }

    const crossedCongestion = (bestPath || []).filter(n => CONGESTION_NODES.has(n));
    return {
      path: bestPath || [startNode, endNode],
      distance: (bestPath ? bestPath.length - 1 : 0),
      congested: crossedCongestion.length > 0,
      congestedNodes: crossedCongestion
    };
  }

  // ==========================================
  // MANEJO DE RUTAS DE SERVICIO
  // ==========================================
  window.handleRouteSubmit = function(e) {
    if (e) e.preventDefault();
    const originKey = document.getElementById('route-origin').value;
    const destKey = document.getElementById('route-destination').value;
    const taskType = document.getElementById('route-task-type').value;

    const startNode = state.origins[originKey]?.node || '0,2';
    const endNode = state.tables[destKey]?.node || '4,3';

    const result = calculateDijkstra(startNode, endNode, false);
    state.currentPath = result.path;
    state.currentAvoid = false;
    state.stats.routesConsulted++;

    renderFloorPlan('svg-routes-plan', result.path, destKey);

    const fb = document.getElementById('route-feedback-box');
    const actions = document.getElementById('route-actions-box');
    const btnRecalc = document.getElementById('btn-recalculate');
    const btnComp = document.getElementById('btn-complete-route');

    if (fb) fb.style.display = 'block';
    if (actions) actions.style.display = 'block';
    if (btnComp) btnComp.style.display = 'block';

    if (result.congested) {
      if (fb) {
        fb.className = 'route-feedback warning';
        fb.innerHTML = `⚠️ <strong>Se detectó congestión en el trayecto:</strong> Puntos críticos atravesados (${result.congestedNodes.join(', ')}). Distancia: ${result.distance} tramos. Te sugerimos recalcular la ruta alternativa.`;
      }
      if (btnRecalc) btnRecalc.style.display = 'block';
    } else {
      if (fb) {
        fb.className = 'route-feedback success';
        fb.innerHTML = `✓ <strong>Ruta recomendada libre de congestión:</strong> Recorrido óptimo a ${state.tables[destKey].label}. Distancia: ${result.distance} tramos.`;
      }
      if (btnRecalc) btnRecalc.style.display = 'none';
    }

    addRouteHistory(destKey, taskType, result.distance, false, false);
    updateDashboardStats();
    toast('Ruta calculada con éxito.', 'success');
  };

  window.handleReroute = function() {
    const originKey = document.getElementById('route-origin').value;
    const destKey = document.getElementById('route-destination').value;
    const taskType = document.getElementById('route-task-type').value;

    const startNode = state.origins[originKey]?.node || '0,2';
    const endNode = state.tables[destKey]?.node || '4,3';

    const result = calculateDijkstra(startNode, endNode, true);
    state.currentPath = result.path;
    state.currentAvoid = true;
    state.stats.routesRecalculated++;

    renderFloorPlan('svg-routes-plan', result.path, destKey);

    const fb = document.getElementById('route-feedback-box');
    const btnRecalc = document.getElementById('btn-recalculate');

    if (fb) {
      fb.className = 'route-feedback success';
      fb.innerHTML = `↻ <strong>Ruta alternativa calculada:</strong> Se esquivaron los nodos congestionados con éxito. Nueva distancia: ${result.distance} tramos.`;
    }
    if (btnRecalc) btnRecalc.style.display = 'none';

    addRouteHistory(destKey, taskType, result.distance, true, false);
    updateDashboardStats();
    toast('Ruta alternativa trazada sin congestión.', 'success');
  };

  window.handleCompleteRoute = function() {
    state.stats.tasksCompleted++;
    if (state.routesHistory.length > 0) {
      state.routesHistory[0].completed = true;
    }
    const actions = document.getElementById('route-actions-box');
    const fb = document.getElementById('route-feedback-box');
    if (actions) actions.style.display = 'none';
    if (fb) {
      fb.className = 'route-feedback success';
      fb.innerHTML = '✓ <strong>¡Tarea de servicio finalizada y registrada con éxito!</strong>';
    }

    renderRoutesHistoryTable();
    updateDashboardStats();
    toast('Tarea finalizada y registrada.', 'success');
  };

  function addRouteHistory(destKey, taskType, distance, recalculated, completed) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    state.routesHistory.unshift({
      id: Date.now(),
      destination: state.tables[destKey]?.label || destKey.toUpperCase(),
      taskType: (taskType === 'entrega' ? 'Entrega de comida' : 'Retiro de vajilla'),
      distance: `${distance} tramos`,
      time: timeStr,
      recalculated,
      completed
    });
    if (state.routesHistory.length > 10) state.routesHistory.pop();
    renderRoutesHistoryTable();
  }

  function renderRoutesHistoryTable() {
    const tbody = document.getElementById('routes-history-tbody');
    if (!tbody) return;
    if (state.routesHistory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-table">Todavía no has consultado rutas en este turno.</td></tr>';
      return;
    }
    tbody.innerHTML = state.routesHistory.map(item => `
      <tr>
        <td><strong>${item.destination}</strong></td>
        <td>${item.taskType}</td>
        <td>${item.distance}</td>
        <td>${item.time}</td>
        <td>
          <span class="status-pill ${item.completed ? 'normal' : (item.recalculated ? 'moderada' : 'normal')}">
            ${item.completed ? 'Finalizada' : (item.recalculated ? 'Recalculada' : 'Consultada')}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // ==========================================
  // APARTADO 3: SATURACIÓN DEL SALÓN (M3)
  // ==========================================
  function renderSaturationControls() {
    const container = document.getElementById('zones-edit-container');
    const heatmap = document.getElementById('heatmap-grid');
    if (!container || !heatmap) return;

    const critZone = Object.values(state.zones).find(z => z.level === 'critica' && z.dwell_minutes > 4);
    const alertBanner = document.getElementById('saturation-alert-banner');
    if (alertBanner) {
      if (critZone) {
        alertBanner.style.display = 'flex';
        const titleEl = document.getElementById('saturation-alert-title');
        const descEl = document.getElementById('saturation-alert-desc');
        if (titleEl) titleEl.textContent = `Congestión crítica · Nodo de la Zona ${critZone.code}`;
        if (descEl) descEl.textContent = `Permanencia registrada: ${critZone.dwell_minutes.toFixed(1)} minutos. Supera el umbral de 4 minutos definido en los requerimientos.`;
      } else {
        alertBanner.style.display = 'none';
      }
    }

    container.innerHTML = Object.values(state.zones).map(z => `
      <div class="zone-edit-item" data-zone="${z.code}">
        <div class="zone-item-head">
          <span class="zone-letter">${z.code}</span>
          <div>
            <strong>${z.name}</strong>
            <small>Tiempo de permanencia actual</small>
          </div>
          <span class="status-pill ${z.level}">${z.level.toUpperCase()}</span>
        </div>
        <div class="zone-item-fields">
          <label>Nivel de saturación
            <select id="sel-level-${z.code}">
              <option value="normal" ${z.level === 'normal' ? 'selected' : ''}>Normal</option>
              <option value="moderada" ${z.level === 'moderada' ? 'selected' : ''}>Moderada</option>
              <option value="critica" ${z.level === 'critica' ? 'selected' : ''}>Crítica</option>
            </select>
          </label>
          <label>Permanencia (min)
            <input id="input-dwell-${z.code}" type="number" min="0" max="240" step="0.1" value="${z.dwell_minutes}">
          </label>
        </div>
        <button class="btn btn-ghost zone-save" type="button" onclick="saveZoneChanges('${z.code}')">
          Guardar cambios ↗
        </button>
      </div>
    `).join('');

    heatmap.innerHTML = Object.values(state.zones).map(z => `
      <div class="heat-zone heat-${z.level}">
        <span>${z.name}</span>
        <strong>${z.level.toUpperCase()}</strong>
        <small>${z.dwell_minutes.toFixed(1)} min</small>
      </div>
    `).join('');
  }

  window.saveZoneChanges = function(zoneCode) {
    const level = document.getElementById(`sel-level-${zoneCode}`).value;
    const dwell = parseFloat(document.getElementById(`input-dwell-${zoneCode}`).value) || 0;

    state.zones[zoneCode].level = level;
    state.zones[zoneCode].dwell_minutes = dwell;

    renderSaturationControls();
    updateDashboardStats();
    toast(`Zona ${zoneCode} actualizada correctamente.`, 'success');
  };

  // ==========================================
  // APARTADO 4: INDICADORES OPERATIVOS (M3)
  // ==========================================
  function renderAnalytics() {
    const total = state.stats.routesConsulted;
    const recalc = state.stats.routesRecalculated;
    const comp = state.stats.tasksCompleted;
    const critCount = Object.values(state.zones).filter(z => z.level === 'critica').length;

    const totalEl = document.getElementById('kpi-total-routes');
    const critEl = document.getElementById('kpi-critical-zones');
    const recalcEl = document.getElementById('kpi-recalculated');
    const compEl = document.getElementById('kpi-completed');

    if (totalEl) totalEl.textContent = total;
    if (critEl) critEl.textContent = critCount;
    if (recalcEl) recalcEl.textContent = recalc;
    if (compEl) compEl.textContent = comp;

    const maxVal = Math.max(total, recalc, comp, 1);
    const barRoutes = document.getElementById('bar-routes');
    const barRecalc = document.getElementById('bar-recalc');
    const barComp = document.getElementById('bar-completed');

    if (barRoutes) barRoutes.style.height = `${(total / maxVal) * 90 + 10}%`;
    if (barRecalc) barRecalc.style.height = `${(recalc / maxVal) * 90 + 10}%`;
    if (barComp) barComp.style.height = `${(comp / maxVal) * 90 + 10}%`;

    const lblRoutes = document.getElementById('bar-routes-lbl');
    const lblRecalc = document.getElementById('bar-recalc-lbl');
    const lblComp = document.getElementById('bar-completed-lbl');

    if (lblRoutes) lblRoutes.textContent = total;
    if (lblRecalc) lblRecalc.textContent = recalc;
    if (lblComp) lblComp.textContent = comp;

    const actList = document.getElementById('analytics-activity-list');
    if (!actList) return;
    if (state.routesHistory.length === 0) {
      actList.innerHTML = '<div class="empty-state">Aún no hay actividad registrada en este turno.</div>';
      return;
    }
    actList.innerHTML = state.routesHistory.map(item => `
      <div class="activity-item">
        <span class="activity-symbol">↗</span>
        <div>
          <strong>${item.destination} · ${item.taskType}</strong>
          <small>Capitán demo · Hoy ${item.time}</small>
        </div>
        <span class="status-pill ${item.recalculated ? 'moderada' : 'normal'}">
          ${item.recalculated ? 'Alternativa' : 'Normal'}
        </span>
      </div>
    `).join('');
  }

  // ==========================================
  // APARTADO 5: PLANO Y MESAS (M1)
  // ==========================================
  function renderTablesControls() {
    const container = document.getElementById('tables-control-list');
    if (!container) return;

    container.innerHTML = Object.values(state.tables).map(t => `
      <div class="table-control">
        <div class="table-icon">▥</div>
        <div>
          <strong>${t.label}</strong>
          <small>${t.seats} personas · ${t.zone}</small>
        </div>
        <select class="table-status-select" onchange="onTableStateChange('${t.code}', this.value)">
          <option value="disponible" ${t.state === 'disponible' ? 'selected' : ''}>Disponible</option>
          <option value="activa" ${t.state === 'activa' ? 'selected' : ''}>Activa</option>
          <option value="ocupada" ${t.state === 'ocupada' ? 'selected' : ''}>Ocupada</option>
        </select>
      </div>
    `).join('');
  }

  window.onTableStateChange = function(tableCode, newState) {
    if (state.tables[tableCode]) {
      state.tables[tableCode].state = newState;
      renderFloorPlan('svg-layout-plan', [], null);
      toast(`Estado de ${state.tables[tableCode].label} actualizado a: ${newState.toUpperCase()}`, 'success');
    }
  };

  // ==========================================
  // APARTADO 6: VISIÓN COMPUTACIONAL OPENCV
  // ==========================================
  let currentUploadedImage = null;

  window.onVisionFileSelected = function(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById('upload-filename').textContent = file.name;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        currentUploadedImage = img;
        toast(`Imagen cargada: ${file.name}. Presiona "Analizar con OpenCV".`, 'success');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.loadSampleImage = function(sampleNum) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    // Fondo del salón
    const grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#132338');
    grad.addColorStop(1, '#0b1625');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);

    // Suelo
    ctx.fillStyle = '#1e334f';
    ctx.fillRect(0, 220, 640, 140);

    // Mesas de fondo
    ctx.fillStyle = '#2f496e';
    ctx.beginPath(); ctx.ellipse(140, 260, 70, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(320, 260, 60, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(500, 260, 80, 32, 0, 0, Math.PI * 2); ctx.fill();

    // Siluetas de personas
    const drawPerson = (px, py, color = '#60a5fa') => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py - 45, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(px - 14, py - 30, 28, 48);
      ctx.fillRect(px - 11, py + 18, 9, 36);
      ctx.fillRect(px + 2, py + 18, 9, 36);
    };

    if (sampleNum === 1) {
      drawPerson(120, 210, '#93c5fd');
      drawPerson(310, 205, '#60a5fa');
      drawPerson(520, 215, '#3b82f6');
      document.getElementById('upload-filename').textContent = 'foto_salon_turno_dia.jpg';
    } else {
      drawPerson(80, 210, '#93c5fd');
      drawPerson(150, 220, '#93c5fd');
      drawPerson(300, 205, '#60a5fa');
      drawPerson(460, 210, '#3b82f6');
      drawPerson(550, 215, '#2563eb');
      document.getElementById('upload-filename').textContent = 'foto_salon_hora_pico.jpg';
    }

    const img = new Image();
    img.onload = function() {
      currentUploadedImage = img;
      toast(`Foto de muestra ${sampleNum} cargada. Presiona "Analizar con OpenCV".`, 'success');
    };
    img.src = canvas.toDataURL('image/jpeg');
  };

  window.handleVisionAnalyze = function(e) {
    if (e) e.preventDefault();
    if (!currentUploadedImage) {
      loadSampleImage(1);
    }

    const btn = document.getElementById('vision-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Procesando algoritmo OpenCV HOG…';
    }

    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Analizar con OpenCV <span>→</span>';
      }

      const canvas = document.getElementById('vision-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = currentUploadedImage.width || 640;
      const h = currentUploadedImage.height || 360;
      canvas.width = w;
      canvas.height = h;

      ctx.drawImage(currentUploadedImage, 0, 0, w, h);

      // Líneas divisorias de sectores (Zonas A, B, C)
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
      ctx.moveTo((2 * w) / 3, 0); ctx.lineTo((2 * w) / 3, h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = 'bold 15px Inter, Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('ZONA A', 14, 25);
      ctx.fillText('ZONA B', w / 3 + 14, 25);
      ctx.fillText('ZONA C', (2 * w) / 3 + 14, 25);

      const isPeak = document.getElementById('upload-filename').textContent.includes('hora_pico');
      const detections = isPeak
        ? [
            { x: 60, y: 140, bw: 45, bh: 110, conf: 0.88, zone: 'A' },
            { x: 130, y: 150, bw: 42, bh: 105, conf: 0.74, zone: 'A' },
            { x: 280, y: 135, bw: 46, bh: 115, conf: 0.92, zone: 'B' },
            { x: 440, y: 140, bw: 44, bh: 110, conf: 0.81, zone: 'C' },
            { x: 530, y: 145, bw: 45, bh: 108, conf: 0.69, zone: 'C' }
          ]
        : [
            { x: 100, y: 140, bw: 46, bh: 115, conf: 0.89, zone: 'A' },
            { x: 290, y: 135, bw: 48, bh: 118, conf: 0.93, zone: 'B' },
            { x: 500, y: 145, bw: 44, bh: 112, conf: 0.78, zone: 'C' }
          ];

      const counts = { A: 0, B: 0, C: 0 };
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;

      detections.forEach(d => {
        counts[d.zone]++;
        ctx.strokeRect(d.x, d.y, d.bw, d.bh);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
        ctx.fillRect(d.x, d.y - 18, 86, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`Persona ${d.conf.toFixed(2)}`, d.x + 4, d.y - 5);
      });

      const placeholder = document.getElementById('vision-placeholder');
      const resultsBox = document.getElementById('vision-results-box');
      const peopleCountEl = document.getElementById('vision-people-count');
      const zoneBox = document.getElementById('vision-zone-counts');
      const noteEl = document.getElementById('vision-note-text');

      if (placeholder) placeholder.style.display = 'none';
      if (resultsBox) resultsBox.style.display = 'block';
      if (peopleCountEl) peopleCountEl.textContent = detections.length;

      if (zoneBox) {
        zoneBox.innerHTML = `
          <div><strong>${counts.A}</strong><small>Zona A</small></div>
          <div><strong>${counts.B}</strong><small>Zona B</small></div>
          <div><strong>${counts.C}</strong><small>Zona C</small></div>
        `;
      }

      if (noteEl) {
        noteEl.textContent = `Estimación HOG completada: ${detections.length} personas identificadas en 3 sectores espaciales. Calibración geométrica aproximada.`;
      }

      const now = new Date();
      state.visionHistory.unshift({
        file: document.getElementById('upload-filename').textContent,
        people: detections.length,
        distrib: `A:${counts.A} · B:${counts.B} · C:${counts.C}`,
        date: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      });
      renderVisionHistory();
      toast('Análisis OpenCV completado con éxito.', 'success');
    }, 600);
  };

  function renderVisionHistory() {
    const tbody = document.getElementById('vision-history-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.visionHistory.map(item => `
      <tr>
        <td><strong>${item.file}</strong></td>
        <td><span class="status-pill normal">${item.people} personas</span></td>
        <td>${item.distrib}</td>
        <td>Hoy ${item.date}</td>
        <td>OpenCV 4.14 (HOG)</td>
      </tr>
    `).join('');
  }

  // ==========================================
  // ACTUALIZACIÓN DE CONTADORES DE DASHBOARD
  // ==========================================
  function updateDashboardStats() {
    const routesEl = document.getElementById('dash-routes-count');
    const recalcEl = document.getElementById('dash-recalculated-count');
    const critEl = document.getElementById('dash-critical-count');

    if (routesEl) routesEl.textContent = state.stats.routesConsulted;
    if (recalcEl) recalcEl.textContent = state.stats.routesRecalculated;

    const critZones = Object.values(state.zones).filter(z => z.level === 'critica');
    if (critEl) critEl.textContent = critZones.length;

    const dashZones = document.getElementById('dash-zones-list');
    if (dashZones) {
      dashZones.innerHTML = Object.values(state.zones).map(z => `
        <div class="zone-overview-row">
          <span class="zone-letter">${z.code}</span>
          <div>
            <strong>${z.name}</strong>
            <small>Permanencia ${z.dwell_minutes.toFixed(1)} min</small>
          </div>
          <span class="status-pill ${z.level}">${z.level.toUpperCase()}</span>
        </div>
      `).join('');
    }
  }

  // ==========================================
  // MANEJO DE SESIÓN Y AUTENTICACIÓN
  // ==========================================
  window.handleLogout = function() {
    const appEl = document.getElementById('view-app');
    const loginEl = document.getElementById('view-login');
    if (appEl && loginEl) {
      appEl.style.display = 'none';
      loginEl.style.display = 'block';
    }
    const err = document.getElementById('login-error-msg');
    if (err) err.style.display = 'none';
    toast('Has cerrado sesión. Puedes ingresar con admin y 1234.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.handleLoginSubmit = function(e) {
    if (e) e.preventDefault();
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    const err = document.getElementById('login-error-msg');

    const username = (uInput?.value || '').trim().toLowerCase();
    const password = (pInput?.value || '').trim();

    const usersMap = {
      admin: { role: 'admin', name: 'Administrador', avatar: 'A' },
      capitan: { role: 'capitan', name: 'Capitán demo', avatar: 'C' },
      mesero: { role: 'mesero', name: 'Mesero demo', avatar: 'M' },
      gerente: { role: 'gerente', name: 'Gerente demo', avatar: 'G' }
    };

    if (usersMap[username] && (password === '1234' || password.length > 0)) {
      if (err) err.style.display = 'none';
      const user = usersMap[username];
      
      const sel = document.getElementById('role-select');
      if (sel) sel.value = user.role;
      onRoleChange(user.role);

      const appEl = document.getElementById('view-app');
      const loginEl = document.getElementById('view-login');
      if (appEl && loginEl) {
        loginEl.style.display = 'none';
        appEl.style.display = 'flex';
      }

      switchApartado('dashboard');
      toast(`¡Bienvenido de nuevo, ${user.name}!`, 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (err) {
        err.style.display = 'block';
        err.textContent = 'Usuario o contraseña incorrectos. Utiliza el usuario "admin" y contraseña "1234".';
      }
      toast('Credenciales incorrectas.', 'error');
    }
  };

  window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '○';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '◉';
    }
  };

  window.fillLoginCredentials = function(username = 'admin', password = '1234') {
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (u) u.value = username;
    if (p) p.value = password;
    window.toast('Credenciales de administrador cargadas', 'success');
  };

  // ==========================================
  // INICIALIZACIÓN
  // ==========================================
  function init() {
    updateDashboardStats();
    renderRoutesHistoryTable();
    renderSaturationControls();
    renderTablesControls();
    renderFloorPlan('svg-routes-plan', [], 'mesa08');
    renderFloorPlan('svg-layout-plan', [], null);

    if (window.location.hash === '#login') {
      handleLogout();
    }

    // Soporte para arrastrar archivos en dropzone
    const dropzone = document.getElementById('vision-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.style.borderColor = '#ff6938'; });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.style.borderColor = '#cfdaea'; });
      });
      dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files?.[0];
        if (file) {
          const fakeEvent = { target: { files: [file] } };
          onVisionFileSelected(fakeEvent);
        }
      });
    }
  }

  // Ejecutar inicialización al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
