// thanks to Dallas for refactoring this script
function update_date_time() {
	let d = new Date();
	document.getElementById("year").textContent = d.getFullYear();
	document.getElementById("month").textContent = String(d.getMonth() + 1).padStart(2, "0");
	document.getElementById("day").textContent = String(d.getDate()).padStart(2, "0");
	document.getElementById("hour").textContent = String(d.getHours()).padStart(2, "0");
	document.getElementById("minute").textContent = String(d.getMinutes()).padStart(2, "0");

	setTimeout(update_date_time, (60 - d.getSeconds()) * 1000 - d.getMilliseconds());
}
// Update date and time
update_date_time();
// Make the loading overlay invisible
document.getElementById("loading-overlay").style.display = "none";
// Every 60 seconds, update the date and time
setInterval(update_date_time, 60000);