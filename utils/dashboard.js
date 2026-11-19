"use strict";

/****************************
 *
 * Standings dashboards: shared code
 * Used by the nba, b.league, mec and unrivaled pages. Load this file first, with the page's proxy (if it
 * needs one) on its own tag:
 *
 *   <script src="../dashboard.js" data-proxy="https://example.workers.dev/?url=" defer></script>
 *
 * A proxy is for feeds that don't send CORS headers: each request goes to data-proxy + the encoded URL.
 * Leave the attribute off to fetch directly. Provides the global `Dashboard`:
 *
 *   esc(value)            escapes text for an innerHTML template
 *   sleep(ms)             a promise that resolves after ms
 *   fetchText(url)        the body text, or null if the request failed
 *   getJSON(urlOrUrls)    the JSON of the first URL that works, or null
 *   addDots(copy)         a hidden .live dot after every .team[data-team] (copy: extra data-* names to carry over)
 *   createOverlay(hooks)  the score overlay: input, positioning, polling. See below.
 *
 ****************************/
const Dashboard = (() => {
	const proxy = document.currentScript?.dataset.proxy ?? "";
	const REQUEST_TIMEOUT_MS = 8000;

	const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
	const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	async function fetchText(url) {
		try {
			const res = await fetch(proxy ? proxy + encodeURIComponent(url) : url, {
				cache: "no-store",
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
			if (!res.ok) console.warn("Request failed:", res.status, url);
			return res.ok ? await res.text() : null;
		} catch (err) {
			console.warn("Request failed:", url, err);
			return null;
		}
	}

	// Tries each URL in order and returns the first usable JSON.
	async function getJSON(urls) {
		for (const url of [urls].flat()) {
			const text = await fetchText(url);
			if (text === null) continue;
			try {
				return JSON.parse(text);
			} catch (err) {
				console.warn("Bad JSON:", url, err);
			}
		}
		return null;
	}

	// Every team gets one dot, hidden until its game is live. The overlay finds a game through the
	// dot's data-team (plus whatever else the page asks to carry over).
	function addDots(copy = []) {
		for (const team of document.querySelectorAll(".team[data-team]")) {
			if (team.querySelector(".live")) continue;
			const dot = document.createElement("span");
			dot.className = "live";
			dot.dataset.team = team.dataset.team;
			for (const name of copy) dot.dataset[name] = team.dataset[name];
			dot.tabIndex = 0;
			dot.setAttribute("role", "button");
			dot.setAttribute("aria-label", "live game: show score");
			dot.hidden = true;
			team.append(dot);
		}
	}

	/****************************
	 * Score overlay
	 * One card, opened by hovering, focusing or tapping a live dot and closed by leaving it, Escape or a
	 * tap elsewhere. The page supplies the feed-specific parts:
	 *
	 *   open(dot)               called when the card opens for a dot; show what is already known
	 *   refresh(dot, current)   one poll round while it stays open. current() turns false once the card
	 *                           has closed or moved to another dot, so a slow response can drop itself
	 *   pollMs                  wait between rounds, counted from the end of the last one; 0 = no polling
	 *
	 * and calls overlay.draw(html) whenever it has something to show. Returns { card, dot, draw, position, close }.
	 ****************************/
	function createOverlay({ open, refresh, pollMs = 0 }) {
		const card = document.createElement("div");
		card.id = "live-card";
		card.className = "popup live-card";
		card.setAttribute("role", "tooltip");
		card.hidden = true;
		document.body.append(card);

		let activeDot = null; // the dot whose card is open
		let session = 0;      // bumped on every open and close, so stale polls stop themselves
		let drawn = "";       // what the card shows now, so unchanged updates don't redraw it

		function position() {
			if (!activeDot) return;
			const dot = activeDot.getBoundingClientRect();
			const box = card.getBoundingClientRect();
			const margin = 10;
			const left = Math.min(dot.left, window.innerWidth - box.width - margin);
			let top = dot.bottom + 8;
			if (top + box.height > window.innerHeight - margin) top = dot.top - box.height - 8;
			card.style.left = Math.max(margin, left) + "px";
			card.style.top = Math.max(margin, top) + "px";
		}

		// Returns true if the card changed, so the caller knows to wire up anything new inside it.
		function draw(html) {
			if (html === drawn) return false; // nothing new; skip the redraw so images don't flicker
			drawn = html;
			card.innerHTML = html;
			position();
			return true;
		}

		function close() {
			session++;
			activeDot?.removeAttribute("aria-describedby");
			activeDot = null;
			drawn = "";
			card.hidden = true;
		}

		// One request at a time: the next wait only starts once the last request has finished.
		async function poll(dot, id) {
			const current = () => id === session;
			while (current()) {
				try {
					await refresh(dot, current);
				} catch (err) {
					console.warn("Overlay update failed:", err); // keep polling; the next response may be fine
				}
				await sleep(pollMs);
			}
		}

		function openFor(dot) {
			if (activeDot === dot) return;
			close();
			activeDot = dot;
			dot.setAttribute("aria-describedby", card.id);
			open(dot);
			if (pollMs) poll(dot, ++session);
		}

		// Input is delegated on document: the dots are created after the page loads.
		const dotAt = (e) => e.target.closest?.(".live");
		const isTouch = (e) => e.pointerType === "touch";

		// Hover uses pointer events, not mouse events: after a tap, touch browsers replay
		// emulated mouse events (including a mouseout) that would close the card again.
		document.addEventListener("pointerover", (e) => {
			const dot = dotAt(e);
			if (dot && !isTouch(e)) openFor(dot);
		});
		document.addEventListener("pointerout", (e) => {
			const dot = dotAt(e);
			if (dot && !isTouch(e) && !dot.contains(e.relatedTarget)) close();
		});
		// Keyboard focus.
		document.addEventListener("focusin", (e) => {
			const dot = dotAt(e);
			if (dot) openFor(dot);
		});
		document.addEventListener("focusout", (e) => {
			const dot = dotAt(e);
			if (dot && !dot.contains(e.relatedTarget)) close();
		});
		// Touch has no hover: a tap opens the card, a tap anywhere else closes it.
		document.addEventListener("pointerdown", (e) => {
			const dot = dotAt(e);
			if (!dot) close();
			else if (isTouch(e)) openFor(dot);
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") close();
		});
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, { capture: true, passive: true }); // capture: the page scrolls inside <section>

		return { card, get dot() { return activeDot; }, draw, position, close };
	}

	return { esc, sleep, fetchText, getJSON, addDots, createOverlay };
})();
