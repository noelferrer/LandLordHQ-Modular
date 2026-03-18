// --- App Entry Point (Baseplate) ---
// This file is the single script entry point loaded by dashboard.html.
// It imports all core utilities and feature modules, builds the module
// registry, and initialises the app.

// --- Core Utilities ---
import './core/api.js';
import './core/pagination.js';
import './core/confirmModal.js';
import './core/lightbox.js';
import './core/clock.js';
import { initNavigation } from './core/navigation.js';

// --- Feature Modules ---
import { DashboardModule } from './modules/dashboard.js';
import { PropertiesModule } from './modules/properties.js';
import { TenantsModule } from './modules/tenants.js';
import { FinanceModule } from './modules/finance.js';
import { SupportModule } from './modules/support.js';
import { SettingsModule } from './modules/settings.js';
import { DocsModule } from './modules/docs.js';
import { LogsModule } from './modules/logs.js';

// --- Module Registry ---
const appModules = [
    DashboardModule,
    PropertiesModule,
    TenantsModule,
    FinanceModule,
    SupportModule,
    SettingsModule,
    DocsModule,
    LogsModule,
].sort((a, b) => a.order - b.order);

// --- Initialize Navigation ---
initNavigation(appModules);

// --- Initialize App ---
async function init() {
    try {
        // Wait for auth check to complete before checking flags
        if (window._authReady) await window._authReady;

        // Sequential load to ensure data is available for dashboard metrics
        await window.refreshProperties();
        await window.refreshTenants();
        await window.refreshDashboard();

        // Inject Super Admin link if applicable
        if (window.isSuperAdmin) {
            const navLinks = document.querySelector('.nav-links');
            if (navLinks && !document.getElementById('nav-super')) {
                const superLink = document.createElement('a');
                superLink.id = 'nav-super';
                superLink.className = 'nav-item';
                superLink.href = '/super';
                superLink.style.textDecoration = 'none';
                superLink.innerHTML = `
                    <i class="fas fa-hammer" aria-hidden="true" style="color: var(--danger);"></i>
                    <span class="nav-label" style="color: var(--danger);">Super Hub</span>
                `;
                navLinks.appendChild(superLink);
            }
        }
    } catch (err) {
        console.error("Initial load refresh failed:", err);
    }
}

// Run init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Smart background refresh — pauses when tab is hidden (Page Visibility API)
function smartRefresh() {
    if (document.hidden) return;
    const activeId = document.querySelector('.content-section.active')?.id;
    if (activeId === 'dashboard-section' || activeId === 'support-section') {
        window.refreshDashboard();
    } else if (activeId === 'finance-section') {
        window.refreshFinanceHub();
        window.refreshDashboard();
    }
}
setInterval(smartRefresh, 10000);
