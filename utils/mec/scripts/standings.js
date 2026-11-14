"use strict";

/****************************
 *
 * MEC men's basketball standings
 * Reads the official mountaineast.org standings page (server-rendered Sidearm HTML; there is no JSON API)
 * and renders one table. Knows nothing about live games: when the table is drawn it fires
 * "standings:rendered", and live.js (if loaded) takes it from there.
 *
 ****************************/
(() => {
	const STANDINGS_URL = "https://mountaineast.org/standings.aspx?path=mbb";
	const REFRESH_MS = 60000;   // standings move when games end
	const BYES = 6;             // the top six seeds skip the first round
	const TOURNAMENT_SPOTS = 10; // the top ten of the twelve schools reach the tournament (last season's format; update if it changes)

	/****************************
	 * Schools
	 * Each entry: [names the schools go by, run through norm() so spelling doesn't matter] plus the name for
	 * the table, the full name for the tooltip, a short code for small screens and the live overlay, and the
	 * logo (the standings page doesn't carry logos, so they're listed here; each school's URL differs).
	 * A school that's missing falls back to the page's own name and is logged to the console.
	 ****************************/
	const CLUBS = [
		{ match: ["daviselkins"], name: "davis & elkins", title: "Davis & Elkins", code: "D&E",
		  logo: "https://mountaineast.org/images/logos/senators_logo_alt_rgb_DavisElkins.png" },
		{ match: ["glenvillest"], name: "glenville st", title: "Glenville State", code: "GLE",
		  logo: "https://mountaineast.org/images/logos/Glenville_State-.png" },
		{ match: ["shawneest"], name: "shawnee st", title: "Shawnee State", code: "SHA",
		  logo: "https://mountaineast.org/images/logos/Shawnee_State_2025.png" },
		{ match: ["wvwesleyan", "wvwesleyancollege"], name: "wv wesleyan", title: "West Virginia Wesleyan", code: "WVW",
		  logo: "https://mountaineast.org/images/logos/West-Virginia-Wesleyan.png" },
		{ match: ["wheeling", "wheelinguniversity"], name: "wheeling", title: "Wheeling", code: "WHE",
		  logo: "https://mountaineast.org/images/logos/header_logo.png" },
		{ match: ["westliberty", "westlibertyuniversity"], name: "west liberty", title: "West Liberty", code: "WLU",
		  logo: "https://mountaineast.org/images/2022/1/10/WLU_logo_black_gold.png" },
		{ match: ["concord", "concorduniversity"], name: "concord", title: "Concord", code: "CON",
		  logo: "https://mountaineast.org/images/logos/Concord.png" },
		{ match: ["charleston", "charlestonwv", "universityofcharleston", "ucharleston"], name: "charleston", title: "Charleston", code: "CHA",
		  logo: "https://mountaineast.org/images/logos/uoc.png" },
		{ match: ["fairmontst"], name: "fairmont st", title: "Fairmont State", code: "FAI",
		  logo: "https://mountaineast.org/images/2018/8/17/fsu_logo.png" },
		{ match: ["frostburgst"], name: "frostburg st", title: "Frostburg State", code: "FRO",
		  logo: "https://mountaineast.org/images/logos/frostburg.png" },
		{ match: ["pointpark"], name: "point park", title: "Point Park", code: "PPU",
		  logo: "https://mountaineast.org/images/2026/6/24/Pioneers_Logo_Full_Color.png" },
		{ match: ["wvst", "wvstuniversity"], name: "wv state", title: "West Virginia State", code: "WVS",
		  logo: "https://mountaineast.org/images/logos/y17.png" }
	];
	const unknownClubs = new Set();

	function clubFor(school) {
		const key = norm(school);
		const club = CLUBS.find((c) => c.match.includes(key));
		if (club) return club;
		if (!unknownClubs.has(key)) {
			unknownClubs.add(key);
			console.warn("No entry for school:", school);
		}
		return { match: [key], name: school.toLowerCase(), title: school, code: school.slice(0, 3).toUpperCase() };
	}

	/****************************
	 * Data
	 ****************************/
	const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

	// ".750", "1.000", ".000"; no games yet reads as a dash.
	const formatPct = (w, l) => (w + l ? (w / (w + l) >= 1 ? "1.000" : (w / (w + l)).toFixed(3).replace(/^0/, "")) : "–");

	// One school's row. Cells are found by what they hold, not by position: the page repeats some cells
	// (the headers show "School" and "Conf" twice) and the exact markup isn't guaranteed. The first W-L is the
	// conference record, the next distinct one the overall record: with duplicated cells they are the 1st and 3rd.
	// The streak on the page covers every game, so it's shown the same in both views.
	function readRow(tr) {
		const link = [...tr.querySelectorAll("a[href]")].find((a) => tidy(a.textContent));
		if (!link || !/schedule/i.test(link.getAttribute("href"))) return null;

		const texts = [...tr.children].map((c) => tidy(c.textContent));
		const records = texts.filter((t) => /^\d+-\d+$/.test(t));
		if (records.length < 2) return null;
		const [conf, overall] = records.length >= 4 ? [records[0], records[2]] : [records[0], records[1]];
		const [w, l] = conf.split("-").map(Number);
		const [ow, ol] = overall.split("-").map(Number);

		const img = tr.querySelector("img");
		const src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
		return {
			school: tidy(link.textContent),
			logo: src && !src.startsWith("data:") ? new URL(src, STANDINGS_URL).href : "",
			w, l, pct: formatPct(w, l),       // conference only
			ow, ol, opct: formatPct(ow, ol), // every game, conference and non-conference
			strk: texts.find((t) => /^[WL]\d+$/i.test(t))?.toUpperCase() ?? "–"
		};
	}

	function readTable(table) {
		return [...table.querySelectorAll("tr")].map(readRow).filter(Boolean);
	}

	// Returns [{ rows }]: one group, so the rendering code stays the same shape as the other dashboards.
	// The rows stay in the order the conference lists them, so its tiebreakers are respected.
	function parseStandings(html) {
		const doc = new DOMParser().parseFromString(html, "text/html");
		for (const table of doc.querySelectorAll("table")) {
			const rows = readTable(table);
			if (rows.length) return [{ rows }];
		}
		return [];
	}

	/****************************
	 * Tournament berths
	 * The top ten make the conference tournament and the top six of those skip the first round. Until a
	 * conference game has been played the order is only the overall record, so nothing is coloured yet.
	 * Seeds and colours always follow the conference order, whichever view is showing: the tournament is seeded on
	 * conference play, so the # column and the colours stay true when the table shows overall records.
	 ****************************/
	function markBerths(groups) {
		for (const { rows } of groups) {
			const started = rows.some((row) => row.w + row.l > 0);
			rows.forEach((row, i) => {
				row.seed = i + 1;
				row.berth = !started ? "" : row.seed <= BYES ? "direct" : row.seed <= TOURNAMENT_SPOTS ? "playoff" : "out";
			});
		}
	}

	/****************************
	 * Rendering
	 ****************************/
	function renderRow(row) {
		const club = clubFor(row.school);
		const logo = club.logo || row.logo; // a school that's missing from CLUBS falls back to whatever the page had
		const [w, l, pct] = confOnly() ? [row.w, row.l, row.pct] : [row.ow, row.ol, row.opct];
		const strkClass = /^[WL]/i.test(row.strk) ? row.strk[0].toUpperCase() : "";

		// data-team, data-match and data-club are the hooks live.js uses to find each school.
		return `<tr class="${row.berth}">
			<td>${esc(row.seed)}</td>
			<td><div class="team" data-team="${esc(club.match[0])}" data-match="${esc(club.match.join("|"))}" data-club="${esc(club.name)}">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ""}<span class="name" title="${esc(club.title)}">${esc(club.name)}</span><span class="abbr">${esc(club.code)}</span></div></td>
			<td>${esc(w)}</td>
			<td>${esc(l)}</td>
			<td>${esc(pct)}</td>
			<td class="strk ${strkClass}">${esc(row.strk)}</td>
		</tr>`;
	}

	function renderGroup(group) {
		// A div, not a section: the base stylesheet styles every section as a full-height page frame.
		const conf = document.createElement("div");
		conf.className = "conf";
		conf.innerHTML = `<table>
				<thead>
					<tr><th scope="col">#</th><th scope="col">team</th><th scope="col">w</th><th scope="col">l</th><th scope="col">pct</th><th scope="col">strk</th></tr>
				</thead>
				<tbody>${group.rows.map(renderRow).join("")}</tbody>
			</table>`;
		return conf;
	}

	/****************************
	 * View toggle
	 * Overall (every game) is the default; the checkbox switches to conference-only records. The choice is
	 * remembered in this browser. Flipping it redraws from the data already loaded, with no new request.
	 ****************************/
	const toggle = document.getElementById("conf-only");
	const confOnly = () => Boolean(toggle?.checked);
	try {
		if (toggle) toggle.checked = localStorage.getItem("mec-conf-only") === "1";
	} catch { /* storage can be blocked; the default stays */ }
	toggle?.addEventListener("change", () => {
		try {
			localStorage.setItem("mec-conf-only", confOnly() ? "1" : "0");
		} catch { /* not worth failing over */ }
		draw();
	});

	// Redraws only when something changed (new data or the other view), so live.js's dots survive a refresh
	// that found nothing new.
	let groups = [];
	let drawn = "";
	function draw() {
		if (!groups.length) return;
		const signature = JSON.stringify([confOnly(), groups]);
		if (signature === drawn) return;
		drawn = signature;
		document.getElementById("conferences").replaceChildren(...groups.map(renderGroup));
		document.dispatchEvent(new CustomEvent("standings:rendered"));
	}

	async function load() {
		if (document.hidden) return;
		const html = await fetchText(STANDINGS_URL);
		const fresh = html ? parseStandings(html) : [];
		const message = document.getElementById("message");

		if (!fresh.length) {
			if (!drawn) message.textContent = "couldn’t load standings"; // after the first draw, keep the last good table
			return;
		}

		markBerths(fresh);
		groups = fresh;
		message.hidden = true;
		document.getElementById("key").hidden = !groups.some((g) => g.rows.some((r) => r.berth));
		draw();
	}

	load();
	setInterval(load, REFRESH_MS);
	document.addEventListener("visibilitychange", load); // catch up straight away after the tab was in the background
})();