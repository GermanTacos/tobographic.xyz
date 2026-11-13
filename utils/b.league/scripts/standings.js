"use strict";

/****************************
 *
 * B.LEAGUE Premier standings
 * Fetches the official bleague.jp standings page and reads its tables (east and west).
 * There is no JSON API, so this parses server-rendered HTML. Browsers will probably block
 * a direct cross-origin request: add a proxy to PROXIES. Until a fetch works, the page
 * shows a small sample so the layout can still be seen.
 *
 ****************************/
(() => {
	const STANDINGS_URL = "https://www.bleague.jp/standings/";
	// Fallbacks tried after the direct request, e.g. (url) => "https://your-proxy.example/?url=" + encodeURIComponent(url)
	const PROXIES = [(url) => "https://bleague-proxy.tiny-river-02cf.workers.dev/?url=" + encodeURIComponent(url)];
	const REQUEST_TIMEOUT_MS = 8000;
	const REFRESH_MS = 60000;

	let showingReal = false;

	// Escapes text before it goes into an innerHTML template.
	function esc(value) {
		return String(value ?? "").replace(/[&<>"']/g, (c) => ({
			"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
		}[c]));
	}

	/****************************
	 * Data
	 ****************************/
	// English names, keyed by the short Japanese name bleague.jp shows in the club cell: [nickname for the table, full club name for the tooltip].
	// The page has no English names, so this is maintained by hand. Anything missing falls back to the Japanese short name
	// (and is logged to the console so it can be added here).
	const TEAMS = {
		"北海道": ["Levanga", "Levanga Hokkaido"],
		"仙台": ["89ers", "Sendai 89ers"],
		"秋田": ["Happinets", "Akita Northern Happinets"],
		"茨城": ["Robots", "Ibaraki Robots"],
		"宇都宮": ["Brex", "Utsunomiya Brex"],
		"群馬": ["Crane Thunders", "Gunma Crane Thunders"],
		"A千葉": ["Altiri", "Altiri Chiba"],
		"千葉J": ["Jets", "Chiba Jets"],
		"A東京": ["Alvark", "Alvark Tokyo"],
		"東京SR": ["SunRockers", "SunRockers Shibuya"], "SR渋谷": ["SunRockers", "SunRockers Shibuya"], "渋谷": ["SunRockers", "SunRockers Shibuya"],
		"川崎": ["Brave Thunders", "Kawasaki Brave Thunders"],
		"横浜BC": ["B-Corsairs", "Yokohama B-Corsairs"],
		"富山": ["Grouses", "Toyama Grouses"],
		"信州": ["Brave Warriors", "Shinshu Brave Warriors"],
		"三遠": ["NeoPhoenix", "San-en NeoPhoenix"],
		"三河": ["Seahorses", "Seahorses Mikawa"],
		"名古屋D": ["Dolphins", "Nagoya Diamond Dolphins"],
		"滋賀": ["Lakestars", "Shiga Lakestars"],
		"京都": ["Hannaryz", "Kyoto Hannaryz"],
		"大阪": ["Evessa", "Osaka Evessa"],
		"神戸": ["Storks", "Kobe Storks"],
		"島根": ["Susanoo Magic", "Shimane Susanoo Magic"],
		"広島": ["Dragonflies", "Hiroshima Dragonflies"],
		"佐賀": ["Ballooners", "Saga Ballooners"],
		"長崎": ["Velca", "Nagasaki Velca"],
		"琉球": ["Golden Kings", "Ryukyu Golden Kings"]
	};
	const missing = new Set();

	// What the table shows for a club: the English short name if known, otherwise the Japanese short name.
	function clubLabel(row) {
		const en = TEAMS[row.abbr];
		if (!en && !missing.has(row.abbr)) {
			missing.add(row.abbr);
			console.warn("No English name for club:", row.abbr, row.name);
		}
		return { label: en?.[0] ?? row.abbr ?? row.name, title: en?.[1] ?? row.name };
	}

	async function getHTML() {
		const urls = [STANDINGS_URL, ...PROXIES.map((proxy) => proxy(STANDINGS_URL))];
		for (const url of urls) {
			try {
				const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
				if (res.ok) return await res.text();
			} catch (err) {
				console.warn("Request failed:", url, err);
			}
		}
		return null;
	}

	const clean = (s) => String(s ?? "").replace(/\s+/g, "");
	const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

	// The club cell holds the logo, the full name and the short name run together with no space ("広島ドラゴンフライズ広島").
	// The short name is found by checking the known list first, then the logo's alt text, then the first word.
	function readClub(cell) {
		let words = tidy(cell?.textContent).split(" ").filter(Boolean);
		const joined = words.join("");
		const alt = tidy(cell?.querySelector("img")?.getAttribute("alt"));
		const known = Object.keys(TEAMS).filter((k) => joined.endsWith(k)).sort((a, b) => b.length - a.length)[0];
		const abbr = known || (alt && joined.endsWith(alt) ? alt : "") || words[0] || "";
		if (words.length > 1 && words[0] === abbr) words = words.slice(1); // short name written once up front as well
		const rest = words.join("");
		const full = rest.endsWith(abbr) && rest.length > abbr.length ? rest.slice(0, -abbr.length) : rest;
		const src = cell?.querySelector("img")?.getAttribute("src");
		return { name: full, abbr, logo: src ? new URL(src, STANDINGS_URL).href : "" };
	}

	// Columns are found by their Japanese header text, so extra columns or reordering don't matter.
	function readTable(table) {
		const head = [...table.querySelectorAll("tr")].find((tr) => tr.querySelector("th"));
		if (!head) return [];
		const col = {};
		[...head.children].forEach((th, i) => { col[clean(th.textContent)] ??= i; });
		if (["順位", "クラブ", "勝", "負"].some((k) => !(k in col))) return [];

		const rows = [];
		for (const tr of table.querySelectorAll("tr")) {
			const cells = [...tr.querySelectorAll("td")];
			if (cells.length < 4) continue;
			const text = (key) => tidy(cells[col[key]]?.textContent).replace(/^-+$/, "–") || "–";
			rows.push({
				seed: parseInt(text("順位"), 10) || rows.length + 1,
				...readClub(cells[col["クラブ"]]),
				wins: text("勝"),
				losses: text("負"),
				diff: Number(text("得失点差").replace(/[,+]/g, "")) || 0,
				pct: text("勝率"),
				gb: text("差"),
				last5: text("過去5試合"),
				streak: text("連勝/連敗")
			});
		}
		return rows;
	}

	// Returns [{ name, rows }] with west first so east lands on the right.
	// A table belongs to the nearest heading above it that says 東地区 or 西地区; the first table per side wins.
	function parseStandings(html) {
		const doc = new DOMParser().parseFromString(html, "text/html");
		const groups = new Map();
		let side = "";
		for (const el of doc.querySelectorAll("h1, h2, h3, h4, h5, h6, table")) {
			if (el.tagName !== "TABLE") {
				const m = /(東|西)地区/.exec(el.textContent);
				if (m) side = m[1] === "東" ? "eastern conference" : "western conference";
				continue;
			}
			if (!side || groups.has(side)) continue;
			const rows = readTable(el);
			if (rows.length) groups.set(side, rows);
		}
		return ["western conference", "eastern conference"].filter((n) => groups.has(n)).map((name) => ({ name, rows: groups.get(name) }));
	}

	// Placeholder numbers, only shown when bleague.jp can't be reached.
	const SAMPLE = ["western conference", "eastern conference"].map((name, g) => ({
		name,
		rows: [["広島", "広島ドラゴンフライズ"], ["名古屋D", "名古屋ダイヤモンドドルフィンズ"], ["琉球", "琉球ゴールデンキングス"], ["長崎", "長崎ヴェルカ"]]
			.map(([abbr, name], i) => ({ seed: i + 1, name, abbr, logo: "", wins: 9 - i - g, losses: i + g, pct: "–", gb: i ? String(i) : "–", last5: `${5 - i}-${i}`, streak: i % 2 ? "L1" : "W" + (3 - i) }))
	}));

	/****************************
	 * Playoff berths
	 * Per the B.LEAGUE format page: the top 3 clubs in each division qualify, plus the 2 best records among the
	 * other 20 clubs, compared across both divisions. Ties are broken here by point differential only; the
	 * league's real order (head-to-head first) isn't computed, so a close wildcard race may differ from the official one.
	 ****************************/
	const DIRECT_PER_DIVISION = 3;
	const WILDCARDS = 2;

	const winRate = (row) => {
		const w = Number(row.wins), l = Number(row.losses);
		return w + l > 0 ? w / (w + l) : 0;
	};

	function markBerths(groups) {
		const pool = [];
		for (const group of groups) {
			group.rows.forEach((row, i) => {
				if (i < DIRECT_PER_DIVISION) row.berth = "direct";
				else pool.push(row);
			});
		}
		pool.sort((a, b) => winRate(b) - winRate(a) || b.diff - a.diff);
		pool.forEach((row, i) => { row.berth = i < WILDCARDS ? "wildcard" : "out"; });
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderRow(row) {
		const club = clubLabel(row);
		const streakClass = /^[WL]/i.test(row.streak) ? row.streak[0].toUpperCase() : "";
		return `<tr class="${row.berth ?? ""}">
			<td>${esc(row.seed)}</td>
			<td><div class="team">${row.logo ? `<img src="${esc(row.logo)}" alt="" loading="lazy">` : ""}<span class="name" title="${esc(club.title)}">${esc(club.label)}</span></div></td>
			<td>${esc(row.wins)}</td>
			<td>${esc(row.losses)}</td>
			<td>${esc(row.pct)}</td>
			<td>${esc(row.gb)}</td>
			<td>${esc(row.last5)}</td>
			<td class="streak ${streakClass}">${esc(row.streak)}</td>
		</tr>`;
	}

	function renderGroup(group) {
		// A div, not a section: the base stylesheet styles every section as a full-height page frame.
		const conf = document.createElement("div");
		conf.className = "conf";
		conf.innerHTML = `<h5>${esc(group.name)}</h5>
			<table>
				<thead>
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">pct</th><th scope="col">gb</th><th scope="col">l5</th><th scope="col">streak</th></tr>
				</thead>
				<tbody>${group.rows.map(renderRow).join("")}</tbody>
			</table>`;
		return conf;
	}

	function draw(groups) {
		markBerths(groups);
		document.getElementById("key").hidden = false;
		document.getElementById("conferences").replaceChildren(...groups.map(renderGroup));
	}

	async function load() {
		if (document.hidden) return;
		const html = await getHTML();
		const groups = html ? parseStandings(html) : [];
		const message = document.getElementById("message");

		if (groups.length) {
			showingReal = true;
			message.hidden = true;
			draw(groups);
		} else if (!showingReal) { // keep the last good tables on a failed refresh
			message.hidden = false;
			message.textContent = "couldn’t read bleague.jp (cors?): showing sample data";
			draw(SAMPLE);
		}
	}

	load();
	setInterval(load, REFRESH_MS);
	document.addEventListener("visibilitychange", load);
})();
