// --- Theme Toggle (Light / Dark mode) ---
(function(){
    var KEY = 'landlordHQ_theme';

    function applyTheme(dark) {
        document.body.classList.toggle('dark', dark);
        // Also clean up the preload-dark class from <html>
        document.documentElement.classList.remove('preload-dark');
        document.querySelectorAll('.theme-toggle-track').forEach(function(t){
            t.classList.toggle('is-dark', dark);
        });
    }

    window.toggleTheme = function() {
        var isDark = !document.body.classList.contains('dark');
        applyTheme(isDark);
        localStorage.setItem(KEY, isDark ? 'dark' : 'light');
    };

    // Apply saved theme immediately (script loaded at end of body, DOM exists).
    applyTheme(localStorage.getItem(KEY) === 'dark');

    // Attach click directly to toggle element(s) with stopPropagation
    // so no other document-level listener can interfere.
    document.querySelectorAll('.theme-toggle-track').forEach(function(track) {
        track.onclick = function(e) {
            e.stopPropagation();
            e.preventDefault();
            window.toggleTheme();
        };
    });
})();
