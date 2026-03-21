// Property Pulse — 2-view toggle: Cards (with collection bar) · Kanban (with mini bars)
(function(){

  var currentView = localStorage.getItem('pulseView') === 'kanban' ? 'kanban' : 'cards';

  // ── Avatar palette (consistent color per tenant name)
  var avatarPalette = ['#2B7AFF','#8B5CF6','#F5A623','#22C55E','#EF4444','#14B8A6','#EC4899','#F97316'];
  function avatarColor(name){
    return avatarPalette[(name || 'U').charCodeAt(0) % avatarPalette.length];
  }

  // ── Shared: compute status + billing-cycle progress for one tenant
  function tenantStatus(t, now, currentDay, currentMonthStart, vp){
    var dueDay        = parseInt(t.rentDueDay) || parseInt(t.rent_due_day) || 1;
    var grace         = 1;
    var reminderDays  = parseInt((window.appSettings || {}).rent_reminder_days_before) || 5;
    var dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
    var overdue = new Date(dueDate.getTime() + grace * 86400000);

    var hasPaid = vp.some(function(p){
      return p.unit === t.unit && new Date(p.timestamp).getTime() >= currentMonthStart;
    });

    var status, statusText, statusClass;
    if(hasPaid){
      status = 'paid';     statusText = 'Paid';      statusClass = 'status-paid';
    } else if(now > overdue){
      status = 'overdue';  statusText = 'Overdue';   statusClass = 'status-overdue';
    } else if(currentDay >= dueDay - reminderDays && currentDay <= dueDay + grace){
      status = 'due-soon'; statusText = 'Due Soon';  statusClass = 'status-due';
    } else {
      status = 'paid';     statusText = 'On Track';  statusClass = 'status-paid';
    }

    // Billing-cycle progress bar
    var lastDue, nextDue;
    if(currentDay >= dueDay){
      lastDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
      nextDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    } else {
      lastDue = new Date(now.getFullYear(), now.getMonth() - 1, dueDay);
      nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
    }
    var fillPct  = Math.min(100, Math.max(2, ((now - lastDue) / (nextDue - lastDue)) * 100));
    var barColor;
    if(hasPaid)                   { barColor = 'var(--success)'; }
    else if(status === 'overdue') { fillPct = 100; barColor = 'var(--danger)'; }
    else if(status === 'due-soon'){ barColor = 'var(--warning)'; }
    else                          { barColor = 'var(--primary)'; }

    return { dueDay, hasPaid, status, statusText, statusClass, fillPct, barColor };
  }

  // ── Collection bar for a set of tenants (used in both views)
  function collectionBar(propTenants, currency, now, currentDay, currentMonthStart, vp){
    var totalRent = 0, collected = 0, paidCount = 0;
    propTenants.forEach(function(t){
      var s    = tenantStatus(t, now, currentDay, currentMonthStart, vp);
      var rent = Number(t.leaseAmount || t.lease_amount || 0);
      totalRent += rent;
      if(s.hasPaid || s.status === 'paid'){ collected += rent; paidCount++; }
    });
    var pct   = totalRent > 0 ? (collected / totalRent) * 100 : 0;
    var color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
    return { pct: pct, color: color, collected: collected, totalRent: totalRent, paidCount: paidCount };
  }

  // ══════════════════════════════════════
  //  TOGGLE (2 buttons)
  // ══════════════════════════════════════
  function buildToggle(){
    var header = document.querySelector('.pulse-header');
    if(!header) return;

    var existing = header.querySelector('.pulse-view-toggle');
    if(existing){
      existing.querySelectorAll('.pvt-btn').forEach(function(b){
        b.classList.toggle('active', b.dataset.view === currentView);
      });
      return;
    }

    var views = [
      { id: 'cards',  icon: 'fa-th-large', label: 'Cards'  },
      { id: 'kanban', icon: 'fa-columns',  label: 'Kanban' }
    ];

    var el = document.createElement('div');
    el.className = 'pulse-view-toggle';
    el.innerHTML = views.map(function(v){
      return '<button class="pvt-btn' + (currentView === v.id ? ' active' : '') +
             '" data-view="' + v.id + '" title="' + v.label + '">' +
             '<i class="fas ' + v.icon + '"></i></button>';
    }).join('');
    header.appendChild(el);

    el.addEventListener('click', function(e){
      var btn = e.target.closest('.pvt-btn');
      if(!btn) return;
      currentView = btn.dataset.view;
      localStorage.setItem('pulseView', currentView);
      buildPulseGrid();
    });
  }

  // ── Shared: render a single occupied unit card (used in both views)
  function renderUnitCard(t, s, rent, currency){
    var initial  = (t.name||'U').trim().charAt(0).toUpperCase();
    var dashFill = 'repeating-linear-gradient(90deg,' + s.barColor + ' 0px,' + s.barColor + ' 5px,transparent 5px,transparent 9px)';
    var h = '';
    h += '<div class="unit-card ' + s.status + '" data-action="openTenantProfile" data-args="' + (t.unit||'') + '" style="cursor:pointer;">';
    h += '<div class="unit-label">Unit ' + (t.unit||'?') + '</div>';
    h += '<div class="unit-avatar" style="background:' + avatarColor(t.name) + ';">' + initial + '</div>';
    h += '<div class="unit-tenant">' + (t.name||'Unknown') + '</div>';
    h += '<div class="unit-rent">' + currency + Number(rent).toLocaleString() + '</div>';
    h += '<div class="unit-pill ' + s.statusClass + '"><span class="pill-dot"></span>' + s.statusText + '</div>';
    h += '<div class="unit-progress-track"><div class="unit-progress-bar" style="width:' + s.fillPct + '%;background:' + dashFill + ';"></div></div>';
    h += '</div>';
    return h;
  }

  // ── Shared: render a single vacant unit card (used in both views)
  function renderVacantCard(propStatus){
    var ps        = (propStatus || 'active').toLowerCase();
    var isMaint   = ps === 'maintenance';
    var isInactive= ps === 'inactive';
    var label     = isMaint ? 'Maintenance' : isInactive ? 'Inactive' : 'Available';
    var pillClass = isMaint ? 'status-due'   : 'status-vacant';
    var cardExtra = isMaint ? ' unit-card-maintenance' : '';
    var avatarBg  = isMaint ? 'rgba(217,119,6,0.15)' : '#CBD5E1';
    var avatarClr = isMaint ? '#b45309'               : '#94a3b8';
    var avatarIcon= isMaint ? '&#9881;'               : '&#8212;'; // ⚙ or —
    var h = '';
    h += '<div class="unit-card vacant' + cardExtra + '">';
    h += '<div class="unit-label">Vacant</div>';
    h += '<div class="unit-avatar" style="background:' + avatarBg + ';color:' + avatarClr + ';font-size:16px;">' + avatarIcon + '</div>';
    h += '<div class="unit-tenant" style="opacity:0.4;">\u2014</div>';
    h += '<div class="unit-rent" style="opacity:0.3;">\u2014</div>';
    h += '<div class="unit-pill ' + pillClass + '"><span class="pill-dot"></span>' + label + '</div>';
    h += '<div class="unit-progress-track"></div>';
    h += '</div>';
    return h;
  }

  // ══════════════════════════════════════
  //  VIEW 1: CARDS + COLLECTION BAR
  // ══════════════════════════════════════
  function buildCardsView(props, tenants, currency, now, currentDay, currentMonthStart, vp){
    var html = '';

    props.forEach(function(prop){
      var pt    = tenants.filter(function(t){ return String(t.propertyId) === String(prop.id); });
      var total = parseInt(prop.units) || pt.length || 1;
      var coll  = collectionBar(pt, currency, now, currentDay, currentMonthStart, vp);

      html += '<div class="property-pulse-card">';

      // Header
      html += '<h3 data-action="showPropertyDetail" data-args="' + prop.id + '" style="cursor:pointer;" title="View property details">' +
              '<span>' + (prop.name||'Property') + '</span>' +
              '<span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">' + pt.length + '/' + total + ' occupied</span>' +
              '</h3>';

      // Collection bar
      if(pt.length > 0){
        html += '<div class="pulse-collection">' +
                  '<div class="pulse-coll-summary">' +
                    '<span>' + currency + Number(coll.collected).toLocaleString() + ' collected</span>' +
                    '<span>' + coll.paidCount + ' / ' + pt.length + ' paid</span>' +
                  '</div>' +
                  '<div class="pulse-coll-bar-track">' +
                    '<div class="pulse-coll-bar-fill" style="width:' + coll.pct + '%;background:' + coll.color + ';"></div>' +
                  '</div>' +
                '</div>';
      }

      // Unit grid
      html += '<div class="unit-grid">';
      pt.forEach(function(t){
        var s    = tenantStatus(t, now, currentDay, currentMonthStart, vp);
        var rent = t.leaseAmount || t.lease_amount || 0;
        html += renderUnitCard(t, s, rent, currency);
      });
      for(var v = 0; v < total - pt.length; v++){ html += renderVacantCard(prop.status); }
      html += '</div></div>';
    });

    return html;
  }

  // ══════════════════════════════════════
  //  VIEW 2: KANBAN (status-grouped cards)
  // ══════════════════════════════════════
  function buildKanbanView(props, tenants, currency, now, currentDay, currentMonthStart, vp){
    var cols = {
      'paid':     { label: 'Paid / On Track', color: 'var(--success)', icon: '✓', cards: [] },
      'due-soon': { label: 'Due Soon',         color: 'var(--warning)', icon: '◷', cards: [] },
      'overdue':  { label: 'Overdue',          color: 'var(--danger)',  icon: '!', cards: [] },
      'vacant':   { label: 'Vacant',           color: '#94a3b8',        icon: '○', cards: [] }
    };

    props.forEach(function(prop){
      var pt    = tenants.filter(function(t){ return String(t.propertyId) === String(prop.id); });
      var total = parseInt(prop.units) || pt.length || 1;

      pt.forEach(function(t){
        var s    = tenantStatus(t, now, currentDay, currentMonthStart, vp);
        var rent = t.leaseAmount || t.lease_amount || 0;
        cols[s.status].cards.push({ t: t, s: s, rent: rent });
      });

      for(var v = 0; v < total - pt.length; v++){
        cols['vacant'].cards.push({ vacant: true, propStatus: prop.status });
      }
    });

    var html = '';

    ['paid','due-soon','overdue','vacant'].forEach(function(key){
      var col = cols[key];
      if(col.cards.length === 0) return;

      html += '<div class="property-pulse-card">';
      html += '<h3>' +
              '<span style="color:' + col.color + ';">' + col.icon + ' ' + col.label + '</span>' +
              '<span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">' + col.cards.length + ' unit' + (col.cards.length !== 1 ? 's' : '') + '</span>' +
              '</h3>';
      html += '<div class="unit-grid">';
      col.cards.forEach(function(c){
        html += c.vacant ? renderVacantCard(c.propStatus) : renderUnitCard(c.t, c.s, c.rent, currency);
      });
      html += '</div></div>';
    });

    return html;
  }

  // ══════════════════════════════════════
  //  MAIN
  // ══════════════════════════════════════
  function buildPulseGrid(){
    var props   = window.propertyData || [];
    var tenants = window.tenantData   || [];
    var grid    = document.getElementById('property-pulse-grid');
    if(!grid || !props.length) return;

    var settings  = window.appSettings || {};
    var currency  = settings.currency  || '\u20B1';
    var now       = new Date();
    var currentDay = now.getDate();
    var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var vp = (window._allPayments || []).filter(function(p){ return p.status === 'verified'; });

    buildToggle();

    if(currentView === 'kanban'){
      grid.classList.add('pulse-grid-kanban');
      grid.innerHTML = buildKanbanView(props, tenants, currency, now, currentDay, currentMonthStart, vp);
    } else {
      grid.classList.remove('pulse-grid-kanban');
      grid.innerHTML = buildCardsView(props, tenants, currency, now, currentDay, currentMonthStart, vp);
    }
  }

  // ── Hook into refreshDashboard
  var hooked = false;
  function hookRefresh(){
    if(hooked || !window.refreshDashboard) return;
    hooked = true;
    var orig = window.refreshDashboard;
    window.refreshDashboard = function(){
      var r = orig.apply(this, arguments);
      if(r && typeof r.then === 'function'){
        r.then(function(){ setTimeout(buildPulseGrid, 80); });
      } else {
        setTimeout(buildPulseGrid, 80);
      }
      return r;
    };
  }

  function pollAndBuild(){
    if(window.propertyData && window.propertyData.length > 0){
      buildPulseGrid();
      hookRefresh();
    } else {
      setTimeout(pollAndBuild, 350);
    }
  }

  setTimeout(pollAndBuild, 300);

  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-action="showSection"]');
    if(el && el.dataset.args === 'dashboard') setTimeout(buildPulseGrid, 150);
  });

})();
