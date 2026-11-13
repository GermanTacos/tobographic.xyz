"use strict";

/****************************
 *
 * B.LEAGUE Premier standings
 * Reads the official bleague.jp standings page (server-rendered HTML; there is no JSON API) and renders
 * one table per conference. Knows nothing about live games: when the tables are drawn it fires
 * "standings:rendered", and live.js (if loaded) takes it from there.
 *
 ****************************/
(() => {
	const STANDINGS_URL = "https://www.bleague.jp/standings/";
	const REFRESH_MS = 60000; // standings move when games end

	/****************************
	 * Clubs
	 * The page has no English names, so they're kept here by hand, keyed by the short Japanese name in the
	 * club cell: [nickname for the table, full name for the tooltip, three-letter code for small screens and
	 * the live overlay]. A club that's missing falls back to its Japanese short name and is logged to the console.
	 ****************************/
	const SR = ["SunRockers", "SunRockers Shibuya", "TSR"];
	const TEAMS = {
		"北海道": ["Levanga", "Levanga Hokkaido", "HOK"],
		"仙台": ["89ers", "Sendai 89ers", "SEN"],
		"秋田": ["Happinets", "Akita Northern Happinets", "AKI"],
		"茨城": ["Robots", "Ibaraki Robots", "IBA"],
		"宇都宮": ["Brex", "Utsunomiya Brex", "UTS"],
		"群馬": ["Crane Thunders", "Gunma Crane Thunders", "GUN"],
		"A千葉": ["Altiri", "Altiri Chiba", "ACH"],
		"千葉J": ["Jets", "Chiba Jets", "CHJ"],
		"A東京": ["Alvark", "Alvark Tokyo", "ATK"],
		"東京SR": SR, "SR渋谷": SR, "渋谷": SR,
		"川崎": ["Brave Thunders", "Kawasaki Brave Thunders", "KAW"],
		"横浜BC": ["B-Corsairs", "Yokohama B-Corsairs", "YOK"],
		"富山": ["Grouses", "Toyama Grouses", "TOY"],
		"信州": ["Brave Warriors", "Shinshu Brave Warriors", "SHN"],
		"三遠": ["NeoPhoenix", "San-en NeoPhoenix", "SAN"],
		"三河": ["Seahorses", "Seahorses Mikawa", "MIK"],
		"名古屋D": ["Dolphins", "Nagoya Diamond Dolphins", "NGD"],
		"滋賀": ["Lakestars", "Shiga Lakestars", "SHG"],
		"京都": ["Hannaryz", "Kyoto Hannaryz", "KYO"],
		"大阪": ["Evessa", "Osaka Evessa", "OSA"],
		"神戸": ["Storks", "Kobe Storks", "KOB"],
		"島根": ["Susanoo Magic", "Shimane Susanoo Magic", "SHM"],
		"広島": ["Dragonflies", "Hiroshima Dragonflies", "HIR"],
		"佐賀": ["Ballooners", "Saga Ballooners", "SAG"],
		"長崎": ["Velca", "Nagasaki Velca", "NGS"],
		"琉球": ["Golden Kings", "Ryukyu Golden Kings", "RYU"]
	};
	const unknownClubs = new Set();

	function clubNames(row) {
		const [nickname, title, code] = TEAMS[row.abbr] ?? [];
		if (!nickname && !unknownClubs.has(row.abbr)) {
			unknownClubs.add(row.abbr);
			console.warn("No English name for club:", row.abbr, row.name);
		}
		return { nickname: nickname ?? row.abbr, title: title ?? row.name, code: code ?? row.abbr };
	}

	/****************************
	 * Data
	 ****************************/
	const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

	// The club cell holds the logo, the full name and the short name run together with no space ("広島ドラゴンフライズ広島").
	// The short name is found from the known list first, then the logo's alt text, then the first word.
	function readClub(cell) {
		let words = tidy(cell?.textContent).split(" ").filter(Boolean);
		const joined = words.join("");
		const img = cell?.querySelector("img");
		const alt = tidy(img?.getAttribute("alt"));
		const known = Object.keys(TEAMS).filter((k) => joined.endsWith(k)).sort((a, b) => b.length - a.length)[0];
		const abbr = known || (alt && joined.endsWith(alt) ? alt : "") || words[0] || "";
		if (words.length > 1 && words[0] === abbr) words = words.slice(1); // short name written once up front as well
		const rest = words.join("");
		const src = img?.getAttribute("src");
		return {
			abbr,
			name: rest.endsWith(abbr) && rest.length > abbr.length ? rest.slice(0, -abbr.length) : rest,
			logo: src ? new URL(src, STANDINGS_URL).href : ""
		};
	}

	// Columns are found by their Japanese header text, so extra columns or reordering don't matter.
	function readTable(table) {
		const trs = [...table.querySelectorAll("tr")];
		const head = trs.find((tr) => tr.querySelector("th"));
		if (!head) return [];
		const col = {};
		[...head.children].forEach((th, i) => { col[tidy(th.textContent).replace(/ /g, "")] ??= i; });
		if (["順位", "クラブ", "勝", "負"].some((k) => !(k in col))) return [];

		return trs.map((tr) => [...tr.querySelectorAll("td")]).filter((cells) => cells.length >= 4).map((cells, i) => {
			const text = (key) => tidy(cells[col[key]]?.textContent).replace(/^-+$/, "–") || "–";
			return {
				seed: parseInt(text("順位"), 10) || i + 1,
				...readClub(cells[col["クラブ"]]),
				wins: text("勝"),
				losses: text("負"),
				pct: text("勝率"),
				gb: text("差"),
				last5: text("過去5試合"),
				strk: text("連勝/連敗"),
				diff: Number(text("得失点差").replace(/[,+]/g, "")) || 0 // wildcard tiebreak only
			};
		});
	}

	// Returns [{ name, rows }], one item per conference, western first so eastern lands on the right.
	// A table belongs to the nearest heading above it that says 西地区 or 東地区; the first table per side wins.
	function parseStandings(html) {
		const doc = new DOMParser().parseFromString(html, "text/html");
		const names = { "西": "western conference", "東": "eastern conference" };
		const groups = {};
		let side = "";
		for (const el of doc.querySelectorAll("h1, h2, h3, h4, h5, h6, table")) {
			if (el.tagName !== "TABLE") side = names[/(東|西)地区/.exec(el.textContent)?.[1]] ?? side;
			else if (side && !groups[side]?.length) groups[side] = readTable(el);
		}
		return Object.values(names).filter((name) => groups[name]?.length).map((name) => ({ name, rows: groups[name] }));
	}

	/****************************
	 * Playoff berths
	 * Per the B.LEAGUE format page: the top 3 clubs in each conference qualify, plus the 2 best records among
	 * the other 20 clubs, compared across both conferences. Ties are broken by point differential only; the
	 * league's real order (head-to-head first) isn't computed, so a close wildcard race may differ from the official one.
	 ****************************/
	const DIRECT_PER_CONFERENCE = 3;
	const WILDCARDS = 2;

	const winRate = (row) => {
		const games = Number(row.wins) + Number(row.losses);
		return games > 0 ? Number(row.wins) / games : 0;
	};

	function markBerths(groups) {
		const rest = [];
		for (const { rows } of groups) {
			rows.forEach((row, i) => (i < DIRECT_PER_CONFERENCE ? (row.berth = "direct") : rest.push(row)));
		}
		rest.sort((a, b) => winRate(b) - winRate(a) || b.diff - a.diff);
		rest.forEach((row, i) => { row.berth = i < WILDCARDS ? "wildcard" : "out"; });
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
			<td><div class="team" data-team="${esc(row.abbr)}" data-club="${esc(row.name)}">${row.logo ? `<img src="${esc(row.logo)}" alt="" loading="lazy">` : ""}<span class="name" title="${esc(club.title)}">${esc(club.nickname)}</span><span class="abbr">${esc(club.code)}</span></div></td>
			<td>${esc(row.wins)}</td>
			<td>${esc(row.losses)}</td>
			<td>${esc(row.pct)}</td>
			<td>${esc(row.gb)}</td>
			<td>${esc(row.last5)}</td>
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
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">pct</th><th scope="col">gb</th><th scope="col">l5</th><th scope="col">strk</th></tr>
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
			if (!drawn) message.textContent = "couldn’t load standings"; // after the first draw, keep the last good tables
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
