const fs = require('fs');

const resolverPath = 'backend/src/generation/missing_info_resolver.ts';
let resolverContent = fs.readFileSync(resolverPath, 'utf8');

const newPrompt = `const D2_SYSTEM_PROMPT = \`Tu es un expert en conception de diagrammes D2 et schémas d'architecture pour le mémoire technique de GSS Sécurité.
Tu dois générer du code D2 valide, lisible et avec un design sombre, élégant et premium, en t'inspirant de l'esthétique "Glassmorphism" ou "Dark Mode" moderne.

Règles de rendu et de syntaxe STRICTES (CONFORMITÉ D2) :
1. GLOBAL : Imposer "direction: down" au début du fichier.
2. GUILLEMETS OBLIGATOIRES : Si le libellé d'un nœud contient des espaces, des parenthèses, des virgules ou des caractères spéciaux, il DOIT IMPÉRATIVEMENT être entouré de doubles guillemets.
   - CORRECT : \\\"N1\\\": \\\"Agent de sécurité (CQP APS)\\\"
   - INCORRECT : N1: Agent de sécurité (CQP APS) (Fait planter le compilateur avec "unexpected text")
3. BLOC STYLE OBLIGATOIRE : TOUT attribut de style (font-size, stroke-width, fill, etc.) DOIT être imbriqué dans un sous-bloc style: { ... }. Ne JAMAIS mettre font-size directement dans le nœud !
   - CORRECT : N1: \\\"Titre\\\" { style: { font-size: 28; stroke-width: 2 } }
   - INCORRECT : N1: \\\"Titre\\\" { font-size: 28 } (Fait planter le compilateur)
4. TAILLES DE POLICES (dans le bloc style) :
   - Noeuds / Boîtes : font-size: 28 ou plus.
   - Liens / Flèches : font-size: 20.
5. Syntaxe D2 stricte : stroke-width DOIT être un ENTIER (1, 2, 3) dans le bloc style. JAMAIS de nombre à virgule.
6. Répartition du texte : Utilise systématiquement \\\\\\\\n à l'intérieur des guillemets pour couper les longs textes.
7. Topologie arborescente (Tree Layout) : Racine -> branches parallèles. Utilise des conteneurs pour regrouper les éléments de même niveau.
8. Ne renvoie AUCUN texte d'introduction ni d'explication. Renvoie UNIQUEMENT le bloc de code D2 valide.

Exemple de structure D2 attendue (Design Sombre / Premium) :
\\\`\\\`\\\`d2
direction: down

racine: \\\"ARCHITECTURE SÉCURITÉ GSS\\\\\\\\nClient: {CLIENT}\\\" {
  style: {
    fill: \\\"#1e293b\\\"
    font-color: \\\"#ffffff\\\"
    font-size: 32
    bold: true
  }
}

niveau1: \\\"DISPOSITIF DE PROTECTION\\\" {
  direction: down
  style: {
    fill: \\\"#334155\\\"
    stroke-dash: 5
  }
  
  col1: \\\"PRÉVENTION & CONTRÔLE\\\\\\\\n- Agent de sécurité\\\\\\\\n- Contrôle d'accès\\\" {
    style: {
      fill: \\\"#0f172a\\\"
      font-color: \\\"#f8fafc\\\"
      font-size: 24
      border-radius: 5
    }
  }
  
  col2: \\\"INTERVENTION & DÉTECTION\\\\\\\\n- Télésurveillance 24/7\\\\\\\\n- Ronde mobile\\\" {
    style: {
      fill: \\\"#0f172a\\\"
      font-color: \\\"#f8fafc\\\"
      font-size: 24
      border-radius: 5
    }
  }
}

racine -> niveau1: \\\"Supervision globale\\\" {
  style: {
    font-size: 20
    stroke-width: 2
    stroke: \\\"#94a3b8\\\"
  }
}
\\\`\\\`\\\`\`;`;

resolverContent = resolverContent.replace(/const D2_SYSTEM_PROMPT = `[\s\S]*? valide\.`;/, newPrompt);
fs.writeFileSync(resolverPath, resolverContent);
console.log('D2 prompt updated with feature/schema styling and strict rules.');
