"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every club whose game is in progress. Hovering the dot shows the score,
 * the game clock and the latest play. Needs dashboard.js, and standings.js to have drawn the tables
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
	const { esc, fetchText, getJSON, addDots, createOverlay } = Dashboard;

	const SCHEDULE_URL = "https://www.bleague.jp/schedule/";
	const FEED_URL = "https://b-league.s3.amazonaws.com/web_json/v2_genius_contexts/";

	const DISCOVER_MS = 600000; // how often to re-read the schedule page for game ids
	const TICK_MS = 10000;      // how often to look at which games are due
	const LIVE_POLL_MS = 20000; // per game with a feed (the feed itself updates about once a minute)
	const IDLE_POLL_MS = 60000; // per game with no feed yet, i.e. not started

	// Headshots live at .../roster/{TeamID}/{season}/{PlayerID}_03.png. The feed's TeamID and PlayerID match the site's.
	// "v=" is a cache-busting stamp that differs per image; this assumes the image host ignores its value.
	const PHOTO_URL = "https://bleague.bl.kuroco-img.app/v=1789592915/files/user/roster/";

	const games = new Map();      // ScheduleKey -> { id, data, next, ended }
	const clubs = new Map();      // short or full Japanese club name -> its .team element in the table
	const liveByClub = new Map(); // the same names -> the feed data of that club's game in progress
	let busy = false;

	// No polling: the feed updates are pushed in by tick(), which redraws the open card.
	const overlay = createOverlay({ open: renderCard });
	const card = overlay.card;

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

	// Logs a game's state once per change, so the console shows why a dot is or isn't there.
	function note(key, game, state, detail = "") {
		if (game.state === state) return;
		game.state = state;
		console.info(`[live] game ${key}: ${state} ${detail}`.trim());
	}

	// Reads latestid (two bytes) and fetches the full snapshot only when the id moved.
	async function check(key, game) {
		const id = (await fetchText(`${FEED_URL}${key}/latestid`))?.trim();
		if (!/^\d+$/.test(id ?? "")) { // no feed yet: the game hasn't started
			game.next = Date.now() + IDLE_POLL_MS;
			note(key, game, "no feed", `(latestid: ${JSON.stringify(id ?? null)})`);
			return;
		}
		game.next = Date.now() + LIVE_POLL_MS;
		if (id === game.id) return;
		const data = await getJSON(`${FEED_URL}${key}/${id}.json`);
		if (!data?.Game || !data.PlayByPlays) return;
		Object.assign(game, { id, data, ended: isOver(data) }); // a finished game stops being polled
		const g = data.Game;
		note(key, game, game.ended ? "ended" : data.PlayByPlays.length ? "live" : "no plays yet", `(${g.HomeTeamShortNameJ} vs ${g.AwayTeamShortNameJ})`);
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
	 * Live clubs
	 * A game is live once it has plays and hasn't ended. It belongs to a club when the feed's short
	 * Japanese name (or full name) equals the table's.
	 ****************************/
	const liveData = (el) => liveByClub.get(el.dataset.team) ?? liveByClub.get(el.dataset.club);

	function addClubDots() {
		clubs.clear();
		for (const team of document.querySelectorAll(".team[data-team]")) clubs.set(team.dataset.team, team).set(team.dataset.club, team);
		addDots(["club"]);
	}

	function refreshView() {
		liveByClub.clear();
		for (const { data, ended } of games.values()) {
			if (!data || ended || !data.PlayByPlays.length) continue;
			for (const side of ["Home", "Away"]) {
				const short = data.Game[side + "TeamShortNameJ"], full = data.Game[side + "TeamNameJ"];
				liveByClub.set(short, data).set(full, data);
				if (clubs.size && !clubs.has(short) && !clubs.has(full)) console.warn("[live] no table row for", short, full);
			}
		}
		for (const dot of document.querySelectorAll(".live")) dot.hidden = !liveData(dot);

		const open = overlay.dot;
		if (!open) return;
		// The game behind an open overlay may have just ended, or the table may have redrawn under it.
		if (open.hidden || !open.isConnected) overlay.close();
		else renderCard(open);
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

	const playerOf = (data, id) => (id ? [...data.HomeBoxscores, ...data.AwayBoxscores].find((p) => p.PlayerID === id) : null);

	function playText(row, data) {
		const verb = PLAY_VERBS[row.ActionCD1];
		if (!verb) return String(row.PlayText ?? "").trim();
		const shot = SHOT_STYLES[row.ActionCD2];
		return [playerOf(data, row.PlayerID1)?.PlayerNameE || row.PlayerNameJ1, shot && row.ActionCD1 >= 3 && row.ActionCD1 <= 6 ? verb.replace("2-pointer", shot) : verb]
			.filter(Boolean).join(" ");
	}

	// The season folder comes from the game's date: 2026-27 runs from July 2026 to June 2027.
	function headshotUrl(player, data) {
		const date = new Date(Number(/\d+/.exec(data.Game.GameDateTime)?.[0]));
		if (!player?.TeamID || isNaN(date)) return "";
		const start = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
		return `${PHOTO_URL}${player.TeamID}/${start}-${String((start + 1) % 100).padStart(2, "0")}/${player.PlayerID}_03.png`;
	}

	/****************************
	 * Rendering
	 * Opens on hover, focus or tap, and redraws whenever new feed data arrives.
	 ****************************/
	function renderCard(dot) {
		const data = liveData(dot);
		if (!data) return overlay.close();
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
			const photo = headshotUrl(playerOf(data, row.PlayerID1), data);
			const number = row.PlayerNo1 ? `<span class="num">${esc(row.PlayerNo1)}${photo ? `<img src="${esc(photo)}" alt="">` : ""}</span>` : "";
			const points = row.Success === 1 && POINTS[row.ActionCD1] ? `<span class="pts">+${POINTS[row.ActionCD1]}</span>` : "";
			playHtml = `<div class="play">${number}<div><span class="when">${esc(periodLabel(row.Period))} ${esc(row.RestTime)}</span>${esc(text)}${points}</div></div>`;
		}

		const html = `<div class="matchup">${side(mine)}<span class="sep">${mineIsHome ? "vs" : "@"}</span>${side(theirs, true)}</div>
			<div class="status">${esc(statusLabel(data))}</div>
			${playHtml}`;

		card.hidden = false;
		if (!overlay.draw(html)) return;
		// Not every player has a photo: drop the image rather than show a broken one; the jersey number stays underneath.
		card.querySelector(".num img")?.addEventListener("error", (e) => e.target.remove(), { once: true });
	}

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) tick(); // catch up straight away after the tab was in the background
	});
	// The standings redraw when something in them changes; put the dots back on the new rows.
	document.addEventListener("standings:rendered", () => {
		addClubDots();
		refreshView();
	});

	/****************************
	 * Start
	 ****************************/
	addClubDots(); // in case the tables are already there
	discover().then(tick);
	setInterval(discover, DISCOVER_MS);
	setInterval(tick, TICK_MS);
})();
