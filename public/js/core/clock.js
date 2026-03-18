// --- Live Clock ---
function updateLiveClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    const el = document.getElementById('live-time');
    if (el) el.innerText = timeStr;
    const elD = document.getElementById('live-date');
    if (elD) elD.innerText = dateStr;
}

setInterval(updateLiveClock, 1000);
updateLiveClock();
