"use strict";

/****************************
 *
 * Shared helpers
 * Used by standings.js and live.js. Load this file first.
 *
 ****************************/

// bleague.jp and its data bucket only allow cross-origin reads from bleague.jp itself, so requests go through your
// own proxy (the Cloudflare Worker). Paste its address here. With no proxy, requests go straight out and will fail.
const PROXIES = [
	(url) => "https://bleague-proxy.tiny-river-02cf.workers.dev/?url=" + encodeURIComponent(url)
];
const REQUEST_TIMEOUT_MS = 8000;

// Escapes text before it goes into an innerHTML template.
function esc(value) {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
	}[c]));
}

// Returns the body text of the first request that succeeds, or null.
async function fetchText(url) {
	const urls = PROXIES.length ? PROXIES.map((proxy) => proxy(url)) : [url];
	for (const target of urls) {
		try {
			const res = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
			if (res.ok) return await res.text();
		} catch (err) {
			console.warn("Request failed:", url, err);
		}
	}
	return null;
}

async function fetchJSON(url) {
	const text = await fetchText(url);
	try {
		return text ? JSON.parse(text) : null;
	} catch (err) {
		console.warn("Bad JSON:", url, err);
		return null;
	}
}
