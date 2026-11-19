"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every school whose game is in progress. Hovering the dot shows the score,
 * the game clock and, when the feed has one, the latest play. Needs helpers.js (norm) and dashboard.js, and standings.js to have
 * drawn the table (each school is a .team[data-team] element). Remove this file's <script> tag and the
 * standings page works exactly as before.
 *
 * Data: ncaa-api.henrygd.me, a community-run wrapper that mirrors ncaa.com's own paths (the NCAA's raw
 * data.ncaa.com/casablanca scoreboard returned 404 for D2 men's basketball):
 *   {NCAA}/scoreboard/basketball-men/d2/{yyyy}/{mm}/{dd}   the day's games and their state
 *   {NCAA}/game/{id}/play-by-play                          one game's play-by-play
 * UNVERIFIED: the field names below follow the feed's documented shape but haven't been checked against a live
 * MEC game, and the NCAA doesn't always have play-by-play for D2. Open the console during a game: every
 * live game is logged once, and a school that can't be matched to a table row is warned about.
 * The public instance allows 5 requests per second per IP; behind the worker's cache that's plenty, but it's
 * a free service with no promises, and the same code runs against a copy you host (docker: henrygd/ncaa-api)
 * by changing NCAA below and the allowlist in worker.js.
 * No games, no dots: in the offseason nothing here can show up.
 *
 ****************************/
(() => {
	const { esc, getJSON, addDots, createOverlay } = Dashboard;

	const NCAA = "https://ncaa-api.henrygd.me";
	const boardUrl = () => {
		// The feed's day is Eastern time.
		const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-");
		return `${NCAA}/scoreboard/basketball-men/d2/${y}/${m}/${d}`;
	};
	const pbpUrl = (id) => `${NCAA}/game/${id}/play-by-play`;

	const LIVE_REFRESH_MS = 60000; // how often to check which schools are playing
	const CARD_REFRESH_MS = 10000; // how often the open overlay updates

	const liveGames = new Map(); // school key -> { id, home, away, game }, for games in progress
	const logged = new Set();

	const overlay = createOverlay({ pollMs: CARD_REFRESH_MS, open: openCard, refresh: refreshCard });
	const card = overlay.card;

	// The feed names a side several ways ("short", "full", "seo", "char6"); the table keys schools by their
	// first norm() name and keeps every accepted spelling in data-match.
	const tableEl = (key) => document.querySelector(`.team[data-team="${CSS.escape(String(key))}"]`);
	function keyOf(side) {
		const names = Object.values(side?.names ?? {}).map(norm).filter(Boolean);
		for (const el of document.querySelectorAll(".team[data-team]")) {
			if (el.dataset.match.split("|").some((m) => names.includes(m))) return el.dataset.team;
		}
		return null;
	}

	/****************************
	 * Live schools
	 * One scoreboard request a minute marks the schools currently playing. The dots themselves are
	 * added by Dashboard.addDots(); this only shows and hides them.
	 ****************************/
	// Reads the scoreboard into liveGames. Returns false if the request failed.
	async function readBoard() {
		const board = await getJSON(boardUrl());
		if (!board) return false;

		liveGames.clear();
		for (const { game } of board.games ?? []) {
			if (!game || String(game.gameState).toLowerCase() !== "live") continue;
			const entry = { id: game.gameID, home: keyOf(game.home), away: keyOf(game.away), game };
			if (!logged.has(entry.id)) {
				logged.add(entry.id);
				console.info(`[live] game ${entry.id}: ${game.away?.names?.short} @ ${game.home?.names?.short}`, entry.home ? "" : "(home not in table)", entry.away ? "" : "(away not in table)");
			}
			for (const key of [entry.home, entry.away]) if (key) liveGames.set(key, entry);
		}
		return true;
	}

	async function refreshLive() {
		if (document.hidden) return;
		if (!(await readBoard())) return; // keep what's showing if the request failed

		for (const dot of document.querySelectorAll(".live")) dot.hidden = !liveGames.has(dot.dataset.team);

		// The game behind an open overlay may have just ended.
		if (overlay.dot?.hidden) overlay.close();
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap, then polls the scoreboard (score and clock) and the play-by-play
	 * (latest play) while it stays open.
	 ****************************/
	function openCard(dot) {
		card.hidden = false;
		const entry = liveGames.get(dot.dataset.team);
		if (entry) renderCard(dot, entry, null); // show the last scoreboard data straight away
	}

	async function refreshCard(dot, current) {
		if (document.hidden) return;
		const known = liveGames.get(dot.dataset.team);
		if (!known) return;

		const [, pbp] = await Promise.all([readBoard(), getJSON(pbpUrl(known.id))]);
		if (!current()) return; // the overlay closed or moved on while the request ran
		const entry = liveGames.get(dot.dataset.team);
		if (!entry) return overlay.close(); // the game ended
		renderCard(dot, entry, latestPlay(pbp));
	}

	// The play-by-play lists periods in order, each with its plays oldest to newest. Takes the last play that
	// has any text; a feed without play-by-play simply gives no play row.
	function latestPlay(pbp) {
		for (const period of [...(pbp?.periods ?? [])].reverse()) {
			for (const play of [...(period.playStats ?? [])].reverse()) {
				const text = tidy(play.homeText || play.visitorText || play.text);
				if (text) return { text, clock: play.time ?? play.clock ?? "", period: period.periodNumber ?? period.periodDisplay ?? "" };
			}
		}
		return null;
	}
	const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

	/****************************
	 * Formatting
	 ****************************/
	// The feed's own wording for the period ("1st", "2nd", "HALF", "OT"…), lowercased: "2nd 7:41", "halftime".
	// Whether the league plays halves or quarters this season is left to the feed rather than assumed here.
	function statusLabel(game) {
		const period = tidy(game.currentPeriod).toLowerCase();
		if (!period) return "";
		if (/^half/.test(period)) return "halftime";
		const clock = tidy(game.contestClock);
		return clock ? `${period} ${clock}` : period;
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderCard(dot, entry, play) {
		const { game } = entry;
		const mineIsHome = entry.home === dot.dataset.team;
		const [mine, theirs] = mineIsHome ? ["home", "away"] : ["away", "home"];

		// Left side reads logo, name, score; the right side mirrors it: score, name, logo.
		// The table already has every school's logo and code, so reuse them; fall back to the feed's own name.
		const side = (key, mirrored) => {
			const el = tableEl(entry[key]);
			const logo = el?.querySelector("img")?.getAttribute("src");
			const parts = [
				logo ? `<img class="logo" src="${esc(logo)}" alt="">` : "",
				`<span class="abbr">${esc(el?.querySelector(".abbr")?.textContent || game[key]?.names?.char6 || game[key]?.names?.short)}</span>`,
				`<b>${esc(game[key]?.score ?? "–")}</b>`
			];
			return `<span class="side">${(mirrored ? parts.reverse() : parts).join("")}</span>`;
		};

		const status = statusLabel(game);
		let playHtml = "";
		if (play) {
			const when = [play.period && String(play.period).toLowerCase(), play.clock].filter(Boolean).join(" ");
			playHtml = `<div class="play"><div>${when ? `<span class="when">${esc(when)}</span>` : ""}${esc(play.text.toLowerCase())}</div></div>`;
		}

		const html = `<div class="matchup">${side(mine)}<span class="sep">${mineIsHome ? "vs" : "@"}</span>${side(theirs, true)}</div>
			${status ? `<div class="status">${esc(status)}</div>` : ""}
			${playHtml}`;

		overlay.draw(html);
	}

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refreshLive(); // catch up straight away after the tab was in the background
	});
	// The standings redraw when something in them changes; put the dots back on the new rows.
	document.addEventListener("standings:rendered", () => {
		addDots();
		refreshLive();
	});
	/****************************
	 * Start
	 ****************************/
	addDots(); // in case the table is already there
	if (document.querySelector(".team[data-team]")) refreshLive();
	setInterval(refreshLive, LIVE_REFRESH_MS);
})();