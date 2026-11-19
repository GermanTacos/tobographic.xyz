"use strict";

// Fetches CrownPuff's list of deals (a public Google Sheet), cuts out the section picked in the "Show" dropdown,
// then sorts and draws it (display.js draws, options.js holds the list of sections).
(() => {
	const SHEET_ID = "1x_PmVHiQNHyw5t05peEDG1DcCKDCvH_UPd3p7yCw4xg";
	const GID = "0"; // use headers=0, gviz tries to auto-detect where a table starts and drops rows otherwise
	const JSON_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&headers=0`;

	const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min
	const RENDER_IDS = ["sortBy", "reverseSort", "tableView"]; // controls that only redraw what's loaded

	const FIXED_COLUMNS = {
		preCoupon: 1, // Column B
		postCoupon: 2 // Column C
	};

	const COLUMN_MATCHERS = {
		retroConsole: (h) => h === "retro console",
		linkAffiliate: (h) => h.includes("link") && h.includes("affiliate") && !h.includes("non"),
		linkNonAffiliate: (h) => h.includes("link") && h.includes("non") && h.includes("affiliate"),
		note: (h) => h.startsWith("note")
	};

	let listName = "shipUS"; // the selected key of DEAL_LISTS
	let deals = [];

	const resultsEl = () => document.getElementById("results");
	const markers = () => DEAL_LISTS[listName];

	/****************************
	 * Loading
	 ****************************/
	async function loadDealsIndex() {
		const cached = readCache();
		if (cached) {
			deals = cached;
			render();
			return;
		}

		resultsEl().textContent = "Loading deals…";

		try {
			const rows = await fetchSheetRows();
			const sectionRows = extractDealsSection(rows);
			deals = buildDealsFromSection(sectionRows).map(withDiscountPct);
			writeCache(deals);
		} catch (error) {
			console.error("Failed to build deals index:", error);
			resultsEl().textContent = "Couldn't load the deals list — try refreshing in a bit.";
			return;
		}

		render();
	}

	/****************************
	 * Fetching and parsing
	 ****************************/
	function normalize(str) {
		return (str == null ? "" : String(str))
			.replace(/\u00A0/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
	}

	async function fetchSheetRows() {
		const res = await fetch(JSON_URL);
		if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
		const text = await res.text();

		const jsonStart = text.indexOf("{");
		const jsonEnd = text.lastIndexOf("}");
		if (jsonStart === -1 || jsonEnd === -1) {
			throw new Error("Unexpected response format from gviz endpoint.");
		}

		const data = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
		const tableRows = data.table?.rows || [];

		// gviz sometimes returns .f as an empty string even when .v has real
		// content, so only use .f when it's non-empty; otherwise fall back to .v.
		return tableRows.map((row) =>
			(row.c || []).map((cell) => {
				if (!cell) return "";
				if (cell.f != null && cell.f !== "") return String(cell.f);
				if (cell.v != null) return String(cell.v);
				return "";
			})
		);
	}

	// The rows between the selected section's start marker and the next section's marker.
	function extractDealsSection(rows) {
		const { start, end } = markers();
		const startsWith = (row, prefix) => Boolean(row?.[0]) && normalize(row[0]).startsWith(prefix);

		const startIdx = rows.findIndex((row) => startsWith(row, start));
		if (startIdx === -1) {
			throw new Error(`Could not find a column-A cell starting with "${start}".`);
		}

		let endIdx = rows.findIndex((row, i) => i > startIdx && startsWith(row, end));
		if (endIdx === -1 || end === undefined) endIdx = rows.length;

		return rows.slice(startIdx + 1, endIdx);
	}

	function buildDealsFromSection(sectionRows) {
		let headerRowIdx = sectionRows.findIndex((row) => row.some((cell) => cell && cell.trim()));
		if (headerRowIdx === -1) throw new Error("Section was found but contained no data rows.");

		const normalizedHeader = sectionRows[headerRowIdx].map(normalize);
		const hasHeaders = normalizedHeader.some((h) => h === "retro console" || h.includes("link"));

		const colIdx = {};
		if (hasHeaders) {
			for (const [key, matcher] of Object.entries(COLUMN_MATCHERS)) {
				colIdx[key] = normalizedHeader.findIndex(matcher);
			}
			headerRowIdx += 1;
		} else {
			colIdx.retroConsole = 0;     // Column A
			colIdx.linkAffiliate = 3;    // Column D
			colIdx.linkNonAffiliate = 4; // Column E
			colIdx.note = 5;             // Column F
		}

		Object.assign(colIdx, FIXED_COLUMNS);

		const parsed = [];
		for (const row of sectionRows.slice(headerRowIdx)) {
			if (!row) continue;

			const name = (row[colIdx.retroConsole] || "").trim();
			if (!name || normalize(name).startsWith(markers().start)) continue;

			parsed.push({
				name,
				preCoupon: parsePrice(row[colIdx.preCoupon]),
				postCoupon: parsePrice(row[colIdx.postCoupon]),
				affiliateLink: (row[colIdx.linkAffiliate] || "").trim() || null,
				nonAffiliateLink: (row[colIdx.linkNonAffiliate] || "").trim() || null,
				note: (row[colIdx.note] || "").trim() || null
			});
		}

		return parsed;
	}

	function parsePrice(str) {
		if (!str) return null;
		const cleaned = String(str).replace(/[^0-9.]/g, "");
		if (!cleaned) return null;
		const n = parseFloat(cleaned);
		return Number.isNaN(n) ? null : n;
	}

	// discount% computed from pre- and post- coupon
	function withDiscountPct(deal) {
		if (deal.preCoupon == null || deal.postCoupon == null || deal.preCoupon === 0) {
			return { ...deal, discountPct: null };
		}
		return { ...deal, discountPct: Math.round((1 - deal.postCoupon / deal.preCoupon) * 100) };
	}

	/****************************
	 * Sorting and drawing
	 ****************************/
	function sortDeals(list, key, reverse) {
		const factor = reverse ? -1 : 1;
		return [...list].sort((a, b) => {
			let av = a[key];
			let bv = b[key];

			if (key === "name") {
				av = (av || "").toLowerCase();
				bv = (bv || "").toLowerCase();
				if (av < bv) return -1 * factor;
				if (av > bv) return 1 * factor;
				return 0;
			}

			// Deals missing the sorted value always go last, whichever way it's sorted.
			const aMissing = av == null;
			const bMissing = bv == null;
			if (aMissing && bMissing) return 0;
			if (aMissing) return 1;
			if (bMissing) return -1;
			return (av - bv) * factor;
		});
	}

	function render() {
		const sorted = sortDeals(deals, document.getElementById("sortBy").value, document.getElementById("reverseSort").checked);
		if (document.getElementById("tableView").checked) renderTable(sorted);
		else renderGrid(sorted);
	}

	/****************************
	 * Cache
	 * One entry per section, so switching sections never shows another section's deals.
	 ****************************/
	const cacheKey = () => `deals-index-cache:${listName}`;

	function readCache() {
		try {
			const raw = localStorage.getItem(cacheKey());
			if (!raw) return null;
			const { timestamp, data } = JSON.parse(raw);
			return Date.now() - timestamp > CACHE_TTL_MS ? null : data;
		} catch {
			return null;
		}
	}

	function writeCache(data) {
		try {
			localStorage.setItem(cacheKey(), JSON.stringify({ timestamp: Date.now(), data }));
		} catch {
			// storage unavailable or full
		}
	}

	// Wait for DOMContentLoaded: it fires after every deferred script has run, so display.js is ready by then.
	document.addEventListener("DOMContentLoaded", () => {
		for (const id of RENDER_IDS) document.getElementById(id).addEventListener("change", render);

		document.getElementById("showDeals").addEventListener("change", (event) => {
			if (!(event.target.value in DEAL_LISTS)) return;
			listName = event.target.value;
			deals = [];
			loadDealsIndex();
		});

		loadDealsIndex();
	});
})();
