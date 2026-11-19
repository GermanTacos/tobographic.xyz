"use strict";

/****************************
 *
 * Live games
 * Adds a pulsing dot next to every team whose game is in progress. Hovering the dot
 * shows the score and the latest play. Needs dashboard.js, and standings.js to have
 * drawn the tables (each team is a .team[data-team] element). Remove this file's
 * <script> tag and the standings page works exactly as before.
 *
 ****************************/
(() => {
	const { esc, getJSON, addDots, createOverlay } = Dashboard;

	const SCOREBOARD_URLS = [
		"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
		"https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
	];
	const summaryUrls = (eventId) => [
		`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=${eventId}`,
		`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`
	];
	const HEADSHOT_URL = "https://a.espncdn.com/i/headshots/nba/players/full/";

	const LIVE_REFRESH_MS = 60000; // how often to check which teams are playing
	const CARD_REFRESH_MS = 5000;  // how often the open overlay updates

	const liveGames = new Map(); // team id -> scoreboard event, for games in progress

	const overlay = createOverlay({ pollMs: CARD_REFRESH_MS, open: openCard, refresh: refreshCard });
	const card = overlay.card;

	/****************************
	 * Live teams
	 * One scoreboard request a minute marks the teams currently playing. The dots themselves are
	 * added by Dashboard.addDots() (see start() below); this only shows and hides them.
	 ****************************/
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
		if (overlay.dot?.hidden) overlay.close();
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap. Shows the last scoreboard data straight away, then
	 * polls the game summary (score, clock and latest play) while it stays open.
	 ****************************/
	function openCard(dot) {
		card.hidden = false;
		const event = liveGames.get(dot.dataset.team);
		if (event) renderCard(dot, event.competitions[0], event.status);
	}

	async function refreshCard(dot, current) {
		const event = liveGames.get(dot.dataset.team);
		if (!event || document.hidden) return;

		const summary = await getJSON(summaryUrls(event.id));
		if (!current()) return; // the overlay closed or moved on while the request ran

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

	/****************************
	 * Formatting
	 ****************************/
	// 1-4 are quarters, then 1ot, 2ot, 3ot…
	function periodLabel(n) {
		return n <= 4 ? "q" + n : (n - 4) + "ot";
	}

	// "1st OT" and "2nd Overtime" become "1ot" and "2ot".
	function shortOT(text) {
		return String(text).replace(/\b(\d)(?:st|nd|rd|th)\s+(?:OT|overtime)\b/gi, "$1ot");
	}

	// Turns ESPN's game status into the same shape as the play tags: "q3 7:41", "2ot 1:12".
	// Reads the structured period and clock when present, otherwise the "7:41 - 3rd" text.
	function statusLabel(status) {
		const name = status?.type?.name;
		if (name === "STATUS_HALFTIME") return "halftime";

		const text = status?.type?.shortDetail || status?.type?.detail || "";
		let period = Number(status?.period) || 0;
		let clock = status?.displayClock;
		if (!period || !clock) {
			const m = /^(\d+:\d+(?:\.\d+)?)\s*-\s*(\d+)?(?:st|nd|rd|th)?\s*(OT)?/i.exec(text);
			if (m && (m[2] || m[3])) {
				clock = m[1];
				period = m[3] ? 4 + (Number(m[2]) || 1) : Number(m[2]);
			}
		}

		if (name === "STATUS_END_PERIOD" && period) return "end " + periodLabel(period);
		if (period && clock) return `${periodLabel(period)} ${clock}`;
		// Anything else (delays and so on): show ESPN's wording, lightly tidied.
		return shortOT(text).replace(/\bOT\b/gi, "1ot").replace(/\bEnd of (\d)(?:st|nd|rd|th)\b/i, "end q$1");
	}

	// The table already has every team's logo, so reuse it; fall back to the feed's own.
	function teamLogo(team) {
		const fromTable = team?.id && document.querySelector(`.team[data-team="${CSS.escape(String(team.id))}"] img`)?.getAttribute("src");
		return fromTable || team?.logo || team?.logos?.[0]?.href;
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderCard(dot, comp, fallbackStatus, play) {
		const me = comp.competitors.find((c) => String(c.team?.id) === dot.dataset.team);
		const opp = comp.competitors.find((c) => c !== me);
		if (!me || !opp) return;

		// Left side reads logo, name, score; the right side mirrors it: score, name, logo.
		const side = (c, mirrored) => {
			const logo = teamLogo(c.team);
			const parts = [
				logo ? `<img class="logo" src="${esc(logo)}" alt="">` : "",
				`<span class="abbr">${esc(c.team?.abbreviation || c.team?.shortDisplayName || c.team?.displayName)}</span>`,
				`<b>${esc(c.score ?? "–")}</b>`
			];
			return `<span class="side">${(mirrored ? parts.reverse() : parts).join("")}</span>`;
		};

		const status = statusLabel(comp.status ?? fallbackStatus);

		let playHtml = "";
		if (play?.text) {
			const athleteId = play.participants?.[0]?.athlete?.id;
			const when = [play.period?.number && periodLabel(play.period.number), play.clock?.displayValue].filter(Boolean).join(" ");
			const points = play.scoringPlay && play.scoreValue > 0 ? `<span class="pts">+${esc(play.scoreValue)}</span>` : "";
			playHtml = `<div class="play">${athleteId ? `<img class="shot" src="${HEADSHOT_URL}${esc(athleteId)}.png" alt="">` : ""}<div>${when ? `<span class="when">${esc(when)}</span>` : ""}${esc(shortOT(play.text))}${points}</div></div>`;
		}

		const html = `<div class="matchup">${side(me)}<span class="sep">${me.homeAway === "home" ? "vs" : "@"}</span>${side(opp, true)}</div>
			${status ? `<div class="status">${esc(status)}</div>` : ""}
			${playHtml}`;

		if (!overlay.draw(html)) return;
		// Not every player has a headshot: drop the image rather than show a broken one.
		card.querySelector(".shot")?.addEventListener("error", (e) => {
			e.target.remove();
			overlay.position();
		}, { once: true });
	}

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refreshLive(); // catch up straight away after the tab was in the background
	});

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
