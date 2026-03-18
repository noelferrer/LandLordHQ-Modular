// --- Pagination Component ---
import { ITEMS_PER_PAGE } from './api.js';

// Pagination containers that should be centre-aligned (grid/table views)
const CENTRE_ALIGNED_PAGINATION = new Set(['properties-pagination', 'tenants-pagination']);

export function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    let container = document.getElementById(containerId);
    if (!container) {
        const parentId = containerId === 'properties-pagination' ? 'properties-grid' : 'tenants-table-body';
        const parentElem = document.getElementById(parentId);
        if (parentElem) {
            const wrap = document.createElement('div');
            wrap.id = containerId;
            wrap.style.width = '100%';
            wrap.style.display = 'flex';
            wrap.style.justifyContent = 'center';
            wrap.style.padding = '20px 0';
            wrap.style.gap = '10px';
            if (parentId === 'properties-grid') {
                parentElem.parentNode.appendChild(wrap);
            } else if (parentId === 'tenants-table-body') {
                parentElem.parentNode.parentNode.appendChild(wrap);
            }
            container = wrap;
        } else {
            return;
        }
    }

    container.innerHTML = '';
    if (totalPages <= 1) return;

    container.style.display = 'flex';
    container.style.gap = '8px';
    container.style.marginTop = '16px';
    if (CENTRE_ALIGNED_PAGINATION.has(containerId)) {
        container.style.justifyContent = 'center';
        container.style.padding = '20px 0';
    } else {
        container.style.justifyContent = 'flex-end';
        container.style.padding = '8px 0 0 0';
    }

    const createBtn = (text, page, disabled, active) => {
        const btn = document.createElement('button');
        btn.className = `btn btn-outline ${active ? 'active' : ''}`;
        btn.innerText = text;
        btn.style.width = 'auto';
        btn.style.padding = '8px 16px';
        if (disabled) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.onclick = () => onPageChange(page);
        }
        if (active) {
            btn.style.background = 'var(--primary)';
            btn.style.color = '#fff';
            btn.style.borderColor = 'var(--primary)';
        }
        return btn;
    };

    container.appendChild(createBtn('Prev', currentPage - 1, currentPage === 1, false));

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            container.appendChild(createBtn(i, i, false, i === currentPage));
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            const dots = document.createElement('span');
            dots.innerText = '...';
            dots.style.padding = '8px';
            container.appendChild(dots);
        }
    }

    container.appendChild(createBtn('Next', currentPage + 1, currentPage === totalPages, false));
}

// Expose globally
window.renderPagination = renderPagination;
