"use strict";

// Which part of the sheet each "Show" choice reads: from the first column-A cell that starts with `start`
// up to the first one that starts with `end` (or the end of the sheet). index.js uses this.
const DEAL_LISTS = {
	shipUS: { start: "ship from us devices", end: "ship from china devices -" },
	shipCN: { start: "ship from china devices -", end: "work in progress" },
	couponUS: { start: "us coupons", end: "new user codes" },
	cpus: { start: "cpus", end: "headphones" },
	headphones: { start: "headphones", end: "dollar express" },
	earlyBirdAnbernic: { start: "anbernic early birds" }
};

// Populates the sort dropdown.
(() => {
	const SORT_OPTIONS = [
		{ value: "postCoupon", label: "Price (post-coupon)" },
		{ value: "preCoupon", label: "Price (pre-coupon)" },
		{ value: "discountPct", label: "Discount %" },
		{ value: "name", label: "Name" }
	];
	const DEFAULT_SORT = "postCoupon";

	const dropdown = document.getElementById("sortBy");
	for (const { value, label } of SORT_OPTIONS) {
		dropdown.append(new Option(label, value, false, value === DEFAULT_SORT));
	}
})();
