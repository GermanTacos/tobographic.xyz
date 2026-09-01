// populate sort dropdown

const SORT_OPTIONS = [
	{ value: "postCoupon", label: "Price (post-coupon)" },
	{ value: "preCoupon", label: "Price (pre-coupon)" },
	{ value: "discountPct", label: "Discount %" },
	{ value: "name", label: "Name" },
];

const DEFAULT_SORT = "postCoupon";

function loadSortOptions() {
	const dropdown = document.getElementById("sortBy");

	SORT_OPTIONS.forEach(({ value, label }) => {
		const option = document.createElement("option");
		option.value = value;
		option.text = label;
		if (value === DEFAULT_SORT) option.selected = true;
		dropdown.appendChild(option);
	});
}

loadSortOptions();