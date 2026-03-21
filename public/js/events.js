// --- Event Delegation (replaces all inline onclick/onkeydown/onsubmit handlers) ---
// This file must be loaded AFTER app.js sets up window.* functions

document.addEventListener('DOMContentLoaded', () => {

    // --- Click delegation ---
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;

        const action = el.dataset.action;
        const args = el.dataset.args ? el.dataset.args.split('|') : [];

        switch (action) {
            // Navigation
            case 'showSection':
                window.showSection(args[0], el);
                break;
            case 'showSectionNav':
                window.showSection(args[0], document.querySelectorAll('.nav-item')[parseInt(args[1])]);
                window.scrollTo(0, 0);
                e.preventDefault();
                break;

            // Sidebar
            case 'toggleSidebar':
                window.toggleSidebar();
                break;

            // Theme
            case 'toggleTheme':
                window.toggleTheme();
                break;

            // Auth
            case 'logout':
                window.logout();
                break;

            // Sorting
            case 'sortTenants':
                window.sortTenants(args[0]);
                break;
            case 'sortResolvedTickets':
                window.sortResolvedTickets(args[0]);
                break;
            case 'sortFinanceTable':
                window.sortFinanceTable(args[0], args[1]);
                break;

            // Settings
            case 'saveSettings':
                window.saveSettings();
                break;

            // Logs pagination
            case 'changeLogsPage':
                window.changeLogsPage(parseInt(args[0]));
                break;

            // Lightbox
            case 'closeLightbox':
                window.closeLightbox();
                break;
            case 'zoomMedia':
                window.zoomMedia(parseFloat(args[0]));
                break;
            case 'resetZoom':
                window.resetZoom();
                break;

            // Modals
            case 'closePropertyModal':
                window.closePropertyModal();
                break;
            case 'closeTenantModal':
                window.closeTenantModal();
                break;
            case 'closeConfirmModal':
                window.closeConfirmModal();
                break;
            case 'closePaymentModal':
                window.closePaymentModal();
                break;
            case 'closeVerifyPaymentModal':
                window.closeVerifyPaymentModal();
                break;
            case 'closeExpenseModal':
                window.closeExpenseModal();
                break;

            // Properties
            case 'showSection-back': {
                const targetNav = document.querySelector(`.nav-item[data-action="showSection"][data-args="${args[0]}"]`);
                window.showSection(args[0], targetNav);
                break;
            }

            // Generate invite (super.html)
            case 'generateInvite':
                window.generateInvite();
                break;

            // Dynamic content actions
            case 'openAddPropertyModal': window.openAddPropertyModal(); break;
            case 'openAddTenantModal': window.openAddTenantModal(); break;
            case 'openExpenseModal': window.openExpenseModal(); break;
            case 'openManualPaymentModal': window.openManualPaymentModal(); break;
            case 'editTenant': window.editTenant(args[0]); break;
            case 'deleteTenant': window.deleteTenant(args[0]); break;
            case 'openTenantProfile': window.openTenantProfile(args[0]); break;
            case 'showPropertyDetail': window.showPropertyDetail(args[0]); break;
            case 'editProperty': window.editProperty(args[0]); break;
            case 'deleteProperty': window.deleteProperty(args[0]); break;
            case 'openLightbox': window.openLightbox(el.dataset.type, el.dataset.src); break;
            case 'verifyPayment': window.verifyPayment(el.dataset.unit, el.dataset.id); break;
            case 'deletePayment': window.deletePayment(el.dataset.id, el.dataset.name); break;
            case 'deleteExpense': window.deleteExpense(el.dataset.id, el.dataset.name); break;
            case 'triggerRentCheck': window.triggerRentCheck(args[0]); break;
        }
    });

    // --- Change delegation (for checkboxes with data-action) ---
    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        if (el.dataset.action === 'handleTicketCheck') {
            window.handleTicketCheck(el, el.dataset.ticketId, el.dataset.field);
        }
    });

    // --- Keyboard accessibility delegation ---
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest('[data-action="showSection"]');
        if (el) {
            e.preventDefault();
            window.showSection(el.dataset.args, el);
        }
    });
});
