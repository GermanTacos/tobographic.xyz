"use strict";

/****************************
 *
 * Easter egg
 * Recolors the live score overlay for a few seconds when a chosen player scores.
 * Fully self-contained: it never calls or edits the live script, it only watches #live-card, the overlay
 * that script already draws, and reads what it renders. Load it AFTER the live script. Remove its <script>
 * tag and everything is exactly as before. Each page sets the player and colors on the tag:
 *
 *   <script src="../egg.js" data-player="Sam Hauser" data-bg="#008248" data-accent="#ba9653" data-text="#ffffff" defer></script>
 *
 * data-player: any part of the name works: "Last", "First Last", "Last, First".
 *
 * Limits, by design:
 *  - The overlay only exists (and only updates) while a dot is hovered, focused or tapped, so the
 *    egg can only fire while the overlay is open.
 *  - It needs the player's name in the latest-play text. Until a feed has one, it stays silent.
 *
 ****************************/
(() => {
	const { player: PLAYER, bg = "#000000", accent = "#ffffff", text: textColor = "#ffffff" } = document.currentScript?.dataset ?? {};
	if (!PLAYER) return;

	const DURATION_MS = 6000; // how long the colors stay

	// Words in the play text that mean points were scored / not scored. Tune once real text is known.
	const SCORED = /\b(made|makes|good|scores?|scored)\b/i;
	const NOT_SCORED = /\b(miss|misses|missed|assist|rebound|foul|turnover|steal|block)/i;

	const tokens = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.split(/[^a-z0-9]+/).filter(Boolean);
	const wanted = tokens(PLAYER);
	const mentions = (text) => {
		const have = new Set(tokens(text));
		return wanted.length > 0 && wanted.every((t) => have.has(t));
	};

	// An element's text with a space between its pieces: the play's time tag sits right against the text
	// ("q3 4:12" + "Sam Hauser…"), and plain textContent would glue them into "12Sam".
	function textOf(el) {
		const parts = [];
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
		return parts.join(" ").replace(/\s+/g, " ").trim();
	}

	document.head.append(Object.assign(document.createElement("style"), {
		textContent: `
		#live-card.egg-on {
			background: ${bg} !important;
			color: ${textColor} !important;
			border-color: ${accent} !important;
			box-shadow: 0 0 0 2px ${accent}, 0 0 24px ${accent} !important;
			animation: egg-pulse .5s ease-in-out 3;
		}
		#live-card.egg-on b, #live-card.egg-on .pts, #live-card.egg-on .when, #live-card.egg-on .abbr {
			color: ${accent} !important;
		}
		@keyframes egg-pulse { 50% { transform: scale(1.04); } }
		@media (prefers-reduced-motion: reduce) { #live-card.egg-on { animation: none; } }`
	}));

	function init(card) {
		let armed = false;     // true once a first play has been seen after the overlay opened
		let lastSig = "";      // the play last looked at, so redraws of the same play don't re-fire
		let lastTotal = null;  // sum of both scores at the last render
		let timer = 0;

		const fire = () => {
			card.classList.add("egg-on");
			clearTimeout(timer);
			timer = setTimeout(() => card.classList.remove("egg-on"), DURATION_MS);
		};

		const reset = () => {
			armed = false;
			lastSig = "";
			lastTotal = null;
			clearTimeout(timer);
			card.classList.remove("egg-on");
		};

		function check() {
			if (card.hidden) return reset();

			const total = [...card.querySelectorAll(".matchup b")].reduce((n, b) => n + (parseInt(b.textContent, 10) || 0), 0);
			const prevTotal = lastTotal;
			lastTotal = total;

			const play = card.querySelector(".play");
			if (!play) return;
			const text = textOf(play);

			// The first play after opening is old news: remember it, don't react to it.
			if (!armed) { armed = true; lastSig = text; return; }
			if (text === lastSig) return;
			lastSig = text;

			if (!mentions(text)) return;
			const scored = Boolean(play.querySelector(".pts"))
				|| (SCORED.test(text) && !/\bmiss/i.test(text))
				|| (prevTotal !== null && total > prevTotal && !NOT_SCORED.test(text));
			console.info(`[egg] play mentions ${PLAYER}: "${text}" -> ${scored ? "fire" : "no score"}`);
			if (scored) fire();
		}

		new MutationObserver(check).observe(card, {
			childList: true, subtree: true, characterData: true,
			attributes: true, attributeFilter: ["hidden"]
		});

		window.eggTest = fire; // run eggTest() in the console (with the overlay open) to preview the colors
	}

	// The live script creates #live-card at load; wait for it if this script happens to run first.
	const existing = document.getElementById("live-card");
	if (existing) init(existing);
	else {
		const wait = new MutationObserver(() => {
			const card = document.getElementById("live-card");
			if (!card) return;
			wait.disconnect();
			init(card);
		});
		wait.observe(document.documentElement, { childList: true, subtree: true });
	}
})();
