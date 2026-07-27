document.addEventListener("DOMContentLoaded", () => {
	// define images, add to table to add sprites
	const images = [
		'https://cdn.fireemblemwiki.org/c/cb/Ma_fe03_lord_playable.gif',
		'https://cdn.fireemblemwiki.org/9/9e/Ma_fe04_knight_lord_sigurd_playable.gif',
		'https://cdn.fireemblemwiki.org/6/6a/Ma_fe05_lord_playable.gif',
		'https://cdn.fireemblemwiki.org/e/e8/Ma_gba_lord_lyn_playable.gif',
		'https://cdn.fireemblemwiki.org/d/d9/Ma_fe13_lord_lucina_playable.gif',
		'https://cdn.fireemblemwiki.org/5/50/Ma_fe13_dancer_playable.gif',
		'https://cdn.fireemblemwiki.org/a/ae/Ma_fe13_wyvern_rider_cherche_playable.gif',
		'https://cdn.fireemblemwiki.org/7/75/Ma_fe14_fighter_charlotte_playable.gif',
		'https://cdn.fireemblemwiki.org/4/41/Ma_fe14_sky_knight_hinoka_playable.gif',
		'https://cdn.fireemblemwiki.org/8/83/Ma_fe14_maid_felicia_playable.gif',
		'https://cdn.fireemblemwiki.org/0/0e/Ma_fe15_cleric_silque_playable.gif',
		'https://cdn.fireemblemwiki.org/f/f9/Ma_fe15_cleric_genny_playable.gif',
		'https://cdn.fireemblemwiki.org/6/60/Ma_fe15_soldier_lukas_playable.gif',
		'https://cdn.fireemblemwiki.org/5/54/Ma_fe16_brigand_hilda_playable.gif',
		'https://cdn.fireemblemwiki.org/f/f6/Ma_fe16_cavalier_ferdinand_playable.gif',
		'https://cdn.fireemblemwiki.org/f/f1/Ma_fe16_priest_mercedes_playable.gif',
		'https://cdn.fireemblemwiki.org/2/23/Ma_fe17_thief_yunaka.png',
		'https://cdn.fireemblemwiki.org/b/b4/Ma_fe17_wyvern_knight_rosado.png',
		'https://cdn.fireemblemwiki.org/0/0a/Ma_fe17_hero_goldmary.png'
	];
	
	// grab random image from table
	const randomIndex = Math.floor(Math.random() * images.length);
	const imageElement = document.getElementById("random-image");
	
	imageElement.src = images[randomIndex];
});