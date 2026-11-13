"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every club whose game is in progress. Hovering the dot
 * shows the score, the game clock and the latest play. Needs helpers.js, and standings.js to have
 * drawn the table (each club is a .team[data-team] element). Remove this file's
 * <script> tag and the standings page works exactly as before.
 *
 * Data: Sportradar's Unrivaled API (the league's official feed; needs an API key, which the proxy adds).
 *   {SR}/games/{yyyy}/{mm}/{dd}/schedule.json   today's games and their status
 *   {SR}/games/{id}/pbp.json                    one game: score, periods, every play
 * The field names below follow Sportradar's documentation but haven't been checked against a live game.
 * Unrivaled has no games in the offseason, so nothing here can show up until the season starts.
 *
 ****************************/
(() => {
	const SR = "https://api.sportradar.com/unrivaled/trial/v8/en"; // "trial" becomes "production" with a paid key
	const scheduleUrl = () => {
		// The league's day is Eastern time.
		const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-");
		return `${SR}/games/${y}/${m}/${d}/schedule.json`;
	};
	const pbpUrl = (id) => `${SR}/games/${id}/pbp.json`;

	const LIVE_REFRESH_MS = 60000; // how often to check which clubs are playing
	const CARD_REFRESH_MS = 5000;  // how often the open overlay updates

	const liveGames = new Map(); // club slug -> { id, home, away }, for games in progress
	let activeDot = null;        // the dot whose overlay is open
	let session = 0;             // bumped on every open and close, so stale polls stop themselves
	let cardHtml = "";           // what the overlay shows now, so unchanged updates don't redraw it

	const card = document.createElement("div");
	card.id = "live-card";
	card.className = "live-card";
	card.setAttribute("role", "tooltip");
	card.hidden = true;
	document.body.append(card);

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	// Sportradar names a club like "Phantom BC" or "Lunar Owls BC"; the table keys clubs by slug ("lunar-owls").
	function slugOf(team) {
		const hay = `${team?.name ?? ""} ${team?.alias ?? ""}`.toLowerCase();
		return [...document.querySelectorAll(".team[data-team]")]
			.map((el) => el.dataset.team)
			.find((slug) => hay.includes(slug.replace(/-/g, " ")));
	}

	/****************************
	 * Dots
	 * One schedule request a minute marks the clubs currently playing.
	 ****************************/
	function addDots() {
		for (const team of document.querySelectorAll(".team[data-team]")) {
			if (team.querySelector(".live")) continue;
			const dot = document.createElement("span");
			dot.className = "live";
			dot.dataset.team = team.dataset.team;
			dot.tabIndex = 0;
			dot.setAttribute("role", "button");
			dot.setAttribute("aria-label", "live game: show score");
			dot.hidden = true;
			team.append(dot);
		}
	}

	async function refreshLive() {
		if (document.hidden) return;
		const schedule = await fetchJSON(scheduleUrl());
		if (!schedule) return; // keep what's showing if the request failed

		liveGames.clear();
		for (const game of schedule.games ?? []) {
			if (game.status !== "inprogress") continue;
			const entry = { id: game.id, home: slugOf(game.home), away: slugOf(game.away) };
			for (const slug of [entry.home, entry.away]) if (slug) liveGames.set(slug, entry);
		}

		for (const dot of document.querySelectorAll(".live")) dot.hidden = !liveGames.has(dot.dataset.team);

		// The game behind an open overlay may have just ended.
		if (activeDot?.hidden) closeCard();
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap, then polls the game's play-by-play (score, clock and latest play)
	 * while it stays open.
	 ****************************/
	function openCard(dot) {
		if (activeDot === dot) return;
		closeCard();
		activeDot = dot;
		dot.setAttribute("aria-describedby", card.id);
		card.hidden = false;
		poll(dot, ++session);
	}

	function closeCard() {
		session++;
		activeDot?.removeAttribute("aria-describedby");
		activeDot = null;
		cardHtml = "";
		card.hidden = true;
	}

	// One request at a time: the next wait only starts once the last request has finished.
	async function poll(dot, id) {
		while (id === session) {
			try {
				await refreshCard(dot, id);
			} catch (err) {
				console.warn("Overlay update failed:", err); // keep polling; the next response may be fine
			}
			await sleep(CARD_REFRESH_MS);
		}
	}

	async function refreshCard(dot, id) {
		const game = liveGames.get(dot.dataset.team);
		if (!game || document.hidden) return;

		const data = await fetchJSON(pbpUrl(game.id));
		if (id !== session || !data) return; // the overlay closed or moved on while the request ran
		renderCard(dot, game, data);
	}

	// Plays that make a dull "latest play": substitutions, timeouts, clock and period bookkeeping.
	const QUIET = /substitution|timeout|lineup|openinbound|endperiod|period|clock|review/i;

	// Sportradar lists plays oldest to newest within each period.
	function latestPlay(data) {
		for (const period of [...(data.periods ?? [])].reverse()) {
			const play = [...(period.events ?? [])].reverse().find((e) => e.description && !QUIET.test(e.event_type ?? ""));
			if (play) return { play, period };
		}
		return null;
	}

	/****************************
	 * Formatting
	 ****************************/
	// 1-4 are quarters; the fourth is replaced by the Elam ending, which has no clock.
	function periodLabel(period) {
		return period?.type === "elam" ? "elam" : "q" + period?.number;
	}

	// "q3 7:41", "elam"; the clock is the last play's.
	function statusLabel(data) {
		const period = data.periods?.at(-1);
		if (!period) return "";
		if (period.type === "elam") return "elam";
		const clock = period.events?.at(-1)?.clock;
		return clock ? `${periodLabel(period)} ${clock}` : periodLabel(period);
	}

	// The table already has every club's logo and code, so reuse them.
	const tableEl = (slug) => document.querySelector(`.team[data-team="${CSS.escape(String(slug))}"]`);

	/****************************
	 * Rendering
	 ****************************/
	function renderCard(dot, game, data) {
		const mineIsHome = game.home === dot.dataset.team;
		const [mine, theirs] = mineIsHome ? ["home", "away"] : ["away", "home"];

		// Left side reads logo, name, score; the right side mirrors it: score, name, logo.
		const side = (key, mirrored) => {
			const el = tableEl(game[key]);
			const logo = el?.querySelector("img")?.getAttribute("src");
			const parts = [
				logo ? `<img class="logo" src="${esc(logo)}" alt="">` : "",
				`<span class="abbr">${esc(el?.querySelector(".abbr")?.textContent || data[key]?.alias)}</span>`,
				`<b>${esc(data[key]?.points ?? "–")}</b>`
			];
			return `<span class="side">${(mirrored ? parts.reverse() : parts).join("")}</span>`;
		};

		const status = statusLabel(data);
		const latest = latestPlay(data);
		let playHtml = "";
		if (latest) {
			const { play, period } = latest;
			const when = [periodLabel(period), play.clock].filter(Boolean).join(" ");
			playHtml = `<div class="play"><div>${when ? `<span class="when">${esc(when)}</span>` : ""}${esc(play.description)}</div></div>`;
		}

		const html = `<div class="matchup">${side(mine)}<span class="sep">${mineIsHome ? "vs" : "@"}</span>${side(theirs, true)}</div>
			${status ? `<div class="status">${esc(status)}</div>` : ""}
			${playHtml}`;

		if (html === cardHtml) return; // nothing new; skip the redraw so images don't flicker
		cardHtml = html;
		card.innerHTML = html;
		positionCard();
	}

	function positionCard() {
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

	/****************************
	 * Input
	 * Delegated on document: the dots are created after the page loads.
	 ****************************/
	const dotAt = (e) => e.target.closest?.(".live");
	const isTouch = (e) => e.pointerType === "touch";

	// Hover uses pointer events, not mouse events: after a tap, touch browsers replay
	// emulated mouse events (including a mouseout) that would close the overlay again.
	document.addEventListener("pointerover", (e) => {
		const dot = dotAt(e);
		if (dot && !isTouch(e)) openCard(dot);
	});
	document.addEventListener("pointerout", (e) => {
		const dot = dotAt(e);
		if (dot && !isTouch(e) && !dot.contains(e.relatedTarget)) closeCard();
	});
	// Keyboard focus.
	document.addEventListener("focusin", (e) => {
		const dot = dotAt(e);
		if (dot) openCard(dot);
	});
	document.addEventListener("focusout", (e) => {
		const dot = dotAt(e);
		if (dot && !dot.contains(e.relatedTarget)) closeCard();
	});
	// Touch has no hover: a tap opens the overlay, a tap anywhere else closes it.
	document.addEventListener("pointerdown", (e) => {
		const dot = dotAt(e);
		if (!dot) closeCard();
		else if (isTouch(e)) openCard(dot);
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeCard();
	});
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refreshLive(); // catch up straight away after the tab was in the background
	});
	// The standings redraw when something in them changes; put the dots back on the new rows.
	document.addEventListener("standings:rendered", () => {
		addDots();
		refreshLive();
	});
	window.addEventListener("resize", positionCard);
	window.addEventListener("scroll", positionCard, { capture: true, passive: true }); // capture: the page scrolls inside <section>

	/****************************
	 * Start
	 ****************************/
	addDots(); // in case the table is already there
	if (document.querySelector(".team[data-team]")) refreshLive();
	setInterval(refreshLive, LIVE_REFRESH_MS);
})();
