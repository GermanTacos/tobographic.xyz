"use strict";

/****************************
 *
 * Shared helpers
 * Plain functions used by standings.js and live.js. Load this file first.
 *
 ****************************/

// unrivaled.basketball (and Sportradar, for live games) don't send CORS headers, so every request goes through a proxy.
// Point this at a Cloudflare Worker like the bleague one. It must allow unrivaled.basketball and api.sportradar.com,
// and the worker should add the Sportradar api_key itself so the key never reaches the browser.
const PROXY = "https://hidden-sea-74d9.tiny-river-02cf.workers.dev/?url=";
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
		if (!res.ok) console.warn("Request failed:", res.status, url);
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