"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every team whose game is in progress. Hovering the dot
 * shows the score and the latest play. Needs helpers.js, and standings.js to have
 * drawn the tables (each team is a .team[data-team] element). Remove this file's
 * <script> tag and the standings page works exactly as before.
 *
 ****************************/
(() => {
	const SCOREBOARD_URLS = [
		"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
		"https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
	];
	const summaryUrls = (eventId) => [
		`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${eventId}`,
		`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`
	];

	const LIVE_REFRESH_MS = 60000; // how often to check which teams are playing
	const CARD_REFRESH_MS = 5000;  // how often the open overlay updates

	const liveGames = new Map(); // team id -> scoreboard event, for games in progress
	let activeDot = null;        // the dot whose overlay is open
	let session = 0;             // bumped on every open and close, so stale polls stop themselves

	const card = document.createElement("div");
	card.id = "live-card";
	card.className = "live-card";
	card.setAttribute("role", "tooltip");
	card.hidden = true;
	document.body.append(card);

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	/****************************
	 * Dots
	 * One scoreboard request a minute marks the teams currently playing.
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
		const board = await getJSON(SCOREBOARD_URLS);
		if (!board) return; // keep what's showing if the request failed

		liveGames.clear();
		for (const event of board.events ?? []) {
			if (event.status?.type?.state !== "in") continue;
			for (const c of event.competitions?.[0]?.competitors ?? []) liveGames.set(String(c.team?.id), event);
		}

		for (const dot of document.querySelectorAll(".live")) dot.hidden = !liveGames.has(dot.dataset.team);

		// The game behind an open overlay may have just ended.
		if (activeDot?.hidden) closeCard();
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap. Shows the last scoreboard data straight away, then
	 * polls the game summary (score, clock and latest play) while it stays open.
	 ****************************/
	function openCard(dot) {
		if (activeDot === dot) return;
		closeCard();
		activeDot = dot;
		dot.setAttribute("aria-describedby", card.id);
		card.hidden = false;

		const event = liveGames.get(dot.dataset.team);
		if (event) renderCard(dot, event.competitions[0], event.status);
		poll(dot, ++session);
	}

	function closeCard() {
		session++;
		activeDot?.removeAttribute("aria-describedby");
		activeDot = null;
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
		const event = liveGames.get(dot.dataset.team);
		if (!event || document.hidden) return;

		const summary = await getJSON(summaryUrls(event.id));
		if (id !== session) return; // the overlay closed or moved on while the request ran

		const comp = summary?.header?.competitions?.[0] ?? event.competitions[0];
		renderCard(dot, comp, event.status, latestPlay(summary));
	}

	// ESPN lists plays oldest to newest; take the highest sequence number to be safe.
	function latestPlay(summary) {
		const plays = summary?.plays;
		if (!plays?.length) return null;
		const sequence = (p) => Number(p.sequenceNumber);
		return plays.reduce((a, b) => (sequence(b) > sequence(a) ? b : a), plays[plays.length - 1]);
	}

	function periodLabel(n) {
		if (n <= 4) return "q" + n;
		return n === 5 ? "ot" : (n - 4) + "ot";
	}

	function renderCard(dot, comp, fallbackStatus, play) {
		const me = comp.competitors.find((c) => String(c.team?.id) === dot.dataset.team);
		const opp = comp.competitors.find((c) => c !== me);
		if (!me || !opp) return;

		const label = (c) => c.team?.abbreviation || c.team?.shortDisplayName || c.team?.displayName;
		const side = (c) => `<span class="side">${esc(label(c))} <b>${esc(c.score ?? "–")}</b></span>`;
		const type = (comp.status ?? fallbackStatus)?.type;
		const detail = type?.shortDetail || type?.detail;

		let playHtml = "";
		if (play?.text) {
			const when = [play.period?.number && periodLabel(play.period.number), play.clock?.displayValue].filter(Boolean).join(" ");
			playHtml = `<div class="play${play.scoringPlay ? " scoring" : ""}">${when ? `<span class="when">${esc(when)}</span>` : ""}${esc(play.text)}</div>`;
		}

		card.innerHTML = `<div class="matchup">${side(me)}<span class="sep">${me.homeAway === "home" ? "vs" : "@"}</span>${side(opp)}</div>
			${detail ? `<div class="status">${esc(detail)}</div>` : ""}
			${playHtml}`;
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
	window.addEventListener("resize", positionCard);
	window.addEventListener("scroll", positionCard, { capture: true, passive: true }); // capture: the page scrolls inside <section>

	/****************************
	 * Start
	 ****************************/
	function start() {
		addDots();
		refreshLive();
		setInterval(refreshLive, LIVE_REFRESH_MS);
	}

	if (document.querySelector(".team[data-team]")) start();
	else document.addEventListener("standings:rendered", start, { once: true });
})();
