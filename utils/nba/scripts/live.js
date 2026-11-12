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
	const SUMMARY_URLS = [
		"https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?region=us&lang=en&contentorigin=espn&event=",
		"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event="
	];

	const LIVE_REFRESH_MS = 60000; // how often to check which teams are playing
	const CARD_REFRESH_MS = 5000;  // how often the open overlay updates

	let activeDot = null;
	let cardTimer = null;
	let started = false;

	const card = document.createElement("div");
	card.className = "live-card";
	card.setAttribute("role", "status");
	card.hidden = true;
	document.body.appendChild(card);

	/****************************
	 * Dots
	 * One scoreboard request every minute marks the teams currently playing.
	 ****************************/
	function addDots() {
		document.querySelectorAll(".team[data-team]").forEach((team) => {
			if (team.querySelector(".live")) return;
			const dot = document.createElement("span");
			dot.className = "live";
			dot.dataset.team = team.dataset.team;
			dot.tabIndex = 0;
			dot.setAttribute("role", "button");
			dot.setAttribute("aria-label", "live game: show score");
			dot.hidden = true;
			team.appendChild(dot);
		});
	}

	async function refreshLive() {
		if (document.hidden) return;
		const board = await getJSON(SCOREBOARD_URLS);
		if (!board) return; // keep what's showing if the request failed

		const liveTeams = new Map(); // team id -> event id
		for (const event of board.events || []) {
			const state = event.status && event.status.type && event.status.type.state;
			const comp = event.competitions && event.competitions[0];
			if (state !== "in" || !comp) continue;
			for (const c of comp.competitors || []) liveTeams.set(String(c.team.id), event.id);
		}

		document.querySelectorAll(".live").forEach((dot) => {
			const eventId = liveTeams.get(dot.dataset.team);
			dot.hidden = !eventId;
			dot.dataset.event = eventId || "";
		});

		// The game behind an open overlay may have just ended.
		if (activeDot && activeDot.hidden) closeCard();
	}

	/****************************
	 * Score overlay
	 * Opens on hover, focus or tap. Refreshes every few seconds while open.
	 ****************************/
	function openCard(dot) {
		if (activeDot === dot) return;
		closeCard();
		activeDot = dot;
		card.innerHTML = `<div class="status">loading…</div>`;
		card.hidden = false;
		positionCard();
		refreshCard();
		cardTimer = setInterval(refreshCard, CARD_REFRESH_MS);
	}

	function closeCard() {
		clearInterval(cardTimer);
		cardTimer = null;
		activeDot = null;
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

	function periodLabel(n) {
		if (n <= 4) return "q" + n;
		return n === 5 ? "ot" : (n - 4) + "ot";
	}

	// ESPN lists plays oldest to newest; take the highest sequence number to be safe.
	function latestPlay(summary) {
		const plays = summary && summary.plays;
		if (!plays || !plays.length) return null;
		const seq = (p) => Number(p.sequenceNumber);
		if (plays.every((p) => Number.isFinite(seq(p)))) {
			return plays.reduce((a, b) => (seq(b) > seq(a) ? b : a));
		}
		return plays[plays.length - 1];
	}

	function renderCard(dot, event, summary) {
		const comp = event && event.competitions && event.competitions[0];
		if (!comp) return;
		const me = comp.competitors.find((c) => String(c.team.id) === dot.dataset.team);
		const opp = comp.competitors.find((c) => c !== me);
		if (!me || !opp) return;

		const sep = me.homeAway === "home" ? "vs" : "@";
		const detail = event.status && event.status.type && (event.status.type.shortDetail || event.status.type.detail);
		const play = latestPlay(summary);

		let playHtml = "";
		if (play && play.text) {
			const when = [play.period && play.period.number ? periodLabel(play.period.number) : "", play.clock && play.clock.displayValue]
				.filter(Boolean).join(" ");
			playHtml = `<div class="play${play.scoringPlay ? " scoring" : ""}">${when ? `<span class="when">${esc(when)}</span>` : ""}${esc(play.text)}</div>`;
		}

		card.innerHTML = `<div class="matchup">
				<span class="side">${esc(me.team.abbreviation)} <b>${esc(me.score ?? "–")}</b></span>
				<span class="sep">${sep}</span>
				<span class="side">${esc(opp.team.abbreviation)} <b>${esc(opp.score ?? "–")}</b></span>
			</div>
			${detail ? `<div class="status">${esc(detail)}</div>` : ""}
			${playHtml}`;
		positionCard();
	}

	async function refreshCard() {
		const dot = activeDot;
		if (!dot || document.hidden) return;
		const eventId = dot.dataset.event;
		if (!eventId) return;

		// Scoreboard for score and clock, game summary for the latest play.
		const [board, summary] = await Promise.all([getJSON(SCOREBOARD_URLS), getJSON(SUMMARY_URLS.map((u) => u + eventId))]);
		if (dot !== activeDot) return; // pointer moved on while the request was in flight

		const event = board && (board.events || []).find((e) => String(e.id) === String(eventId));
		if (event) renderCard(dot, event, summary);
	}

	/****************************
	 * Input
	 * Delegated on document: the dots are created after the page loads.
	 ****************************/
	document.addEventListener("mouseover", (e) => {
		const dot = e.target.closest(".live");
		if (dot) openCard(dot);
	});
	document.addEventListener("mouseout", (e) => {
		const dot = e.target.closest(".live");
		if (dot && !(e.relatedTarget && dot.contains(e.relatedTarget))) closeCard();
	});
	document.addEventListener("focusin", (e) => {
		const dot = e.target.closest(".live");
		if (dot) openCard(dot);
	});
	document.addEventListener("focusout", (e) => {
		if (e.target.closest(".live")) closeCard();
	});
	// Touch has no hover: a tap opens the overlay, a tap anywhere else closes it.
	document.addEventListener("pointerdown", (e) => {
		const dot = e.target.closest(".live");
		if (dot && e.pointerType !== "mouse") openCard(dot);
		else if (!dot) closeCard();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeCard();
	});
	window.addEventListener("resize", positionCard);
	window.addEventListener("scroll", positionCard, true); // capture: the page scrolls inside <section>

	/****************************
	 * Start
	 ****************************/
	function start() {
		if (started) return;
		started = true;
		addDots();
		refreshLive();
		setInterval(refreshLive, LIVE_REFRESH_MS);
	}

	if (document.querySelector(".team[data-team]")) start();
	else document.addEventListener("standings:rendered", start, { once: true });
})();
