"use strict";

/****************************
 *
 * Shared helpers
 * Plain functions used by standings.js and live.js. Load this file first.
 *
 ****************************/

// mountaineast.org and data.ncaa.com don't send CORS headers, so every request goes through this Cloudflare Worker
// (worker.js in this folder). Replace the subdomain with yours after deploying.
const PROXY = "https://mec-proxy.tiny-river-02cf.workers.dev/?url=";
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

// Boils a school name down so the same school written differently by different sites compares equal:
// "West Virginia Wesleyan", "W.Va. Wesleyan" and "west-virginia-wesleyan" all become "wvwesleyan".
function norm(name) {
	return String(name ?? "")
		.toLowerCase()
		.replace(/[-_]/g, " ")
		.replace(/west virginia|w\.\s?va\.?|wva/g, "wv")
		.replace(/state/g, "st")
		.replace(/[^a-z]/g, "");
}