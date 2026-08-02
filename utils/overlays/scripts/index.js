// scan overlays repo directly from browser

const REPO = { owner: "GermanTacos", name: "overlays", branch: "main" };
const RAW_BASE = `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/refs/heads/${REPO.branch}/`;
const TREE_URL = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/git/trees/${REPO.branch}?recursive=1`;

const CACHE_KEY = "overlay-index-cache";
const CACHE_TTL_MS = 1000 * 60 * 1; // 1 min

let overlays = [];

async function loadOverlayIndex() {
	const cached = readCache();
	if (cached) {
		overlays = cached;
		render();
		return;
	}

	try {
		// one api call lists every file in the repo
		const treeRes = await fetch(TREE_URL);
		if (!treeRes.ok) throw new Error(`Tree fetch failed: ${treeRes.status}`);
		const tree = await treeRes.json();

		const manifestPaths = tree.tree
			.filter(entry => entry.type === "blob" && entry.path.endsWith(".json"))
			.map(entry => entry.path);

		// manifests fetched from raw.githubusercontent.com
		const manifests = await Promise.all(manifestPaths.map(fetchManifest));
		overlays = manifests.filter(Boolean);
		writeCache(overlays);
	} catch (error) {
		console.error("Failed to build overlay index:", error);
		document.getElementById("results").textContent =
			"Couldn't load the overlay list — try refreshing in a bit.";
	}

	render();
}

async function fetchManifest(path) {
	try {
		const res = await fetch(RAW_BASE + path);
		if (!res.ok) throw new Error(`Status ${res.status}`);
		const data = await res.json();

		const dir = path.slice(0, path.lastIndexOf("/") + 1);
		return {
			...data,
			pngUrl: RAW_BASE + dir + data.png,
			cfgUrl: RAW_BASE + dir + data.cfg,
			// folder name (e.g. "640-480") is used as resolution key
			// rather than parsing "res" display string ("640 x 480"),
			// since it's more reliable / already normalized
			resKey: dir.split("/")[0],
		};
	} catch (error) {
		console.error(`Skipping manifest ${path}:`, error);
		return null;
	}
}

function getFilters() {
	return {
		resolution: document.getElementById("resolution").value,
		console: document.getElementById("console").value,
		intScale: document.getElementById("intScale").checked,
		offset: document.getElementById("offset").checked,
	};
}

function matchesFilters(overlay, filters) {
	if (filters.resolution !== "any" && overlay.resKey !== filters.resolution) return false;
	if (filters.console !== "any" && overlay.sys !== filters.console) return false;
	if ("intScale" in overlay && filters.intScale !== overlay.intScale) return false;
	if ("offset" in overlay && filters.offset !== overlay.offset) return false;
	return true;
}

function render() {
	const filters = getFilters();
	renderGrid(overlays.filter(o => matchesFilters(o, filters)));
}

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

["resolution", "console", "intScale", "offset"].forEach(id => {
	document.getElementById(id).addEventListener("change", render);
});

loadOverlayIndex();