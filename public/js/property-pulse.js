// Property Pulse Grid — visual unit-status overview on Dashboard
(function(){
  function buildPulseGrid(){
    var props = window.propertyData || [];
    var tenants = window.tenantData || [];
    var grid = document.getElementById('property-pulse-grid');
    if(!grid || !props.length) return;
    var settings = window.appSettings || {};
    var currency = settings.currency || '\u20B1';
    var now = new Date();
    var currentDay = now.getDate();
    var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // Get verified payments for this month (same logic as dashboard.js)
    var allPayments = window._allPayments || [];
    var verifiedPayments = allPayments.filter(function(p){ return p.status === 'verified'; });

    var html = '';
    props.forEach(function(prop){
      var propTenants = tenants.filter(function(t){ return String(t.propertyId) === String(prop.id); });
      var totalUnits = parseInt(prop.units) || propTenants.length || 1;
      var occupied = propTenants.length;

      html += '<div class="property-pulse-card">';
      html += '<h3 data-action="showPropertyDetail" data-args="' + prop.id + '" style="cursor:pointer;" title="View property details"><span>' + (prop.name||'Property') + '</span><span style="font-size:0.8rem;font-weight:400;color:var(--text-muted);">' + occupied + '/' + totalUnits + ' occupied</span></h3>';
      html += '<div class="unit-grid">';

      propTenants.forEach(function(t){
        var dueDay = parseInt(t.rentDueDay) || parseInt(t.rent_due_day) || 1;
        var status = 'due-soon';
        var statusText = 'Due';
        var statusClass = 'status-due';

        // Check if tenant has a verified payment this month (matches dashboard logic)
        var hasPaid = verifiedPayments.some(function(p){
          return p.unit === t.unit && new Date(p.timestamp).getTime() >= currentMonthStart;
        });

        var gracePeriod = 1; // match dashboard's 1-day grace
        var dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
        var overdueThreshold = new Date(dueDate.getTime() + (gracePeriod * 24 * 60 * 60 * 1000));

        if(hasPaid){
          status = 'paid'; statusText = 'Paid'; statusClass = 'status-paid';
        } else if(now > overdueThreshold){
          status = 'overdue'; statusText = 'Overdue'; statusClass = 'status-overdue';
        } else if(currentDay >= dueDay - 3 && currentDay <= dueDay + gracePeriod){
          status = 'due-soon'; statusText = 'Due Soon'; statusClass = 'status-due';
        } else {
          status = 'paid'; statusText = 'On Track'; statusClass = 'status-paid';
        }

        var rent = t.leaseAmount || t.lease_amount || 0;
        html += '<div class="unit-card ' + status + '" data-action="openTenantProfile" data-args="' + (t.unit||'') + '" style="cursor:pointer;">';
        html += '<div class="unit-name">Unit ' + (t.unit||'?') + '</div>';
        html += '<div class="unit-tenant">' + (t.name||'Unknown') + '</div>';
        html += '<div class="unit-rent">' + currency + Number(rent).toLocaleString() + '</div>';
        html += '<div class="unit-status ' + statusClass + '">' + statusText + '</div>';
        html += '</div>';
      });

      for(var v = 0; v < totalUnits - occupied; v++){
        html += '<div class="unit-card vacant">';
        html += '<div class="unit-name">Vacant</div>';
        html += '<div class="unit-tenant">\u2014</div>';
        html += '<div class="unit-rent"></div>';
        html += '<div class="unit-status status-vacant">Available</div>';
        html += '</div>';
      }

      html += '</div></div>';
    });

    grid.innerHTML = html;
  }

  // Poll until propertyData is populated, then build and hook into refreshDashboard
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

  // Rebuild when navigating back to dashboard
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-action="showSection"]');
    if(el && el.dataset.args === 'dashboard'){
      setTimeout(buildPulseGrid, 150);
    }
  });
})();
