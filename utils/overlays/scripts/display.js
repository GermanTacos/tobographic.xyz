// render results from index.js for display

function renderGrid(list) {
	const container = document.getElementById("results");
	container.innerHTML = "";

	if (list.length === 0) {
		container.textContent = "No results matching these filters!";
		return;
	}

	const grid = document.createElement("div");
	grid.className = "overlay-grid";
	list.forEach(overlay => grid.appendChild(buildCard(overlay)));
	container.appendChild(grid);
}

function buildCard(overlay) {
	const card = document.createElement("div");
	card.className = "overlay-card";

	const img = document.createElement("img");
	img.src = overlay.pngUrl;
	img.alt = overlay.name;
	img.loading = "lazy";
	card.appendChild(img);

	const title = document.createElement("h3");
	title.textContent = overlay.name;
	card.appendChild(title);

	if (overlay.desc) {
		const desc = document.createElement("p");
		desc.className = "overlay-desc";
		desc.textContent = overlay.desc;
		card.appendChild(desc);
	}
	
	if (overlay.intScale == true) {
		overlay.scale = "int. scaled";
	} else {
		overlay.scale = "non int. scaled";
	}

	const meta = document.createElement("p");
	meta.className = "overlay-meta";
	meta.textContent = `${overlay.res} \u00b7 ${overlay.sys} \u00b7 ${overlay.scale}`;
	card.appendChild(meta);

	const links = document.createElement("div");
	links.className = "overlay-links";

	const pngLink = document.createElement("a");
	pngLink.href = overlay.pngUrl;
	pngLink.download = overlay.png;
	pngLink.textContent = "PNG";
	links.appendChild(pngLink);

	const cfgLink = document.createElement("a");
	cfgLink.href = overlay.cfgUrl;
	cfgLink.download = overlay.cfg;
	cfgLink.textContent = "CFG";
	links.appendChild(cfgLink);

	card.appendChild(links);
	return card;
}