const { DB } = require("./dist/core/db.js");
(async () => {
  const dossiers = await DB.getDossiers();
  for (const d of dossiers) {
    if (d.nom && d.nom.includes("Marché de test GSS")) {
      console.log("Deleting", d.id);
      await DB.deleteDossier(d.id);
    }
  }
  console.log("Done");
})();
