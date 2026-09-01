// fetch + parse "Ship from US devices" section from CrownPuff's list of deals

const SHEET_ID = "1x_PmVHiQNHyw5t05peEDG1DcCKDCvH_UPd3p7yCw4xg";
const GID = "0"; // use headers=0, gviz tries to auto-detect where a table starts and drops rows otherwise
const JSON_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}&headers=0`;

let START_MARKER_PREFIX = "us coupons";
let END_MARKER_PREFIX = "new user codes";

const dropdown = document.getElementById("showDeals");

dropdown.addEventListener("change", async (event) => {
	const selectedOption = event.target.value;
	const config = DEAL_LISTS[selectedOption];
	
	if (config) {
		// change marker variables
		START_MARKER_PREFIX = config.start;
		END_MARKER_PREFIX = config.end;

		// clear cache
		localStorage.removeItem(CACHE_KEY);

		// reset deals array
		deals = [];

		// force fetch
		await loadDealsIndex();
	}
});

const FIXED_COLUMNS = {
	preCoupon: 1, // Column B
	postCoupon: 2, // Column C
};

const COLUMN_MATCHERS = {
	retroConsole: h => h === "retro console",
	linkAffiliate: h => h.includes("link") && h.includes("affiliate") && !h.includes("non"),
	linkNonAffiliate: h => h.includes("link") && h.includes("non") && h.includes("affiliate"),
	note: h => h.startsWith("note"),
};

const CACHE_KEY = "deals-index-cache";
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min

let deals = [];

async function loadDealsIndex() {
	const cached = readCache();
	if (cached) {
		deals = cached;
		render();
		return;
	}

	document.getElementById("results").textContent = "Loading deals…";

	try {
		const rows = await fetchSheetRows();
		const sectionRows = extractDealsSection(rows);
		deals = buildDealsFromSection(sectionRows).map(withDiscountPct);
		writeCache(deals);
	} catch (error) {
		console.error("Failed to build deals index:", error);
		document.getElementById("results").textContent =
			"Couldn't load the deals list — try refreshing in a bit.";
		return;
	}

	render();
}

// fetch

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
	const tableRows = (data.table && data.table.rows) || [];

	// gviz sometimes returns .f as an empty string even when .v has real
	// content, so only use .f when it's non-empty; otherwise fall back to .v.
	return tableRows.map(row =>
		(row.c || []).map(cell => {
			if (!cell) return "";
			if (cell.f != null && cell.f !== "") return String(cell.f);
			if (cell.v != null) return String(cell.v);
			return "";
		})
	);
}

function extractDealsSection(rows) {
	const startIdx = rows.findIndex(row => row && row[0] && normalize(row[0]).startsWith(START_MARKER_PREFIX));
	if (startIdx === -1) {
		throw new Error(`Could not find a column-A cell starting with "${START_MARKER_PREFIX}".`);
	}

	let endIdx = rows.length;
	for (let i = startIdx + 1; i < rows.length; i++) {
		if (rows[i] && rows[i][0] && normalize(rows[i][0]).startsWith(END_MARKER_PREFIX)) {
			endIdx = i;
			break;
		}
	}

	return rows.slice(startIdx + 1, endIdx);
}

function buildDealsFromSection(sectionRows) {
	let headerRowIdx = sectionRows.findIndex(row => row.some(cell => cell && cell.trim()));
	if (headerRowIdx === -1) throw new Error("Section was found but contained no data rows.");

	let normalizedHeader = sectionRows[headerRowIdx].map(normalize);
	
	const hasHeaders = normalizedHeader.some(h => h === "retro console" || h.includes("link"));
	
	const colIdx = {};
	if (hasHeaders) {
		for (const [key, matcher] of Object.entries(COLUMN_MATCHERS)) {
			colIdx[key] = normalizedHeader.findIndex(matcher);
		}
		headerRowIdx = headerRowIdx + 1; 
	} else {
		colIdx.retroConsole = 0;		// Column A
		colIdx.linkAffiliate = 3;		// Column D
		colIdx.linkNonAffiliate = 4;	// Column E
		colIdx.note = 5;           		// Column F
	}
	
	Object.assign(colIdx, FIXED_COLUMNS);

	const parsed = [];
	for (let i = headerRowIdx; i < sectionRows.length; i++) {
		const row = sectionRows[i];
		if (!row) continue;
		
		const name = (row[colIdx.retroConsole] || "").trim();
		if (!name || normalize(name).startsWith(START_MARKER_PREFIX)) continue;

		parsed.push({
			name,
			preCoupon: parsePrice(row[colIdx.preCoupon]),
			postCoupon: parsePrice(row[colIdx.postCoupon]),
			affiliateLink: (row[colIdx.linkAffiliate] || "").trim() || null,
			nonAffiliateLink: (row[colIdx.linkNonAffiliate] || "").trim() || null,
			note: (row[colIdx.note] || "").trim() || null,
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

// sort

function getSort() {
	return {
		key: document.getElementById("sortBy").value,
		reverse: document.getElementById("reverseSort").checked,
	};
}

function getDisplayMode() {
	return document.getElementById("tableView").checked ? "table" : "grid";
}

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

		const aMissing = av == null;
		const bMissing = bv == null;
		if (aMissing && bMissing) return 0;
		if (aMissing) return 1;
		if (bMissing) return -1;
		return (av - bv) * factor;
	});
}

function render() {
	const { key, reverse } = getSort();
	const sorted = sortDeals(deals, key, reverse);
	getDisplayMode() === "table" ? renderTable(sorted) : renderGrid(sorted);
}

// cache

function readCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const { timestamp, data } = JSON.parse(raw);
		if (Date.now() - timestamp > CACHE_TTL_MS) return null;
		return data;
	} catch {
		return null;
	}
}

function writeCache(data) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
	} catch {
		// storage unavailable or full
	}
}

// guarantee deferred script has finished executing first
document.addEventListener("DOMContentLoaded", () => {
	["showDeals", "sortBy", "reverseSort", "tableView"].forEach(id => {
		document.getElementById(id).addEventListener("change", render);
	});
	loadDealsIndex();
});