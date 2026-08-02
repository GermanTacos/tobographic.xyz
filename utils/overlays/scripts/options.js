// fetch resolution data from appropriate json entries
async function loadData(type) {
	try {
		const filePath = "https://tobographic.xyz/utils/overlays/data/"+type+".json";
		
		const response = await fetch(filePath);
		if (!response.ok) throw new Error(`Status: ${response.status}`);
		
		const jsonData = await response.json();
		
		// build options from data
		const dropdown = document.getElementById(type);
		
		Object.values(jsonData).forEach(item => {
			const option = document.createElement('option');
			option.value = item.id;
			option.text = item.name;
			dropdown.appendChild(option);
		});
	} catch (error) {
		console.error("Failed to read JSON:", error);
	}
}

loadData("resolution");
loadData("console");