// --- Core API Utilities ---
// Shared across all modules

export const API_URL = '/api';

// Global state - accessible by all modules
window.tenantData = [];
window.propertyData = [];
window.appSettings = {};

const ITEMS_PER_PAGE = 10;
export { ITEMS_PER_PAGE };

// --- CSRF Helper ---
export function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)landlordhq_csrf=([^;]+)/);
    return match ? match[1] : '';
}

export function csrfHeaders() {
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() };
}

// --- XSS Sanitizer ---
export function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// Escape for use inside single-quoted HTML attributes (onclick, etc.)
export function escAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Auth check and logout are handled in init.js (loaded earlier in <head>)

// Expose to window
window.getCsrfToken = getCsrfToken;
window.csrfHeaders = csrfHeaders;
window.esc = esc;
window.escAttr = escAttr;
