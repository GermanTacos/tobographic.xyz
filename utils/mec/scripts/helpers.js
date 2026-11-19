"use strict";

/****************************
 *
 * MEC helpers
 * Used by standings.js and live.js. Load this file after dashboard.js and before them.
 *
 ****************************/

// Boils a school name down so the same school written differently by different sites compares equal:
// "West Virginia Wesleyan", "W.Va. Wesleyan" and "west-virginia-wesleyan" all become "wvwesleyan".
function norm(name) {
	return String(name ?? "")
		.toLowerCase()
		.replace(/[-_]/g, " ")
		.replace(/west virginia|w\.\s?va\.?|wva/g, "wv")
		.replace(/state/g, "st")
		.replace(/[^a-z]/g, "");
}