// render results from index.js for display

function renderGrid(list) {
	const container = document.getElementById("results");
	container.innerHTML = "";

	if (list.length === 0) {
		container.textContent = "No deals to show!";
		return;
	}

	const grid = document.createElement("div");
	grid.className = "deal-grid";
	list.forEach(deal => grid.appendChild(buildCard(deal)));
	container.appendChild(grid);
}

function renderTable(list) {
	const container = document.getElementById("results");
	container.innerHTML = "";

	if (list.length === 0) {
		container.textContent = "No deals to show!";
		return;
	}

	const table = document.createElement("table");
	table.className = "deal-table";

	const thead = document.createElement("thead");
	thead.innerHTML = `
		<tr>
			<th>Name</th>
			<th>Price</th>
			<th>Discount</th>
			<th>Note</th>
			<th>Link</th>
		</tr>`;
	table.appendChild(thead);

	const tbody = document.createElement("tbody");
	list.forEach(deal => tbody.appendChild(buildRow(deal)));
	table.appendChild(tbody);

	container.appendChild(table);
}

function buildPriceEl(deal) {
	const price = document.createElement("p");
	price.className = "deal-price";
	if (deal.preCoupon != null) {
		const pre = document.createElement("span");
		pre.className = "pre";
		pre.textContent = `$${deal.preCoupon.toFixed(2)}`;
		price.appendChild(pre);
	}
	const post = document.createElement("span");
	post.className = "post";
	post.textContent = deal.postCoupon != null ? `$${deal.postCoupon.toFixed(2)}` : "—";
	price.appendChild(post);
	return price;
}

function buildLinksEl(deal) {
	const links = document.createElement("div");
	links.className = "deal-links";

	// affiliate link only to support CrownPuff :)
	if (deal.affiliateLink) {
		const buyLink = document.createElement("a");
		buyLink.href = deal.affiliateLink;
		buyLink.target = "_blank";
		buyLink.rel = "noopener noreferrer";
		buyLink.textContent = "View Deal";
		links.appendChild(buyLink);
	}

	return links;
}

function buildCard(deal) {
	const card = document.createElement("div");
	card.className = "deal-card";

	const title = document.createElement("h3");
	title.textContent = deal.name;
	card.appendChild(title);

	card.appendChild(buildPriceEl(deal));

	if (deal.discountPct != null) {
		const discount = document.createElement("p");
		discount.className = "deal-discount";
		discount.textContent = `${deal.discountPct}% off`;
		card.appendChild(discount);
	}

	if (deal.note) {
		const note = document.createElement("p");
		note.className = "deal-note";
		note.textContent = deal.note;
		card.appendChild(note);
	} else {
		// keep the link row pinned to the bottom even without a note,
		// same trick the .deal-note margin-bottom:auto relies on
		const spacer = document.createElement("div");
		spacer.style.marginBottom = "auto";
		card.appendChild(spacer);
	}

	card.appendChild(buildLinksEl(deal));
	return card;
}

function buildRow(deal) {
	const row = document.createElement("tr");

	const nameCell = document.createElement("td");
	const name = document.createElement("span");
	name.className = "deal-name";
	name.textContent = deal.name;
	nameCell.appendChild(name);
	row.appendChild(nameCell);

	const priceCell = document.createElement("td");
	priceCell.appendChild(buildPriceEl(deal));
	row.appendChild(priceCell);

	const discountCell = document.createElement("td");
	if (deal.discountPct != null) {
		const discount = document.createElement("span");
		discount.className = "deal-discount";
		discount.textContent = `${deal.discountPct}% off`;
		discountCell.appendChild(discount);
	} else {
		const empty = document.createElement("span");
		empty.className = "deal-empty";
		empty.textContent = "—";
		discountCell.appendChild(empty);
	}
	row.appendChild(discountCell);

	const noteCell = document.createElement("td");
	if (deal.note) {
		const note = document.createElement("span");
		note.className = "deal-note";
		note.textContent = deal.note;
		noteCell.appendChild(note);
	}
	row.appendChild(noteCell);

	const linkCell = document.createElement("td");
	linkCell.appendChild(buildLinksEl(deal));
	row.appendChild(linkCell);

	return row;
}