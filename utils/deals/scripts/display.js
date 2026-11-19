"use strict";

// Draws the deals index.js hands over, as a card grid or a table.
const { renderGrid, renderTable } = (() => {
	// Shorthand: el("p", "deal-note", "text") builds <p class="deal-note">text</p>.
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	const dollars = (n) => `$${n.toFixed(2)}`;
	const discountText = (deal) => `${deal.discountPct}% off`;
	const emptyMark = () => el("span", "deal-empty", "—");

	function buildPriceEl(deal) {
		const price = el("p", "deal-price");

		if (deal.postCoupon != null) {
			// highlight deal price in green
			if (deal.preCoupon != null) price.append(el("span", "pre", dollars(deal.preCoupon)));
			price.append(el("span", "post", dollars(deal.postCoupon)));
		} else if (deal.preCoupon != null) {
			// show original price with no strikethrough
			price.append(el("span", "", dollars(deal.preCoupon)));
		} else {
			price.append(emptyMark());
		}

		return price;
	}

	function buildLinksEl(deal) {
		const links = el("div", "deal-links");

		// affiliate link only to support CrownPuff :)
		if (deal.affiliateLink) {
			const buyLink = el("a", "", "View Deal");
			buyLink.href = deal.affiliateLink;
			buyLink.target = "_blank";
			buyLink.rel = "noopener noreferrer";
			links.append(buyLink);
		}

		return links;
	}

	function buildCard(deal) {
		const card = el("div", "deal-card");
		card.append(el("h3", "", deal.name), buildPriceEl(deal));

		if (deal.discountPct != null) card.append(el("p", "deal-discount", discountText(deal)));

		if (deal.note) {
			card.append(el("p", "deal-note", deal.note));
		} else {
			// keep link row pinned to bottom
			const spacer = el("div");
			spacer.style.marginBottom = "auto";
			card.append(spacer);
		}

		card.append(buildLinksEl(deal));
		return card;
	}

	function buildRow(deal) {
		const cell = (...children) => {
			const td = el("td");
			td.append(...children);
			return td;
		};

		const row = el("tr");
		row.append(
			cell(el("span", "deal-name", deal.name)),
			cell(buildPriceEl(deal)),
			cell(deal.discountPct != null ? el("span", "deal-discount", discountText(deal)) : emptyMark()),
			cell(...(deal.note ? [el("span", "deal-note", deal.note)] : [])),
			cell(buildLinksEl(deal))
		);
		return row;
	}

	// Clears the results area, or shows the empty message. Returns the container when there is something to draw.
	function startRender(list) {
		const container = document.getElementById("results");
		container.innerHTML = "";

		if (list.length === 0) {
			container.textContent = "No deals to show!";
			return null;
		}
		return container;
	}

	function renderGrid(list) {
		const container = startRender(list);
		if (!container) return;

		const grid = el("div", "deal-grid");
		grid.append(...list.map((deal) => buildCard(deal)));
		container.append(grid);
	}

	function renderTable(list) {
		const container = startRender(list);
		if (!container) return;

		const table = el("table", "deal-table");

		const thead = el("thead");
		thead.innerHTML = `
		<tr>
			<th>Name</th>
			<th>Price</th>
			<th>Discount</th>
			<th>Note</th>
			<th>Link</th>
		</tr>`;

		const tbody = el("tbody");
		tbody.append(...list.map((deal) => buildRow(deal)));

		table.append(thead, tbody);
		container.append(table);
	}

	return { renderGrid, renderTable };
})();
