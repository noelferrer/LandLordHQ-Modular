// Dashboard greeting — time-of-day label + formatted date
(function(){
    var h = new Date().getHours();
    var label = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var now = new Date();
    var dateStr = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate();
    document.getElementById('dash-greeting-time-label').textContent = label;
    document.getElementById('dash-greeting-date').textContent = dateStr;
})();
