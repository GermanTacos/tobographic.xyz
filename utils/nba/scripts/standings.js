/****************************
 *
 * NBA standings
 * Pulls ESPN's undocumented standings endpoint and renders one table per conference.
 * Knows nothing about live games: when the tables are drawn it fires "standings:rendered",
 * and live.js (if loaded) takes it from there.
 *
 ****************************/
(() => {
	// Endpoints are tried in order; the first one that returns usable data wins.
	const STANDINGS_URLS = [
		"https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn",
		"https://site.api.espn.com/apis/v2/sports/basketball/nba/standings"
	];

	const conferencesEl = document.getElementById("conferences");
	const messageEl = document.getElementById("message");
	const keyEl = document.getElementById("key");

	/****************************
	 * Stat lookups
	 ****************************/
	// Find a stat by any of its identifiers (name, type, abbreviation, short name).
	function findStat(entry, ...keys) {
		const wanted = keys.map((k) => k.toLowerCase());
		return (entry.stats || []).find((s) =>
			[s.name, s.type, s.abbreviation, s.shortDisplayName].some(
				(v) => v && wanted.includes(String(v).toLowerCase())
			)
		);
	}

	function display(entry, ...keys) {
		const stat = findStat(entry, ...keys);
		return stat ? (stat.displayValue ?? stat.value ?? "–") : "–";
	}

	function numeric(entry, ...keys) {
		const stat = findStat(entry, ...keys);
		const n = Number(stat && stat.value);
		return Number.isFinite(n) ? n : null;
	}

	/****************************
	 * Data
	 ****************************/
	// Returns [{ name, entries }], one item per conference.
	function extractGroups(data) {
		const groups = [];
		for (const child of Array.isArray(data.children) ? data.children : []) {
			const entries = child.standings && child.standings.entries;
			if (entries && entries.length) {
				groups.push({ name: child.name || child.abbreviation || "conference", entries });
			}
		}
		if (!groups.length && data.standings && data.standings.entries) {
			groups.push({ name: "league", entries: data.standings.entries });
		}
		return groups;
	}

	// West on the left, East on the right, to mirror the map.
	function orderGroups(groups) {
		const rank = (g) => (/west/i.test(g.name) ? 0 : /east/i.test(g.name) ? 1 : 2);
		return groups.slice().sort((a, b) => rank(a) - rank(b));
	}

	async function fetchGroups() {
		const data = await getJSON(STANDINGS_URLS);
		const groups = data ? extractGroups(data) : [];
		return groups.length ? orderGroups(groups) : [];
	}

	/****************************
	 * Rendering
	 ****************************/
	function berthClass(seed) {
		if (seed <= 6) return "direct";
		if (seed <= 10) return "playin";
		return "out";
	}

	function renderRow(row, index) {
		const entry = row.entry;
		const team = entry.team || {};
		const seed = row.seed ?? index + 1;
		const logo = team.logos && team.logos[0] && team.logos[0].href;
		const streak = String(display(entry, "streak", "STRK"));
		const streakType = streak.charAt(0).toUpperCase();

		// data-team is the hook live.js uses to find each team.
		return `<tr class="${berthClass(seed)}">
			<td>${esc(seed)}</td>
			<td><div class="team" data-team="${esc(team.id)}">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ""}<span class="name">${esc(team.shortDisplayName || team.displayName || team.abbreviation)}</span><span class="abbr">${esc(team.abbreviation || team.shortDisplayName)}</span></div></td>
			<td>${esc(display(entry, "wins", "W"))}</td>
			<td>${esc(display(entry, "losses", "L"))}</td>
			<td>${esc(display(entry, "gamesBehind", "GB"))}</td>
			<td>${esc(display(entry, "lasttengames", "Last Ten Games", "L10"))}</td>
			<td class="streak ${streakType === "W" || streakType === "L" ? streakType : ""}">${esc(streak)}</td>
		</tr>`;
	}

	function renderGroup(group) {
		// Sort by playoff seed when present, otherwise by win percentage.
		const rows = group.entries
			.map((entry) => ({
				entry,
				seed: numeric(entry, "playoffSeed"),
				pct: numeric(entry, "winPercent", "PCT") ?? 0
			}))
			.sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.pct - a.pct);

		// A div, not a section: the base stylesheet styles every section as a full-height page frame.
		const section = document.createElement("div");
		section.className = "conf";
		section.innerHTML = `<h5>${esc(group.name)}</h5>
			<table>
				<thead>
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">gb</th><th scope="col">l10</th><th scope="col">streak</th></tr>
				</thead>
				<tbody>${rows.map(renderRow).join("")}</tbody>
			</table>`;
		return section;
	}

	async function init() {
		const groups = await fetchGroups();

		if (!groups.length) {
			messageEl.textContent = "couldn’t load standings";
			return;
		}

		messageEl.hidden = true;
		groups.forEach((group) => conferencesEl.appendChild(renderGroup(group)));
		keyEl.hidden = false;

		document.dispatchEvent(new CustomEvent("standings:rendered"));
	}

	init();
})();
