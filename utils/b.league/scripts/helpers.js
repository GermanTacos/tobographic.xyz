"use strict";

/****************************
 *
 * Shared helpers
 * Plain functions used by standings.js and live.js. Load this file first.
 *
 ****************************/

// bleague.jp and its game-data bucket only answer to bleague.jp itself, so every request goes through this proxy.
const PROXY = "https://bleague-proxy.tiny-river-02cf.workers.dev/?url=";
const REQUEST_TIMEOUT_MS = 8000;

// Escapes text before it goes into an innerHTML template.
function esc(value) {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
	}[c]));
}

// Returns the body text of a URL, or null if the request failed.
async function fetchText(url) {
	try {
		const res = await fetch(PROXY + encodeURIComponent(url), { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		return res.ok ? await res.text() : null;
	} catch (err) {
		console.warn("Request failed:", url, err);
		return null;
	}
}

// Returns the parsed JSON of a URL, or null if the request or the parsing failed.
async function fetchJSON(url) {
	try {
		return JSON.parse(await fetchText(url));
	} catch {
		return null;
	}
}
