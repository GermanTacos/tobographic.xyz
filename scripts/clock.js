"use strict";

// thanks to Dallas for refactoring this script
const pad = (n) => String(n).padStart(2, "0");

function updateDateTime() {
	const d = new Date();
	const parts = {
		year: d.getFullYear(),
		month: pad(d.getMonth() + 1),
		day: pad(d.getDate()),
		hour: pad(d.getHours()),
		minute: pad(d.getMinutes())
	};
	for (const [id, value] of Object.entries(parts)) document.getElementById(id).textContent = value;

	// Wake up again right when the minute changes
	setTimeout(updateDateTime, (60 - d.getSeconds()) * 1000 - d.getMilliseconds());
}

updateDateTime();
