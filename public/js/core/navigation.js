// --- Navigation Module ---
// Reads module definitions from registry to build dynamic sidebar

export function showSection(id, el) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${id}-section`).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.remove('active');
        i.removeAttribute('aria-current');
    });
    if (el) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
    }

    // Lookup module from registry for title/subtitle/tools
    const mod = (window._appModules || []).find(m => m.id === id);
    if (mod) {
        const headerIcon = document.getElementById('page-title-icon');
        if (headerIcon && mod.icon) headerIcon.className = mod.icon;
        document.getElementById('page-title-text').innerText = mod.titleText || mod.label;
        document.getElementById('page-subtitle-text').innerText = mod.subtitleText || '';

        const headerTools = document.querySelector('.header-tools');
        if (mod.headerTools) {
            headerTools.innerHTML = typeof mod.headerTools === 'function' ? mod.headerTools() : mod.headerTools;
        } else {
            headerTools.innerHTML = '';
        }

        if (mod.onActivate) mod.onActivate();
    }
}

export function initNavigation(modules) {
    window._appModules = modules;

    // Wire up sidebar nav items
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    navItems.forEach(item => {
        const sectionId = item.getAttribute('data-section');
        item.onclick = () => showSection(sectionId, item);
    });
}

// Expose globally
window.showSection = showSection;
