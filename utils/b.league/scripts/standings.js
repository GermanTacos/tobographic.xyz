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
	const PROXIES = [];
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

	// The club cell reads like "宇都宮 宇都宮ブレックス宇都宮": short name, then the full name with the short one repeated.
	function readClub(cell) {
		const [abbr = "", rest = ""] = tidy(cell?.textContent).split(" ");
		const full = rest.endsWith(abbr) && rest.length > abbr.length ? rest.slice(0, -abbr.length) : rest || abbr;
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
				if (m) side = m[1] === "東" ? "east" : "west";
				continue;
			}
			if (!side || groups.has(side)) continue;
			const rows = readTable(el);
			if (rows.length) groups.set(side, rows);
		}
		return ["west", "east"].filter((n) => groups.has(n)).map((name) => ({ name, rows: groups.get(name) }));
	}

	// Placeholder numbers, only shown when bleague.jp can't be reached.
	const SAMPLE = ["west", "east"].map((name, g) => ({
		name,
		rows: [["広島", "広島ドラゴンフライズ"], ["名古屋D", "名古屋ダイヤモンドドルフィンズ"], ["琉球", "琉球ゴールデンキングス"], ["長崎", "長崎ヴェルカ"]]
			.map(([abbr, name], i) => ({ seed: i + 1, name, abbr, logo: "", wins: 9 - i - g, losses: i + g, pct: "–", gb: i ? String(i) : "–", last5: `${5 - i}-${i}`, streak: i % 2 ? "L1" : "W" + (3 - i) }))
	}));

	/****************************
	 * Rendering
	 ****************************/
	function renderRow(row) {
		const streakClass = /^[WL]/i.test(row.streak) ? row.streak[0].toUpperCase() : "";
		return `<tr>
			<td>${esc(row.seed)}</td>
			<td><div class="team">${row.logo ? `<img src="${esc(row.logo)}" alt="" loading="lazy">` : ""}<span class="name">${esc(row.name)}</span><span class="abbr">${esc(row.abbr)}</span></div></td>
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
