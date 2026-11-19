"use strict";

// Fills the resolution and console dropdowns from data/*.json.
(() => {
	async function fillDropdown(type) {
		try {
			const res = await fetch(`data/${type}.json`);
			if (!res.ok) throw new Error(`Status: ${res.status}`);

			const dropdown = document.getElementById(type);
			for (const item of Object.values(await res.json())) dropdown.append(new Option(item.name, item.id));
		} catch (error) {
			console.error("Failed to read JSON:", error);
		}
	}

	fillDropdown("resolution");
	fillDropdown("console");
})();
