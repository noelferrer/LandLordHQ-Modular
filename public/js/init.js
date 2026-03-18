// --- Early init: auth check + sidebar toggle (replaces inline <script> blocks) ---

// Security: Redirect to login if unauthenticated (cookie-based)
window._authReady = fetch('/api/auth/check', { credentials: 'include' })
    .then(r => {
        if (!r.ok) { window.location.replace('/login'); return; }
        return r.json();
    })
    .then(data => {
        if (data && data.admin) {
            window.isAdmin = true;
            if (data.admin.isSuperAdmin) {
                window.isSuperAdmin = true;
            }
        }
    })
    .catch(() => window.location.replace('/login'));

// Early logout handler (before module JS loads)
function getCsrfTokenEarly() {
    const match = document.cookie.match(/(?:^|;\s*)landlordhq_csrf=([^;]+)/);
    return match ? match[1] : '';
}

window.logout = function() {
    if (typeof window.openConfirmModal === 'function') {
        window.openConfirmModal('Logout', 'Are you sure you want to log out?', 'info', () => {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfTokenEarly() } })
                .finally(() => window.location.href = '/login');
        });
    } else {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': getCsrfTokenEarly() } })
            .finally(() => window.location.replace('/login'));
    }
};

// Sidebar toggle for mobile/tablet
window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
};

// Close sidebar when a nav item is clicked (mobile)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                document.getElementById('sidebar').classList.remove('mobile-open');
                document.getElementById('sidebar-overlay').classList.remove('active');
            }
        });
    });
});
