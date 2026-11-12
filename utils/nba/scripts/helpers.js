/****************************
 *
 * Shared helpers
 * Plain functions used by standings.js and live.js. Load this file first.
 *
 ****************************/

// Escapes text before it goes into an innerHTML template.
function esc(value) {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
	}[c]));
}

// Returns the JSON from the first URL that responds, or null if none do.
async function getJSON(urls) {
	for (const url of urls) {
		try {
			const res = await fetch(url, { cache: "no-store" });
			if (res.ok) return await res.json();
		} catch (err) {
			console.warn("Request failed:", url, err);
		}
	}
	return null;
}
