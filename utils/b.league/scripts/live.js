"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every club whose game is in progress. Hovering the dot shows the score,
 * the game clock and the latest play. Needs helpers.js, and standings.js to have drawn the tables
 * (each club is a .team[data-team] element). Remove this file's <script> tag and the standings keep working.
 *
 * Data: bleague.jp's own game pages read a small JSON feed from a public S3 bucket:
 *   .../v2_genius_contexts/{ScheduleKey}/latestid   a number, bumped about once a minute while a game is on
 *   .../v2_genius_contexts/{ScheduleKey}/{id}.json  the whole game so far: Game, PlayByPlays, boxscores
 * ScheduleKeys come from the schedule page. The bucket only answers to bleague.jp, so this goes through the proxy.
 *
 ****************************/
(() => {
	const SCHEDULE_URL = "https://www.bleague.jp/schedule/";
	const FEED_URL = "https://b-league.s3.amazonaws.com/web_json/v2_genius_contexts/";

	const DISCOVER_MS = 10 * 60 * 1000; // how often to re-read the schedule page for game ids
	const TICK_MS = 10000;              // how often to look at what is due
	const LIVE_POLL_MS = 20000;         // per game with a feed; the feed itself updates about once a minute
	const IDLE_POLL_MS = 60000;         // per game with no feed yet (not started)

	const games = new Map();   // ScheduleKey -> { id, data, next, ended }
	let activeDot = null;      // the dot whose overlay is open
	let cardHtml = "";         // what the overlay shows now, so unchanged updates don't redraw it
	let busy = false;

	const card = document.createElement("div");
	card.id = "live-card";
	card.className = "live-card";
	card.setAttribute("role", "tooltip");
	card.hidden = true;
	document.body.append(card);

	/****************************
	 * Feed
	 ****************************/
	async function discover() {
		const html = await fetchText(SCHEDULE_URL);
		if (!html) return;
		for (const match of html.matchAll(/ScheduleKey=(\d+)/g)) {
			if (!games.has(match[1])) games.set(match[1], { id: null, data: null, next: 0, ended: false });
		}
	}

	const isOver = (data) => Boolean(data.Game?.GameEndedFlg || data.PlayByPlays?.at(-1)?.GameEndRowFlg);
	const isLive = (data) => Boolean(data.PlayByPlays?.length) && !isOver(data);

	// Checks one game: read latestid (two bytes) and fetch the full snapshot only when the id moved.
	async function check(key, game) {
		const base = `${FEED_URL}${key}/`;
		const id = (await fetchText(base + "latestid"))?.trim();
		if (!/^\d+$/.test(id ?? "")) { // no feed yet: the game hasn't started
			game.next = Date.now() + IDLE_POLL_MS;
			return;
		}
		game.next = Date.now() + LIVE_POLL_MS;
		if (id === game.id) return;
		const data = await fetchJSON(`${base}${id}.json`);
		if (!data?.Game) return;
		game.id = id;
		game.data = data;
		if (isOver(data)) game.ended = true; // finished: stop polling it
	}

	async function tick() {
		if (busy || document.hidden) return;
		busy = true;
		try {
			const now = Date.now();
			const due = [...games].filter(([, game]) => !game.ended && now >= game.next);
			await Promise.all(due.map(([key, game]) => check(key, game)));
			refreshView();
		} finally {
			busy = false;
		}
	}

	/****************************
	 * Matching games to table rows
	 * A dot belongs to a club when the feed's short Japanese name (or full name) equals the table's.
	 ****************************/
	function gameFor(dot) {
		for (const game of games.values()) {
			if (!game.data || !isLive(game.data)) continue;
			const g = game.data.Game;
			const hit = (prefix) => g[prefix + "TeamShortNameJ"] === dot.dataset.team || g[prefix + "TeamNameJ"] === dot.dataset.club;
			if (hit("Home") || hit("Away")) return game.data;
		}
		return null;
	}

	function addDots() {
		for (const team of document.querySelectorAll(".team[data-team]")) {
			if (team.querySelector(".live")) continue;
			const dot = document.createElement("span");
			dot.className = "live";
			dot.dataset.team = team.dataset.team;
			dot.dataset.club = team.dataset.club;
			dot.tabIndex = 0;
			dot.setAttribute("role", "button");
			dot.setAttribute("aria-label", "live game: show score");
			dot.hidden = true;
			team.append(dot);
		}
	}

	function refreshView() {
		for (const dot of document.querySelectorAll(".live")) dot.hidden = !gameFor(dot);
		if (!activeDot) return;
		if (activeDot.hidden || !document.contains(activeDot)) closeCard(); // the game ended or the table redrew
		else renderCard(activeDot);
	}

	/****************************
	 * Formatting
	 ****************************/
	// 1-4 are quarters, then 1ot, 2ot…
	const periodLabel = (n) => (n <= 4 ? "q" + n : n - 4 + "ot");

	// "q3 7:41", "halftime", "end q1". The clock is as of the last feed update, so it can lag by up to a minute.
	function statusLabel(data) {
		const last = data.PlayByPlays.at(-1);
		const period = Number(data.Game.GameCurrentPeriod) || last.Period;
		if (last.PeriodEndRowFlg) return period === 2 ? "halftime" : "end " + periodLabel(period);
		return `${periodLabel(period)} ${last.RestTime}`;
	}

	// ActionCD1 meanings read off real feed rows. A code not listed here falls back to the feed's Japanese text.
	const PLAY_VERBS = {
		1: "makes a 3-pointer", 2: "misses a 3-pointer",
		3: "makes a 2-pointer", 4: "makes a 2-pointer", 5: "misses a 2-pointer", 6: "misses a 2-pointer",
		7: "makes a free throw", 8: "misses a free throw",
		9: "defensive rebound", 10: "offensive rebound",
		12: "assist", 13: "turnover", 14: "steal",
		17: "team turnover", 22: "personal foul"
	};
	const SHOT_STYLES = { 28: "layup", 29: "dunk" }; // ActionCD2 on two-point shots
	const POINTS = { 1: 3, 3: 2, 4: 2, 7: 1 };       // made shots only
	// Bookkeeping rows that make a dull "latest play": foul drawn, game/period start and end, clock, substitutions.
	const QUIET = new Set([15, 80, 81, 82, 83, 84, 85, 86, 87]);

	function latestPlay(data) {
		const rows = data.PlayByPlays;
		for (let i = rows.length - 1; i >= 0; i--) if (!QUIET.has(rows[i].ActionCD1)) return rows[i];
		return null;
	}

	function playText(row, data) {
		const verb = PLAY_VERBS[row.ActionCD1];
		if (!verb) return String(row.PlayText ?? "").trim();
		const style = SHOT_STYLES[row.ActionCD2];
		const text = style && [3, 4, 5, 6].includes(row.ActionCD1) ? verb.replace("2-pointer", style) : verb;
		const players = [...(data.HomeBoxscores ?? []), ...(data.AwayBoxscores ?? [])];
		const name = players.find((p) => p.PlayerID && p.PlayerID === row.PlayerID1)?.PlayerNameE || row.PlayerNameJ1;
		return [name, text].filter(Boolean).join(" ");
	}

	// The table already has each club's logo and nickname, so reuse them; fall back to the feed's own English name.
	function tableClub(g, prefix) {
		const short = g[prefix + "TeamShortNameJ"], full = g[prefix + "TeamNameJ"];
		const el = [...document.querySelectorAll(".team[data-team]")].find((t) => t.dataset.team === short || t.dataset.club === full);
		return {
			name: el?.querySelector(".name")?.textContent || g[prefix + "TeamShortNameE"],
			logo: el?.querySelector("img")?.getAttribute("src")
		};
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap, and redraws whenever new feed data arrives.
	 ****************************/
	function renderCard(dot) {
		const data = gameFor(dot);
		if (!data) return closeCard();
		const g = data.Game;
		const mineIsHome = g.HomeTeamShortNameJ === dot.dataset.team || g.HomeTeamNameJ === dot.dataset.club;

		// Left side reads logo, name, score; the right side mirrors it: score, name, logo.
		const side = (prefix, mirrored) => {
			const club = tableClub(g, prefix);
			const parts = [
				club.logo ? `<img class="logo" src="${esc(club.logo)}" alt="">` : "",
				`<span class="abbr">${esc(club.name)}</span>`,
				`<b>${esc(g[prefix + "TeamScore"] ?? "–")}</b>`
			];
			return `<span class="side">${(mirrored ? parts.reverse() : parts).join("")}</span>`;
		};

		const [mine, theirs] = mineIsHome ? ["Home", "Away"] : ["Away", "Home"];
		const row = latestPlay(data);
		let playHtml = "";
		if (row) {
			const text = playText(row, data);
			const when = `${periodLabel(row.Period)} ${row.RestTime}`;
			const points = row.Success === 1 && POINTS[row.ActionCD1] ? `<span class="pts">+${POINTS[row.ActionCD1]}</span>` : "";
			if (text) playHtml = `<div class="play"><div><span class="when">${esc(when)}</span>${esc(text)}${points}</div></div>`;
		}

		const html = `<div class="matchup">${side(mine)}<span class="sep">${mineIsHome ? "vs" : "@"}</span>${side(theirs, true)}</div>
			<div class="status">${esc(statusLabel(data))}</div>
			${playHtml}`;

		card.hidden = false;
		if (html === cardHtml) return; // nothing new; skip the redraw so images don't flicker
		cardHtml = html;
		card.innerHTML = html;
		positionCard();
	}

	function openCard(dot) {
		if (activeDot === dot) return;
		closeCard();
		activeDot = dot;
		dot.setAttribute("aria-describedby", card.id);
		renderCard(dot);
	}

	function closeCard() {
		activeDot?.removeAttribute("aria-describedby");
		activeDot = null;
		cardHtml = "";
		card.hidden = true;
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
		if (!document.hidden) tick(); // catch up straight away after the tab was in the background
	});
	// The standings redraw when something in them changes; put the dots back on the new rows.
	document.addEventListener("standings:rendered", () => {
		addDots();
		refreshView();
	});
	window.addEventListener("resize", positionCard);
	window.addEventListener("scroll", positionCard, { capture: true, passive: true }); // capture: the page scrolls inside <section>

	/****************************
	 * Start
	 ****************************/
	addDots(); // in case the tables are already there
	discover().then(tick);
	setInterval(discover, DISCOVER_MS);
	setInterval(tick, TICK_MS);
})();
