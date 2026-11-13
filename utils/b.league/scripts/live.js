"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every club whose game is in progress. Hovering the dot shows the score,
 * the game clock and the latest play. Needs helpers.js, and standings.js to have drawn the tables
 * (each club is a .team[data-team] element). Remove this file's <script> tag and the standings page
 * works exactly as before.
 *
 * Data: bleague.jp's own game pages read a small JSON feed from a public S3 bucket:
 *   {FEED_URL}{ScheduleKey}/latestid    a number, bumped about once a minute while a game is on
 *   {FEED_URL}{ScheduleKey}/{id}.json   the whole game so far: Game, PlayByPlays, box scores
 * The ScheduleKeys come from the schedule page.
 *
 ****************************/
(() => {
	const SCHEDULE_URL = "https://www.bleague.jp/schedule/";
	const FEED_URL = "https://b-league.s3.amazonaws.com/web_json/v2_genius_contexts/";

	const DISCOVER_MS = 600000; // how often to re-read the schedule page for game ids
	const TICK_MS = 10000;      // how often to look at which games are due
	const LIVE_POLL_MS = 20000; // per game with a feed (the feed itself updates about once a minute)
	const IDLE_POLL_MS = 60000; // per game with no feed yet, i.e. not started

	const games = new Map();      // ScheduleKey -> { id, data, next, ended }
	const clubs = new Map();      // short or full Japanese club name -> its .team element in the table
	const liveByClub = new Map(); // the same names -> the feed data of that club's game in progress
	let activeDot = null;         // the dot whose overlay is open
	let cardHtml = "";            // what the overlay shows now, so unchanged updates don't redraw it
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
		for (const [, key] of html?.matchAll(/ScheduleKey=(\d+)/g) ?? []) {
			if (!games.has(key)) games.set(key, { id: null, data: null, next: 0, ended: false });
		}
	}

	const isOver = (data) => Boolean(data.Game.GameEndedFlg || data.PlayByPlays.at(-1)?.GameEndRowFlg);

	// Reads latestid (two bytes) and fetches the full snapshot only when the id moved.
	async function check(key, game) {
		const id = (await fetchText(`${FEED_URL}${key}/latestid`))?.trim();
		if (!/^\d+$/.test(id ?? "")) { // no feed yet: the game hasn't started
			game.next = Date.now() + IDLE_POLL_MS;
			return;
		}
		game.next = Date.now() + LIVE_POLL_MS;
		if (id === game.id) return;
		const data = await fetchJSON(`${FEED_URL}${key}/${id}.json`);
		if (!data?.Game || !data.PlayByPlays) return;
		Object.assign(game, { id, data, ended: isOver(data) }); // a finished game stops being polled
	}

	async function tick() {
		if (busy || document.hidden) return;
		busy = true;
		const now = Date.now();
		const due = [...games].filter(([, game]) => !game.ended && now >= game.next);
		try {
			await Promise.all(due.map(([key, game]) => check(key, game)));
			refreshView();
		} finally {
			busy = false;
		}
	}

	/****************************
	 * Dots
	 * A game is live once it has plays and hasn't ended. It belongs to a club when the feed's short
	 * Japanese name (or full name) equals the table's.
	 ****************************/
	const liveData = (el) => liveByClub.get(el.dataset.team) ?? liveByClub.get(el.dataset.club);

	function addDots() {
		clubs.clear();
		for (const team of document.querySelectorAll(".team[data-team]")) {
			clubs.set(team.dataset.team, team).set(team.dataset.club, team);
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
		liveByClub.clear();
		for (const { data, ended } of games.values()) {
			if (!data || ended || !data.PlayByPlays.length) continue;
			for (const side of ["Home", "Away"]) {
				liveByClub.set(data.Game[side + "TeamShortNameJ"], data).set(data.Game[side + "TeamNameJ"], data);
			}
		}
		for (const dot of document.querySelectorAll(".live")) dot.hidden = !liveData(dot);

		if (!activeDot) return;
		// The game behind an open overlay may have just ended, or the table may have redrawn under it.
		if (activeDot.hidden || !activeDot.isConnected) closeCard();
		else renderCard(activeDot);
	}

	/****************************
	 * Formatting
	 ****************************/
	// 1-4 are quarters, then 1ot, 2ot, 3ot…
	function periodLabel(n) {
		return n <= 4 ? "q" + n : (n - 4) + "ot";
	}

	// The same shape as the play tags: "q3 7:41", "halftime", "end q1". The clock is as of the last feed update.
	function statusLabel(data) {
		const last = data.PlayByPlays.at(-1);
		const period = Number(data.Game.GameCurrentPeriod) || last.Period;
		if (last.PeriodEndRowFlg) return period === 2 ? "halftime" : "end " + periodLabel(period);
		return `${periodLabel(period)} ${last.RestTime}`;
	}

	// What each ActionCD1 means, read off real feed rows. A code not listed here falls back to the feed's Japanese text.
	const PLAY_VERBS = {
		1: "makes a 3-pointer", 2: "misses a 3-pointer",
		3: "makes a 2-pointer", 4: "makes a 2-pointer", 5: "misses a 2-pointer", 6: "misses a 2-pointer",
		7: "makes a free throw", 8: "misses a free throw",
		9: "defensive rebound", 10: "offensive rebound",
		12: "assist", 13: "turnover", 14: "steal",
		17: "team turnover", 22: "personal foul"
	};
	const SHOT_STYLES = { 28: "layup", 29: "dunk" }; // ActionCD2 on two-point shots
	const POINTS = { 1: 3, 3: 2, 4: 2, 7: 1 };       // made shots
	// Bookkeeping rows that make a dull "latest play": foul drawn, game and period start and end, clock, substitutions.
	const QUIET = new Set([15, 80, 81, 82, 83, 84, 85, 86, 87]);

	// The feed lists plays oldest to newest.
	function latestPlay(data) {
		return data.PlayByPlays.findLast((row) => !QUIET.has(row.ActionCD1)) ?? null;
	}

	function playText(row, data) {
		const verb = PLAY_VERBS[row.ActionCD1];
		if (!verb) return String(row.PlayText ?? "").trim();
		const shot = SHOT_STYLES[row.ActionCD2];
		const player = [...data.HomeBoxscores, ...data.AwayBoxscores].find((p) => p.PlayerID && p.PlayerID === row.PlayerID1);
		return [player?.PlayerNameE || row.PlayerNameJ1, shot && row.ActionCD1 >= 3 && row.ActionCD1 <= 6 ? verb.replace("2-pointer", shot) : verb]
			.filter(Boolean).join(" ");
	}

	/****************************
	 * Rendering
	 * Opens on hover, focus or tap, and redraws whenever new feed data arrives.
	 ****************************/
	function renderCard(dot) {
		const data = liveData(dot);
		if (!data) return closeCard();
		const g = data.Game;
		const mineIsHome = g.HomeTeamShortNameJ === dot.dataset.team || g.HomeTeamNameJ === dot.dataset.club;

		// Left side reads logo, name, score; the right side mirrors it: score, name, logo.
		// The table already has every club's logo and code, so reuse them; fall back to the feed's own name.
		const side = (prefix, mirrored) => {
			const el = clubs.get(g[prefix + "TeamShortNameJ"]) ?? clubs.get(g[prefix + "TeamNameJ"]);
			const logo = el?.querySelector("img")?.getAttribute("src");
			const parts = [
				logo ? `<img class="logo" src="${esc(logo)}" alt="">` : "",
				`<span class="abbr">${esc(el?.querySelector(".abbr")?.textContent || g[prefix + "TeamShortNameE"])}</span>`,
				`<b>${esc(g[prefix + "TeamScore"] ?? "–")}</b>`
			];
			return `<span class="side">${(mirrored ? parts.reverse() : parts).join("")}</span>`;
		};

		const [mine, theirs] = mineIsHome ? ["Home", "Away"] : ["Away", "Home"];
		const row = latestPlay(data);
		const text = row && playText(row, data);
		let playHtml = "";
		if (text) {
			const number = row.PlayerNo1 ? `<span class="num">${esc(row.PlayerNo1)}</span>` : "";
			const points = row.Success === 1 && POINTS[row.ActionCD1] ? `<span class="pts">+${POINTS[row.ActionCD1]}</span>` : "";
			playHtml = `<div class="play">${number}<div><span class="when">${esc(periodLabel(row.Period))} ${esc(row.RestTime)}</span>${esc(text)}${points}</div></div>`;
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
