// fetch resolution data from appropriate json entries
async function loadData() {
	try {
		const types = ['resolution', 'console'];
		
		const response = await fetch('https://tobographic.xyz/utils/overlays/data/resolution.json');
		if (!response.ok) throw new Error(`Status: ${response.status}`);
		
		const jsonData = await response.json();
		console.log(jsonData);
		
		// build options from data
		Array.from(types).forEach(child => {
			const dropdown = document.getElementById(child);
			
			Object.values(jsonData).forEach(item => {
				const option = document.createElement('option');
				option.value = item.id;
				option.text = item.name;
				dropdown.appendChild(option);
			});
		});
	} catch (error) {
		console.error("Failed to read JSON:", error);
	}
}

loadData();