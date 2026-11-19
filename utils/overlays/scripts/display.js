"use strict";

// Draws the results index.js hands over. index.js calls renderGrid(list).
const renderGrid = (() => {
	// Shorthand: el("p", "overlay-meta", "text") builds <p class="overlay-meta">text</p>.
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function downloadLink(label, href, filename) {
		const link = el("a", "", label);
		link.href = href;
		link.download = filename;
		return link;
	}

	function buildCard(overlay) {
		const card = el("div", "overlay-card");

		const img = el("img");
		img.src = overlay.pngUrl;
		img.alt = overlay.name;
		img.loading = "lazy";
		card.append(img, el("h3", "", overlay.name));

		if (overlay.desc) card.append(el("p", "overlay-desc", overlay.desc));

		const scaleLabel = overlay.intScale ? "int. scaled" : "non int. scaled";
		const offsetLabel = overlay.offset ? ", offset" : "";
		card.append(el("p", "overlay-meta", `${overlay.res} \u00b7 ${overlay.sys} \u00b7 ${scaleLabel}${offsetLabel}`));

		const links = el("div", "overlay-links");
		links.append(
			downloadLink("PNG", overlay.pngUrl, overlay.png),
			downloadLink("CFG", overlay.cfgUrl, overlay.cfg)
		);
		card.append(links);
		return card;
	}

	return function renderGrid(list) {
		const container = document.getElementById("results");
		container.innerHTML = "";

		if (list.length === 0) {
			container.textContent = "No results matching these filters!";
			return;
		}

		const grid = el("div", "overlay-grid");
		grid.append(...list.map(buildCard));
		container.append(grid);
	};
})();
