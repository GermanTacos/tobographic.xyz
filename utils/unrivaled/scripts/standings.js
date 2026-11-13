"use strict";

/****************************
 *
 * Unrivaled standings
 * Reads the official unrivaled.basketball standings page (server-rendered HTML; there is no JSON API)
 * and renders one table. Knows nothing about live games: when the table is drawn it fires
 * "standings:rendered", and live.js (if loaded) takes it from there.
 *
 ****************************/
(() => {
	const STANDINGS_URL = "https://www.unrivaled.basketball/standings";
	const REFRESH_MS = 60000; // standings move when games end
	const BYES = 2;           // the top two seeds skip the first round
	const PLAYOFF_SPOTS = 6;  // six of the eight clubs reach the playoffs

	/****************************
	 * Clubs
	 * Keyed by the slug in each club's link on the standings page (/phantom, /lunar-owls…):
	 * [nickname for the table, three-letter code for small screens and the live overlay].
	 * A club that's missing falls back to its slug and is logged to the console.
	 ****************************/
	const CLUBS = {
		"phantom": ["phantom", "PHA"],
		"mist": ["mist", "MIS"],
		"laces": ["laces", "LAC"],
		"rose": ["rose", "ROS"],
		"breeze": ["breeze", "BRZ"],
		"vinyl": ["vinyl", "VIN"],
		"lunar-owls": ["lunar owls", "LUN"],
		"hive": ["hive", "HIV"]
	};
	const unknownClubs = new Set();

	function clubNames(row) {
		const [nickname, code] = CLUBS[row.slug] ?? [];
		if (!nickname && !unknownClubs.has(row.slug)) {
			unknownClubs.add(row.slug);
			console.warn("No nickname for club:", row.slug);
		}
		const fallback = row.slug.replace(/-/g, " ");
		return { nickname: nickname ?? fallback, code: code ?? fallback.slice(0, 3).toUpperCase() };
	}

	/****************************
	 * Data
	 ****************************/
	const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

	// The club cell holds the seed, the logo, the name and a clinch flag ("X" clinched a playoff spot,
	// "E" eliminated) all inside one link. The flag is a leaf element of its own when the page marks it up,
	// otherwise it's the last word of the text.
	function readClub(cell) {
		const text = tidy(cell?.textContent);
		const slug = cell?.querySelector("a[href]")?.getAttribute("href").split("/").filter(Boolean).pop() ?? "";
		const flagEl = [...(cell?.querySelectorAll("*") ?? [])].find((el) => !el.children.length && /^[XE]$/.test(tidy(el.textContent)));
		const src = cell?.querySelector("img")?.getAttribute("src");
		return {
			slug,
			seed: parseInt(text, 10) || null,
			status: tidy(flagEl?.textContent) || (/\s([XE])$/.exec(text)?.[1] ?? ""),
			logo: src ? new URL(src, STANDINGS_URL).href : ""
		};
	}

	// Columns are found by their header text, so extra columns or reordering don't matter.
	function readTable(table) {
		const trs = [...table.querySelectorAll("tr")];
		const head = trs.find((tr) => tr.querySelector("th"));
		if (!head) return [];
		const col = {};
		[...head.children].forEach((th, i) => { col[tidy(th.textContent).toLowerCase()] ??= i; });
		if (["team", "w", "l"].some((k) => !(k in col))) return [];

		return trs.map((tr) => [...tr.querySelectorAll("td")]).filter((cells) => cells.length >= 4).map((cells, i) => {
			const text = (key) => tidy(cells[col[key]]?.textContent).replace(/^-+$/, "–") || "–";
			const club = readClub(cells[col.team]);
			return {
				...club,
				seed: club.seed ?? i + 1,
				wins: text("w"),
				losses: text("l"),
				pct: text("pct"),
				gb: text("gb").replace(/^0(\.0+)?$/, "–"), // the leader's 0.0 reads better as a dash
				diff: text("diff"),
				strk: text("strk")
			};
		});
	}

	// Returns [{ name, rows }] (one group, to share the b.league and nba rendering code), named after the
	// page's "2026 Standings" heading.
	function parseStandings(html) {
		const doc = new DOMParser().parseFromString(html, "text/html");
		const table = [...doc.querySelectorAll("table")].find((t) => readTable(t).length);
		if (!table) return [];
		const heading = [...doc.querySelectorAll("h1, h2, h3")].map((h) => tidy(h.textContent)).find((t) => /standings/i.test(t));
		return [{ name: (heading ?? "standings").toLowerCase(), rows: readTable(table) }];
	}

	/****************************
	 * Playoff berths
	 * Six of the eight clubs make the playoffs and the top two get byes. A club the page marks as eliminated is dimmed.
	 ****************************/
	function markBerths(groups) {
		for (const { rows } of groups) {
			rows.forEach((row) => { row.berth = row.status === "E" || row.seed > PLAYOFF_SPOTS ? "out" : row.seed <= BYES ? "direct" : "playoff"; });
		}
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderRow(row) {
		const club = clubNames(row);
		const strkClass = /^[WL]/i.test(row.strk) ? row.strk[0].toUpperCase() : "";

		// data-team and data-club are the hooks live.js uses to find each club.
		return `<tr class="${row.berth}">
			<td>${esc(row.seed)}</td>
			<td><div class="team" data-team="${esc(row.slug)}" data-club="${esc(club.nickname)}">${row.logo ? `<img src="${esc(row.logo)}" alt="" loading="lazy">` : ""}<span class="name">${esc(club.nickname)}</span><span class="abbr">${esc(club.code)}</span></div></td>
			<td>${esc(row.wins)}</td>
			<td>${esc(row.losses)}</td>
			<td>${esc(row.pct)}</td>
			<td>${esc(row.gb)}</td>
			<td>${esc(row.diff)}</td>
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
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">pct</th><th scope="col">gb</th><th scope="col">diff</th><th scope="col">strk</th></tr>
				</thead>
				<tbody>${group.rows.map(renderRow).join("")}</tbody>
			</table>`;
		return conf;
	}

	// Redraws only when something changed, so live.js's dots survive a refresh that found nothing new.
	let drawn = "";
	async function load() {
		if (document.hidden) return;
		const html = await fetchText(STANDINGS_URL);
		const groups = html ? parseStandings(html) : [];
		const message = document.getElementById("message");

		if (!groups.length) {
			if (!drawn) message.textContent = "couldn’t load standings"; // after the first draw, keep the last good table
			return;
		}

		markBerths(groups);
		message.hidden = true;
		document.getElementById("key").hidden = false;
		const signature = JSON.stringify(groups);
		if (signature === drawn) return;
		drawn = signature;
		document.getElementById("conferences").replaceChildren(...groups.map(renderGroup));
		document.dispatchEvent(new CustomEvent("standings:rendered"));
	}

	load();
	setInterval(load, REFRESH_MS);
	document.addEventListener("visibilitychange", load); // catch up straight away after the tab was in the background
})();