const fs = require('fs');
async function run() {
  try {
    const res = await fetch('http://localhost:8000/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: {
          "b_presentation": "Ceci est un test de l'histoire de GSS. GSS a été fondé en 2021.",
          "b_moyens_humains": "Voici l'organigramme de notre entreprise GSS avec le PDG."
        }
      })
    });
    if (!res.ok) {
      console.error("Error status:", res.status);
      console.error(await res.text());
      return;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync('test_output.pdf', buffer);
    console.log("PDF generated! Size:", buffer.length);
  } catch (e) {
    console.error(e);
  }
}
run();
