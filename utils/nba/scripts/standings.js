"use strict";

/****************************
 *
 * NBA standings
 * Pulls ESPN's undocumented standings endpoint and renders one table per conference.
 * Knows nothing about live games: when the tables are drawn it fires "standings:rendered",
 * and live.js (if loaded) takes it from there.
 *
 ****************************/
(() => {
	// Tried in order; the first one that returns usable data wins.
	const STANDINGS_URLS = [
		"https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn",
		"https://site.api.espn.com/apis/v2/sports/basketball/nba/standings"
	];

	/****************************
	 * Data
	 ****************************/
	// ESPN sends whole games as "4" and half games as "4.5"; always show one decimal.
	// Anything that isn't a number (the leader's "-") is left alone.
	function formatGamesBehind(value) {
		const text = String(value);
		const n = Number(text);
		return text.trim() !== "" && Number.isFinite(n) ? n.toFixed(1) : text;
	}

	// Win percentage the way it's written in standings: .500, .333, 1.000
	function formatWinPct(pct) {
		if (pct === null) return "–";
		return pct >= 1 ? "1.000" : pct.toFixed(3).replace(/^0/, "");
	}

	// Flattens one ESPN standings entry into the fields the table needs.
	// ESPN's stat naming isn't documented, so each stat is matched on any of its identifiers.
	function readEntry(entry) {
		const team = entry.team || {};
		const stats = new Map();
		for (const stat of entry.stats || []) {
			for (const key of [stat.name, stat.type, stat.abbreviation, stat.shortDisplayName]) {
				if (key && !stats.has(String(key).toLowerCase())) stats.set(String(key).toLowerCase(), stat);
			}
		}
		const find = (...keys) => keys.map((k) => stats.get(k.toLowerCase())).find(Boolean);
		const show = (...keys) => {
			const stat = find(...keys);
			return stat ? (stat.displayValue ?? stat.value ?? "–") : "–";
		};
		const number = (...keys) => {
			const n = Number(find(...keys)?.value);
			return Number.isFinite(n) ? n : null;
		};

		const pct = number("winPercent", "PCT");

		return {
			id: team.id,
			name: team.shortDisplayName || team.displayName || team.abbreviation,
			abbr: team.abbreviation || team.shortDisplayName,
			logo: team.logos?.[0]?.href,
			seed: number("playoffSeed"),
			pct: pct ?? 0, // for sorting when ESPN sends no seed
			wins: show("wins", "W"),
			losses: show("losses", "L"),
			winPct: formatWinPct(pct),
			gb: formatGamesBehind(show("gamesBehind", "GB")),
			last10: show("lasttengames", "Last Ten Games", "L10"),
			strk: String(show("strk", "STRK"))
		};
	}

	// Returns [{ name, rows }], one item per conference, West first so East lands on the right.
	function extractGroups(data) {
		const sources = data.children?.length ? data.children : [data];
		const rank = (g) => (/west/i.test(g.name) ? 0 : /east/i.test(g.name) ? 1 : 2);

		return sources
			.filter((source) => source.standings?.entries?.length)
			.map((source) => ({
				name: source.name || source.abbreviation || "league",
				// Sort by playoff seed when present, otherwise by win percentage.
				rows: source.standings.entries.map(readEntry)
					.sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.pct - a.pct)
			}))
			.sort((a, b) => rank(a) - rank(b));
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderRow(row, index) {
		const seed = row.seed ?? index + 1;
		const berth = seed <= 6 ? "direct" : seed <= 10 ? "playin" : "out";
		const strkClass = /^[WL]/i.test(row.strk) ? row.strk[0].toUpperCase() : "";

		// data-team is the hook live.js uses to find each team.
		return `<tr class="${berth}">
			<td>${esc(seed)}</td>
			<td><div class="team" data-team="${esc(row.id)}">${row.logo ? `<img src="${esc(row.logo)}" alt="" loading="lazy">` : ""}<span class="name">${esc(row.name)}</span><span class="abbr">${esc(row.abbr)}</span></div></td>
			<td>${esc(row.wins)}</td>
			<td>${esc(row.losses)}</td>
			<td>${esc(row.winPct)}</td>
			<td>${esc(row.gb)}</td>
			<td>${esc(row.last10)}</td>
			<td class="strk ${strkClass}">${esc(row.strk)}</td>
		</tr>`;
	}

	function renderGroup(group) {
		// A div, not a section: the base stylesheet styles every section as a full-height page frame.
		const conf = document.createElement("div");
		conf.className = "conf";
		conf.innerHTML = `<h5>${esc(group.name)}</h5>
			<table>
				<thead>
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">pct</th><th scope="col">gb</th><th scope="col">l10</th><th scope="col">strk</th></tr>
				</thead>
				<tbody>${group.rows.map(renderRow).join("")}</tbody>
			</table>`;
		return conf;
	}

	async function init() {
		const data = await getJSON(STANDINGS_URLS);
		const groups = data ? extractGroups(data) : [];
		const message = document.getElementById("message");

		if (!groups.length) {
			message.textContent = "couldn’t load standings";
			return;
		}

		message.hidden = true;
		document.getElementById("conferences").append(...groups.map(renderGroup));
		document.getElementById("key").hidden = false;
		document.dispatchEvent(new CustomEvent("standings:rendered"));
	}

	init();
})();