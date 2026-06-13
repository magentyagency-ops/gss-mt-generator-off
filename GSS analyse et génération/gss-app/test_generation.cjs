const fs = require('fs');
const path = require('path');
const { handleGenerate } = require('./vite-api');

// Mock data
const analysisData = {
  clientName: "Université de Paris Saclay",
  projectTitle: "Prestations de surveillance physique et de télésécurité des campus d'Orsay",
  duration: "4 ans",
  visitMandatory: true,
  visitDetails: "Les accès du bâtiment 399 sont à surveiller en priorité en raison des travaux en cours.",
  sites: [
    { name: "Campus d'Orsay", requirements: "3 ETP CQP APS de nuit" },
    { name: "Palaiseau", requirements: "2 ETP SSIAP1 en 24/7" }
  ],
  operationalSummary: {
    agentProfiles: "Agent de prévention CQP APS et agents de sécurité incendie SSIAP 1.",
    equipment: "Contrôleur de rondes Vigicom avec 12 pointeaux NFC, terminaux PTI Beepiz."
  },
  keyRisks: [
    "Intrusions nocturnes facilitées par les chantiers",
    "Coactivité importante sur le campus d'Orsay"
  ],
  proposalStrengths: [
    "Présence locale forte d'une agence à 10 minutes",
    "Vivier d'agents qualifiés immédiatement disponibles"
  ],
  anticipatedIssues: [
    "Retards potentiels de reprise du personnel dus aux plannings actuels - Solution: Audits anticipés et cellule d'intégration dédiée."
  ]
};

const selectedPages = [1, 2, 23, 24, 28, 30, 10, 103, 104, 105];

async function runTest() {
  console.log("Starting test PDF generation...");
  try {
    const result = await handleGenerate(
      "dummy-api-key", // Not used for Cas B PDF generation unless it calls OpenAI (Cas B only uses template bytes and analysisData)
      analysisData,
      "Test_MT_Paris_Saclay.pdf",
      selectedPages
    );
    console.log("Generation complete!");
    console.log("Success:", result.success);
    console.log("Output Path:", result.outputPath);
    console.log("Filename:", result.filename);
    
    if (fs.existsSync(result.outputPath)) {
        console.log("File exists and size is:", fs.statSync(result.outputPath).size, "bytes");
    } else {
        console.error("Generated file does NOT exist!");
    }
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

runTest();
