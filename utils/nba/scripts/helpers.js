"use strict";

/****************************
 *
 * Shared helpers
 * Plain functions used by standings.js and live.js. Load this file first.
 *
 ****************************/

const REQUEST_TIMEOUT_MS = 8000;

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
			const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
			if (res.ok) return await res.json();
		} catch (err) {
			console.warn("Request failed:", url, err);
		}
	}
	return null;
}
