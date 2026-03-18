// --- Lightbox with Zoom & Pan ---

let currentScale = 1;
let isDragging = false;
let startX, startY;
let translateX = 0, translateY = 0;
let activeMedia = null;

export function openLightbox(type, src) {
    // Block dangerous URL schemes
    if (/^(javascript|data|vbscript):/i.test(String(src).trim())) return;

    const el = document.getElementById('lightbox-content');
    const controls = document.getElementById('lightbox-controls');
    currentScale = 1;
    translateX = 0;
    translateY = 0;

    const safeSrc = String(src).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    if (type === 'photo') {
        el.innerHTML = `<img id="zoom-img" src="${safeSrc}" alt="Full size" style="transform: translate(0px, 0px) scale(1);">`;
        activeMedia = document.getElementById('zoom-img');
        controls.style.display = 'flex';
        setupDragAndDrop();
    } else {
        el.innerHTML = `<video src="${safeSrc}" controls autoplay style="max-width:90vw; max-height:90vh; border-radius:12px;"></video>`;
        activeMedia = null;
        controls.style.display = 'none';
    }
    document.getElementById('lightbox').style.display = 'flex';
}

function zoomMedia(delta) {
    if (!activeMedia) return;
    currentScale += delta;
    if (currentScale < 0.5) currentScale = 0.5;
    if (currentScale > 5) currentScale = 5;
    updateMediaTransform();
}

function resetZoom() {
    if (!activeMedia) return;
    currentScale = 1;
    translateX = 0;
    translateY = 0;
    updateMediaTransform();
}

function updateMediaTransform() {
    if (activeMedia) {
        activeMedia.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
    }
}

function setupDragAndDrop() {
    if (!activeMedia) return;

    activeMedia.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoomMedia(delta);
    }, { passive: false });

    activeMedia.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        activeMedia.style.cursor = 'grabbing';
    });

    if (!window._lightboxEventsAdded) {
        window.addEventListener('mousemove', (e) => {
            if (!isDragging || !activeMedia) return;
            e.preventDefault();
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateMediaTransform();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            if (activeMedia) activeMedia.style.cursor = 'grab';
        });
        window._lightboxEventsAdded = true;
    }
}

export function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.getElementById('lightbox-content').innerHTML = '';
    document.getElementById('lightbox-controls').style.display = 'none';
    activeMedia = null;
}

// Expose globally
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.zoomMedia = zoomMedia;
window.resetZoom = resetZoom;
