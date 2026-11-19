/****************************
 *
 * Lyrics
 * Picks a random block from scripts/lyrics.txt and shows its two lyric lines in the bottom left corner.
 * Hovering (or focusing/tapping) the lyrics opens a .popup card with the song details.
 *
 * lyrics.txt format: blocks separated by a blank line, seven lines each, always in this order:
 *   lyric line 1
 *   lyric line 2
 *   song title
 *   artist name
 *   album title
 *   release year
 *   album art (link to an image)
 *
 ****************************/
(() => {
	const SOURCE = "scripts/lyrics.txt";

	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};

	function parse(text) {
		return text
			.replace(/\r\n/g, "\n")
			.trim()
			.split(/\n\s*\n/)
			.map((block, i) => {
				const rows = block.split("\n").map((row) => row.trim());
				if (rows.length !== 7) {
					console.warn(`lyrics.txt: block ${i + 1} has ${rows.length} lines instead of 7, skipped`);
					return null;
				}
				const [line1, line2, song, artist, album, year, art] = rows;
				return { lines: [line1, line2], song, artist, album, year, art };
			})
			.filter(Boolean);
	}

	function show(entry) {
		const lyrics = el("div", "lyrics");
		lyrics.tabIndex = 0; // focusable, so a tap or keyboard focus works like hover
		entry.lines.forEach((line) => lyrics.append(el("p", "", line)));

		const card = el("div", "popup lyrics-card");
		card.hidden = true;
		const text = el("div", "lyrics-text");
		text.append(
			el("div", "lyrics-song", entry.song),
			el("div", "lyrics-artist", entry.artist),
			el("div", "lyrics-meta", `${entry.album} \u00b7 ${entry.year}`)
		);
		if (entry.art) {
			const art = el("img", "lyrics-art");
			art.alt = "";
			art.addEventListener("error", () => art.remove()); // a dead link just drops the art
			art.src = entry.art;
			card.append(art);
		}
		card.append(text);

		document.body.append(lyrics, card);

		// The popup is fixed to the viewport, so place it just above the lyrics, kept on screen
		const place = () => {
			const rect = lyrics.getBoundingClientRect();
			const left = Math.max(10, Math.min(rect.left, window.innerWidth - card.offsetWidth - 10));
			const top = Math.max(10, rect.top - card.offsetHeight - 10);
			card.style.left = `${left}px`;
			card.style.top = `${top}px`;
		};
		const open = () => {
			card.hidden = false;
			place();
		};
		const close = () => {
			card.hidden = true;
		};

		lyrics.addEventListener("mouseenter", open);
		lyrics.addEventListener("mouseleave", close);
		lyrics.addEventListener("focus", open);
		lyrics.addEventListener("blur", close);
	}

	fetch(SOURCE)
		.then((response) => {
			if (!response.ok) throw new Error(`${SOURCE} returned ${response.status}`);
			return response.text();
		})
		.then((text) => {
			const entries = parse(text);
			if (entries.length) show(entries[Math.floor(Math.random() * entries.length)]);
		})
		.catch((error) => console.warn("lyrics:", error));
})();