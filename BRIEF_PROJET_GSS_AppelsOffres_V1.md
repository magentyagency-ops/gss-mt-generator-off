# BRIEF PROJET — Automatisation appels d'offres GSS

**Document destiné à un agent d'architecture (Claude Code / Antigravity) chargé de produire l'architecture et le scaffolding du projet.**

Version : 1.0
Date : 2026-06-01
Rédigé par : Stan (stagiaire Nira) avec l'assistance d'un agent IA conseiller.

---

## 1. Contexte client

**Client final** : **GSS** — société française de sécurité privée (gardiennage, télésurveillance, contrôle d'accès, sûreté de sites).
**Acteur intégrateur** : **Nira** — agence d'audit et d'automatisation IA d'entreprise.
**Mission de Stan** : développer le MCP / l'application qui automatise le traitement des appels d'offres de GSS.

**Personnes côté GSS identifiées dans l'audit** :
- *Sacha* — recherche d'AO, qualification, lecture DCE, visites de site, comptes rendus.
- *Mme Vaché* — responsable réponse AO (mémoire technique). Pilote la réponse.
- *M. Marchani* — responsable exploitation, décisionnaire.
- *Louis/Louise* — N+1 de Sacha.
- *Équipe chiffrage* (non nommée) — gère le BPU.

**Note de cohérence** : la transcription d'audit alterne entre « GIS » et « GSS » ; le nom validé est **GSS**.

---

## 2. Problème métier à résoudre

Aujourd'hui, le traitement d'un appel d'offres chez GSS suit cinq étapes manuelles :

1. **Veille** : Sacha cherche sur Nukema (agrégateur), filtre par mot-clé sécurité + zone géographique.
2. **Qualification** : tri manuel des résultats pour écarter les faux positifs (ex. : inspection bâtiment ≠ sécurité privée).
3. **Lecture du DCE** : extraction manuelle des infos clés (acheteur, dates, visite obligatoire ou non, pièces à fournir).
4. **Mail récapitulatif** envoyé à Marchani / Vaché / Louis.
5. **Visite de site** (≈ 70 % des AO) + compte-rendu transmis à Vaché qui rédige la réponse.

La **réponse** prend deux formes :
- **Cadre imposé** : l'acheteur fournit un template (cadre de réponse) à remplir question par question (≈ 50 % des cas).
- **Réponse libre** : GSS construit sa réponse à partir de son propre mémoire technique de base (≈ 50 % des cas).

**Gisement de valeur principal** identifié dans l'audit (citation de Mme Vaché) : *« démontrer au client qu'on a pensé à tous les cas de figure possibles sur la sécurité du site »*. Donc l'enjeu n'est pas seulement le gain de temps : c'est aussi la **qualité, la personnalisation, et le taux de réussite**.

---

## 3. Objectif produit (cœur V1)

**Promesse utilisateur** :
> *« GSS dépose un DCE complet (ZIP ou multi-fichiers), l'application produit un mémoire technique pré-rédigé + un BPU pré-rempli + une check-list de conformité administrative, en s'appuyant sur la base de contenu réutilisable de GSS (SLIDE REP AO). »*

**Forme du livrable final** : **application web** (SaaS interne GSS), pas un MCP nu. Un MCP exposé en complément peut être ajouté en V1.5 pour les power-users.

**Module de veille / scrapping Nukema** : prévu, mais **module distinct** du cœur génération. Cf. §11 Roadmap.

---

## 4. Fichiers fournis (corpus de référence)

### 4.1 Dossier `Cas-Univ-Rouen-MP2026-08/` — DCE complet entrant + réponse GSS sortante

Marché : *Appel d'offres ouvert 2026-08, Université de Rouen Normandie, prestations de sécurité-sûreté, 3 lots*.

| Fichier | Type | Rôle |
|---|---|---|
| `1-Acte d'Engagement.doc` | Pièce contractuelle | Formulaire administratif type DC4, à signer par le candidat retenu. |
| `2-RC 2026-08.doc` | Règlement de consultation | Règles administratives : pièces à fournir, modalités de remise, **critères de jugement pondérés**. |
| `3-CCAP 2026-08.docx` | Clauses administratives particulières | Cadre juridique et contractuel. |
| `4-CCTP 2026-08.docx` | Cahier des clauses techniques particulières | **Pièce centrale technique** : description des prestations attendues par lot, exigences opérationnelles. |
| `5-Mémoire Technique - lots 1-2-3.docx` | **Cadre de réponse imposé** | Template fourni par l'acheteur, à remplir par GSS. Contient les questions auxquelles GSS doit répondre. |
| `5-Memoire Technique - lots 1-2-3 GSS VF.pdf` | **Réponse GSS** | Mémoire technique rempli et soumis par GSS — exemple de sortie attendue. |
| `6-DPGF et BPU - lot 1 - sites 76.docx` | BPU lot 1 | Bordereau prix unitaires + Décomposition Prix Global Forfaitaire pour le département 76. |
| `6-DPGF et BPU - lot 2 - sites 27.docx` | BPU lot 2 | Idem pour le département 27 (Eure). |
| `6-BPU - lot 3 - télésécurité.docx` | BPU lot 3 | Tarifs télésurveillance. |
| `Annexes/Annexe 1 CCTP - Effectifs et horaires des postes de sécurité v2026.docx` | Annexe CCTP | Tableau effectifs / horaires par site. |
| `Annexes/Annexe 2 CCTP - Profils des agents en place v2026.docx` | Annexe CCTP | Liste qualifications agents actuels (reprise du personnel). |
| `Annexes/Annexe 3 CCTP - Pointeaux à installer v2026.docx` | Annexe CCTP | Points de contrôle ronde. |
| `Annexes/Annexe 4 CCTP - Liste des agents logés v2026.docx` | Annexe CCTP | Logements de fonction. |
| `Annexes/Annexe 5 CCTP - Liste des correspondants sûreté locaux v2026.docx` | Annexe CCTP | Contacts opérationnels. |
| `Annexes/Annexe 6 CCAP - Plans de l'Université de Rouen Normandie v2026.docx` | Annexe CCAP | Plans / cartographie des sites. |
| `Annexes/Annexe 7 CCTP - FORMULAIRE_RESERV_PRESTA_SECU_2026.doc` | Formulaire | Bon de commande prestation supplémentaire. |

### 4.2 Dossier `SLIDE REP AO/` — Base de connaissances réutilisable GSS

**119 fichiers PDF** (slides de mémoire technique pré-construites par GSS), organisés en **21 catégories thématiques** :

| Catégorie | Nb fichiers | Contenu |
|---|---|---|
| ABSENCE ET RETARD | 4 | Procédure remplacement agent. |
| EFFECTIFS ET ORGANIGRAMME | 2 | Organigramme + effectifs moyens. |
| ENGAGEMENT ECOLOGIQUE | 5 | Démarche RSE / développement durable. |
| FORMATION | 17 | Formations agents (SSIAP1, ADS, AMC, HOB0, PSC1, SST). |
| FORMATION INTERNE | 9 | Programmes formation interne GSS. |
| INTERLOCUTEUR UNIQUE | 1 | Schéma point de contact client. |
| LMC | 1 | Livre Mission Consignes. |
| MAIN COURANTE | 2 | Outil Track Force. |
| MANAGEMENT | 5 | Valeurs management. |
| MATERIEL | 6 | Matériel communication / équipement. |
| MISE EN PLACE | 1 | Processus de démarrage prestation. |
| MOYENS D'ACCES | 2 | Sécurisation accès. |
| NOUVEAU MARCHE | 4 | Gestion démarrage nouveau marché. |
| NOUVEL AGENT | 2 | Intégration nouvel agent. |
| PARTENAIRES | 21 | Liste partenaires / sous-traitants. |
| PLANNIFICATION | 2 | Gestion planning. |
| PROCEDURE | 19 | Procédures opérationnelles : incendie, intrusion, individu suspect, alarme, victime, élément perturbateur, PTI, ordre alerte incident. |
| RECRUTEMENT | 2 | Méthode recrutement. |
| SUIVI QUALITE ET CONTROLES | 7 | Contrôle qualité prestation, contrôles inopinés. |
| TENUES | 5 | Vestiaire / uniformes. |
| VALEURS | 1 | Valeurs entreprise. |

**Note workspace** : `SLIDE REP AO/` est ici un **lien symbolique** vers le dossier réel situé à `../SLIDE REP AO/`. L'agent peut le parcourir normalement comme un dossier.

**Format** : exclusivement des **PDF** (donc OCR/extraction texte requise — à vérifier si certains sont scannés ou texte natif).
**Usage attendu** : indexés dans un système RAG, ils alimentent la rédaction des sections du mémoire technique en proposant des blocs de contenu pré-validés par GSS.

### 4.3 Dossier `audit/`

`transcription_audit_GIS_appels_offres_propre.docx` — transcription nettoyée de l'audit Sacha + Mme Vaché. **Source de vérité pour le besoin métier**. À considérer comme spec fonctionnelle complémentaire.

---

## 5. Anatomie standard d'un DCE (cas Univ Rouen)

Structure à reconnaître automatiquement par le parseur :

### 5.1 Règlement de Consultation (RC) — `2-RC 2026-08.doc`

Sections présentes (validées sur le cas Univ Rouen) :

1. **Synoptique de la consultation** : objet, catégorie, CCAG, allotissement, codes CPV, durée.
2. **Conditions de participation** : conditions soumissionnaires, **visite des locaux** (date + obligation), variantes.
3. **Dossier de consultation** : retrait DCE, modifications.
4. **Éléments à produire** *(section critique à parser pour la check-list)* :
   - **Candidature** : DUME ou DC1+DC2 + déclaration sur l'honneur + note de présentation + références < 3 ans + attestation fiscale + attestations assurance.
   - **Offre** : Acte d'Engagement signé + BPU + DPGF + **mémoire technique valant cadre de réponse** + RIB.
5. **Modalités de remise** : plateforme, signature électronique XAdES/CAdES/PAdES.
6. **Critères de sélection** *(à extraire pour le scoring du mémoire généré)* :

   **Univ Rouen 2026-08 — barème de notation** :
   - **Valeur technique : 60 points**
     - Moyens humains affectés : **20 pts** (lots 1 et 2)
     - Moyens matériels affectés : **20 pts** (lots 1 et 2)
     - Télésurveillance et modalités d'intervention : **40 pts** (lot 3)
     - Plans de qualité : **10 pts** (tous lots)
     - Développement durable : **10 pts** (tous lots)
   - **Prix : 40 points**
     - DPGF : 30 pts (prestations de base)
     - BPU : 10 pts (prestations supplémentaires)
7. **Règlement des litiges**.

### 5.2 CCAP — `3-CCAP 2026-08.docx`

Sections :
- Dispositions générales (objet, procédure, allotissement, codes CPV, dates).
- Documents contractuels.
- Description générale de l'Université.
- Lieux d'exécution (6 campus listés).
- Visite du campus principal.
- Correspondants du marché.
- Mise en place des prestations.
- Responsabilités et obligations du titulaire.
- Modalités de prix, règlement, avance, pénalités, contrôle, assurance, résiliation, cession.

### 5.3 CCTP — `4-CCTP 2026-08.docx`

**Le document le plus important pour la génération de réponse.** Structure :

- **Article 1 — Contenu général des prestations** :
  - Prestations de base par campus.
  - Mise à disposition chef d'équipe SSIAP2 + adjoint.
  - Prestations supplémentaires « à la demande » (processus de commande, urgence).
  - Services de télésécurité.
- **Article 2/3 — Prestations par lot** (lot 1 : Seine-Maritime 76, lot 2 : Eure 27).
  - Détail prestations de base par campus.
  - Chef d'équipe.
  - Prestations supplémentaires.
- **Article 4 — Prestations télésécurité (lot 3)**.
- **Obligations du titulaire** (générales, particulières, ZRR).
- **Dispositions particulières concernant les agents** :
  - Reprise du personnel en poste *(important : transfert agents — Annexe 2)*.
  - Qualification et recyclage.
  - Présentation, comportement, tenue, équipement, véhicules.
  - Rondes, filtrage, ouverture/fermeture, rondes extérieures.
  - Limite SSIAP1.
  - Perception clés/badges.
  - Polyvalence, rotation, préférence prestations supplémentaires.
- **Accueil de stagiaires**.
- **Contrôle interne et audit**.

### 5.4 BPU / DPGF

Structure observée (`6-DPGF et BPU - lot 1`) :
- **Table prestations de base** (5 colonnes) : Prestation | HT annuel | TVA | TTC annuel | TTC mensuel.
  - 7+ lignes : campus principal, véhicules, autres campus, chef d'équipe, etc.
- **Table prestations supplémentaires** (7 colonnes) : Prestation | HT/h préavis >7j | TVA | TTC préavis >7j | HT/h préavis <7j | TVA | TTC préavis <7j.
  - Lignes : APS, SSIAP1, double qualification, rondier, maître-chien, SSIAP2, etc.

Pour le lot 3 (télésécurité) : table 4 colonnes (HT, TVA, TTC) avec lignes abonnement, intervention, raccordement, transmetteur.

**Le format BPU est variable** d'un AO à l'autre — le module devra reconnaître la structure tabulaire et la remplir.

---

## 6. Anatomie standard d'un mémoire technique GSS (cas cadre imposé Univ Rouen)

Quand l'acheteur impose un cadre (50 % des cas), structure observée dans `5-Mémoire Technique - lots 1-2-3.docx` :

```
[Identité candidat]
  - Dénomination
  - N° CNAPS d'autorisation d'exercer
  - Date d'obtention de l'autorisation

I - Moyens humains affectés spécifiquement au marché  [20 pts]
  - Moyens humains dédiés : qualifications et expérience
  - Moyens humains par prestation campus
  - Utilisation de la sous-traitance (oui N-1 / oui N-2 / non)
  - Dispositif palliatif absence
  - Coordonnées interlocuteur principal
  - Coordonnées interlocuteur devis prestations à la demande

II - Moyens matériels affectés spécifiquement au marché  [20 pts]

III - Organisation interne, management, qualité
  - Engagement qualité  [10 pts]
  - Performance environnementale  [10 pts]

IV - Télésurveillance et modalités d'intervention  [40 pts, lot 3 uniquement]
  - Certification APSAD R31 (P2 / P3 / P5)
  - Localisation station télésurveillance
  - Sous-traitance lever de doute
  - Couverture département 76 / 27
  - Report alarmes intrusion / technique / incendie
  - Moyens d'ouverture pour lever de doute
  - Délais contractuels maximums d'intervention
  - Nombre d'intervenants véhiculés disponibles W-E et JF < 20 km

[Date + signature]
```

**Pour la réponse libre** (50 % des cas), GSS utilise son propre plan structurel à partir du dossier `SLIDE REP AO` (à recomposer avec Mme Vaché — récupérer un exemple Rouen Expo / R&E mentionné dans l'audit).

---

## 7. Mapping `SLIDE REP AO` → sections mémoire technique

Pré-mapping recommandé pour le RAG (à raffiner après ingestion réelle des PDF) :

| Section du mémoire technique | Catégories `SLIDE REP AO` à mobiliser |
|---|---|
| Moyens humains, qualifications | FORMATION, FORMATION INTERNE, EFFECTIFS ET ORGANIGRAMME, RECRUTEMENT, NOUVEL AGENT |
| Moyens matériels | MATERIEL, TENUES, MAIN COURANTE, MOYENS D'ACCES |
| Organisation, management, qualité | MANAGEMENT, SUIVI QUALITE ET CONTROLES, LMC, INTERLOCUTEUR UNIQUE, MISE EN PLACE, NOUVEAU MARCHE, VALEURS |
| Procédures opérationnelles | PROCEDURE (incendie, intrusion, individu suspect, alarme, PTI, victime, élément perturbateur) |
| Continuité de service (absence) | ABSENCE ET RETARD, PLANNIFICATION |
| Engagement environnemental | ENGAGEMENT ECOLOGIQUE |
| Sous-traitance / partenaires | PARTENAIRES |

Le RAG doit pouvoir, pour chaque question du cadre imposé OU chaque section du plan libre, **retourner les 3-5 slides PDF les plus pertinents** + suggérer la trame de la réponse rédigée.

---

## 8. Spec fonctionnelle V1

### 8.1 Périmètre IN

**Module A — Ingestion DCE** :
- Upload : ZIP ou multi-fichiers (PDF, DOCX, DOC, XLSX).
- Détection automatique des pièces : RC / CCAP / CCTP / BPU / DPGF / Mémoire technique cadre / Annexes.
- OCR fallback pour PDF scannés.

**Module B — Analyse DCE** :
- Extraction structurée du RC : pièces à fournir (check-list), critères de notation pondérés, dates (limite, visite, démarrage), modalités de remise.
- Extraction structurée du CCTP : exigences techniques, prestations attendues, contraintes spécifiques au site, exigences agents (qualifications, équipements).
- Extraction des annexes : effectifs, profils agents existants, pointeaux, contacts, plans.
- Détection du mode de réponse : **cadre imposé** (template à remplir) **vs libre** (à composer).
- Génération de la **fiche de synthèse DCE** (équivalent du mail récap actuel de Sacha) destinée à Marchani / Vaché / Louis.

**Module C — Génération mémoire technique** :
- **Cas cadre imposé** : pour chaque question/section du template, génération d'une réponse rédigée s'appuyant sur le RAG `SLIDE REP AO` + personnalisation au contexte du site (extraite du CCTP).
- **Cas libre** : génération d'un plan structuré (modèle GSS) + rédaction de chaque section.
- **Différenciation qualitative** : module « scénarios anticipés » qui propose des cas de figure non explicitement demandés mais pertinents pour le site (risques contextuels). Cf. citation Mme Vaché.
- Export : DOCX éditable + PDF.

**Module D — Pré-remplissage BPU** :
- Reconnaissance de la structure tabulaire du BPU/DPGF fourni.
- Pré-remplissage en mode **assistant** (pas full-auto) : propose des prix à partir de l'historique GSS + grille tarifaire de référence.
- **Validation humaine obligatoire** avant export.
- Export DOCX/XLSX rempli.

**Module E — Check-list de conformité administrative** :
- Liste exhaustive des pièces à fournir extraite du RC.
- État de présence/absence de chaque pièce.
- Alerte sur les manquements (offre éliminée si pièce absente).

### 8.2 Périmètre OUT V1 (assumé, à acter avec Nira + GSS)

- **Scrapping et veille Nukema/BOAMP/TED** : module séparé V1.5/V2.
- **Visite physique de site** (planning, compte-rendu) : V2.
- **Génération de présentation orale** (phase 2, ≈ 10 % des cas) : V2.
- **Signature électronique** : hors scope (intégration plateforme existante).
- **Dépôt automatisé de l'offre** : hors scope (risque juridique élevé).

### 8.3 Interface utilisateur

Web app — workflow guidé étape par étape :
1. *Upload DCE* → barre de progression parsing.
2. *Fiche de synthèse DCE* → validation par l'utilisateur, possibilité d'édition.
3. *Check-list conformité* → cocher les pièces obtenues.
4. *Génération mémoire technique* → l'utilisateur peut éditer chaque section dans un éditeur WYSIWYG, regenerer une section, demander une variante.
5. *BPU* → tableur interne avec pré-remplissage + édition manuelle.
6. *Export* → DOCX + PDF.

Authentification par utilisateur (rôles : Sacha-veille, Vaché-rédaction, Marchani-validation).

---

## 9. Architecture technique recommandée

### 9.1 Stack proposée (à challenger)

- **Backend** : Python (FastAPI). Justification : écosystème IA/parsing mature, équipes Nira probablement Python.
- **Front-end** : Next.js (React + TypeScript) avec Tailwind. Éditeur WYSIWYG : TipTap ou Lexical.
- **Base de données** : PostgreSQL (dossiers, utilisateurs, versions de réponses, historique).
- **Vector DB pour RAG** : Qdrant ou pgvector (extension PostgreSQL) — pour indexer `SLIDE REP AO` + tous les mémoires techniques GSS historiques.
- **Stockage fichiers** : S3-compatible (MinIO en self-host, ou AWS S3, ou OVHcloud Object Storage si exigence souveraineté FR).
- **Orchestration LLM/agents** : LangGraph ou framework custom léger. Éviter LangChain « gros » qui ajoute du bruit.
- **LLM** :
  - Anthropic Claude Sonnet 4.6 pour génération longue / RAG / réflexion structurée.
  - Claude Haiku 4.5 pour tâches utilitaires (classification de pièces, extraction structurée).
- **OCR** : Tesseract (open-source) en fallback + Mistral OCR ou AWS Textract si budget.
- **Parsing DOCX/DOC** : python-docx + LibreOffice headless pour conversion .doc → .docx.
- **Parsing PDF** : pypdf + pdfplumber + Camelot (tables) ; unstructured.io en complément.

### 9.2 Modules logiques (mapping vers code)

```
gss-ao/
├── backend/
│   ├── ingestion/         # Module A : upload + détection pièces
│   ├── analysis/          # Module B : extraction RC, CCTP, BPU, annexes
│   │   ├── rc_parser.py
│   │   ├── cctp_parser.py
│   │   ├── bpu_parser.py
│   │   └── synthesis.py   # Fiche de synthèse DCE
│   ├── generation/        # Module C : rédaction mémoire technique
│   │   ├── template_filler.py    # cas cadre imposé
│   │   ├── free_composer.py      # cas libre
│   │   ├── scenario_agent.py     # scénarios anticipés
│   │   └── exporter.py
│   ├── bpu/               # Module D : pré-remplissage BPU
│   ├── compliance/        # Module E : check-list conformité
│   ├── rag/
│   │   ├── ingestion.py   # indexation SLIDE REP AO + MT historiques
│   │   ├── retrieval.py
│   │   └── reranker.py
│   ├── llm/
│   │   └── client.py      # wrapper Anthropic API
│   ├── db/
│   │   └── models.py
│   └── api/
│       └── routes.py
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
└── infra/
    ├── docker-compose.yml
    └── terraform/         # si déploiement cloud
```

### 9.3 Pipeline de génération (étape par étape)

```
[Upload DCE ZIP/files]
        ↓
[Module A : Détection pièces]
   - Classification par type (RC / CCAP / CCTP / BPU / Mémoire / Annexe)
   - Indices : nom fichier, structure, mots-clés contenu
        ↓
[Module B : Extraction structurée]
   - RC → pièces obligatoires + critères + dates + barème
   - CCTP → exigences techniques + contraintes site + spécificités agents
   - BPU → structure tabulaire + lignes de prix
   - Annexes → données contextuelles (effectifs, plans, contacts)
        ↓
[Détection mode de réponse]
   - Cadre imposé : présence d'un document type "Mémoire technique cadre de réponse"
   - Libre : pas de cadre fourni → utilisation du modèle GSS
        ↓
[Fiche de synthèse DCE] → validation utilisateur
        ↓
[Module E : Check-list conformité] (en parallèle)
        ↓
[Module C : Génération mémoire technique]
   Pour chaque question (cadre imposé) ou chaque section (libre) :
     a. Récupération RAG : SLIDE REP AO + mémoires techniques GSS historiques
     b. Contexte : extraits CCTP pertinents + annexes
     c. Prompt LLM (Sonnet) : générer réponse personnalisée
     d. Agent scénarios anticipés : suggère ajouts différenciants
   Édition utilisateur possible à chaque section.
        ↓
[Module D : Pré-remplissage BPU]
   - Parsing tableau BPU fourni
   - Suggestion de prix (grille GSS + historique)
   - Validation humaine obligatoire
        ↓
[Export final : DOCX + PDF + BPU rempli]
```

### 9.4 RAG — précisions

- **Indexation `SLIDE REP AO`** :
  - 119 PDF à OCR + chunking sémantique.
  - Métadonnées par chunk : catégorie (1 des 21), nom du fichier source, mots-clés extraits.
  - Embeddings : `text-embedding-3-large` (OpenAI) ou `voyage-3` (Voyage AI) ou modèle français spécialisé `bge-multilingual`.
- **Indexation mémoires techniques historiques** (à demander à GSS) :
  - 10+ mémoires passés idéalement.
  - Métadonnées : client, secteur, type de site, taille, résultat (gagné/perdu si possible).
- **Retrieval hybride** : BM25 + vecteur, reranker Cohere ou Voyage.
- **Filtrage par section** : pour chaque section du mémoire à rédiger, ne récupérer que les chunks des catégories pertinentes (cf. §7 mapping).

---

## 10. KPIs et critères de succès

À acter avec GSS avant déploiement (sinon impossible d'évaluer la valeur de l'outil).

**Quantitatifs** :
- Temps de production d'un mémoire technique : **baseline à mesurer**, cible **-60 % minimum**.
- Taux de complétude automatique de la check-list de conformité : cible **100 % des pièces administratives détectées**.
- Précision de l'extraction CCTP (exigences techniques correctement identifiées) : cible **≥ 90 %** sur un set de validation.
- Taux d'erreur BPU (lignes mal remplies ou mal interprétées) : cible **< 5 %**, validation humaine systématique.

**Qualitatifs** :
- Évaluation à l'aveugle par Mme Vaché : note qualité du mémoire généré (1-10) vs mémoire actuel.
- Taux de gain : *à long terme*, comparer le taux de marchés gagnés avant/après (échantillon nécessaire ≥ 20 dossiers post-déploiement).

---

## 11. Hors-scope V1 et roadmap

**V1 (cœur)** : DCE → mémoire technique + BPU + check-list, sur cas cadre imposé ET réponse libre, avec module scénarios anticipés. Cas de validation = Université de Rouen 2026-08 fourni.

**V1.5** :
- Module **veille Nukema + BOAMP + TED** (scrapping + filtrage CPV + mail récapitulatif automatique).
- MCP exposé pour usage avancé dans Claude/ChatGPT.

**V2** :
- Module **visite de site** : planification, capture photo/notes terrain, compte-rendu structuré.
- Module **présentation orale** : génération PPT depuis le mémoire pour la phase 2 (≈ 10 % des cas).
- Module **historique attributaires** : enrichissement par BOAMP / decisions-marches-publics.com (titulaires précédents, prix, durée).
- Module **enrichissement externe** : Pappers (données entreprise), presse, site web client.

**Plateformes de veille** (priorité pour V1.5) :
- **Nukema** (URL : `https://marches-publics.nukema.com`) — déjà utilisée par GSS. **À vérifier** : API officielle ou scrapping front avec compte ? CGU ?
- **BOAMP** — flux officiel français, API ouverte gratuite.
- **TED** (Tenders Electronic Daily) — équivalent européen, API ouverte gratuite.
- Plateformes complémentaires si besoin : AWS-Achat, Maximilien (IDF), Megalis (Bretagne), e-marchespublics.com, achatpublic.com, France Marchés, Klekoon.

---

## 12. Risques et points d'attention

### Risques techniques

- **OCR sur `SLIDE REP AO`** : si les PDF sont des images (scans), la qualité d'extraction conditionne tout le RAG. À tester en priorité sur un échantillon.
- **Variabilité du format BPU** : explicitement souligné par Sacha dans l'audit. Ne pas hardcoder une structure unique ; faire un parseur tolérant + revue humaine systématique.
- **PDF/DOC propriétaires complexes** : les .doc legacy (RC, Acte d'engagement, Annexe 7) nécessitent conversion via LibreOffice headless. Vérifier la fidélité de conversion.
- **Hallucinations LLM dans le BPU** : risque maximal (impact financier direct). Ne jamais laisser le LLM seul sur les chiffres ; positionner le LLM comme suggesteur, pas comme remplisseur.

### Risques métier

- **Base GSS générique** : si `SLIDE REP AO` est trop générique (slides marketing au lieu de réponses opérationnelles), le mémoire généré sera plat. À tester dès l'ingestion.
- **Manque d'exemples « libres »** : on a un cas cadre imposé (Univ Rouen). Demander à GSS un cas réponse libre (Rouen Expo / R&E mentionné dans l'audit) pour caler le module C cas libre.
- **Personne qui chiffre absente du brief** : indispensable pour le module BPU. Acter un entretien dédié.

### Risques juridiques

- **Scrapping Nukema** : vérifier CGU. Si interdit, soit API soit usage limité par compte utilisateur GSS (avec son login).
- **Données DCE confidentielles** : certains marchés (défense, sécurité publique) ont des clauses de confidentialité. Filtrer côté ingestion + ne pas réutiliser pour le RAG sans accord.
- **RGPD** : annexes 2 (profils agents en place) et 4 (agents logés) contiennent des données personnelles. Chiffrage au repos, accès restreint, durée de conservation à définir.
- **TOS API LLM** : si déploiement on-prem souverain exigé par GSS, prévoir alternative (Mistral Large / Llama local). À clarifier avec GSS.

### Risques projet

- **Scope creep BPU** : le BPU dans V1 est ambitieux. Borner précisément en mode assistant.
- **Manque de validation par utilisateur** : tester le workflow avec Sacha + Vaché dès le prototype (UX test).

---

## 13. Données / accès à obtenir de GSS avant de coder

À demander explicitement (Stan, action immédiate) :

1. **5 à 10 mémoires techniques GSS passés** (DOCX/PDF), idéalement avec issue connue (gagné/perdu).
2. **3 à 5 BPU remplis** par GSS sur marchés passés (différents formats).
3. **Grille tarifaire de référence GSS** (taux horaires APS, SSIAP1, SSIAP2, etc.).
4. **Accès à la personne qui chiffre** (1h d'entretien minimum) pour comprendre la logique BPU.
5. **Un cas « réponse libre »** : DCE + réponse GSS (ex. Rouen Expo / R&E).
6. **Confirmation usage Nukema** : login, type de compte, accès API existant ?
7. **Confirmation hébergement** : cloud (lequel ?) ou on-prem ?
8. **Charte graphique GSS** : pour export DOCX au format GSS.

---

## 14. Première itération demandée à l'agent d'architecture

**Mission pour Claude Code / Antigravity** :

> Sur la base de ce brief, du DCE complet (dossier `Cas-Univ-Rouen-MP2026-08/`), de la base `SLIDE REP AO/` et de la transcription d'audit (dossier `audit/`), **produire** :
>
> 1. **Un repository scaffolding** suivant la structure §9.2 — backend FastAPI + frontend Next.js + infra Docker Compose. Tous les modules avec leurs interfaces (types + signatures de fonctions), même si l'implémentation est `NotImplementedError`. Tests unitaires placeholders.
>
> 2. **Un parseur RC opérationnel** sur `Cas-Univ-Rouen-MP2026-08/2-RC 2026-08.doc` : extraction de la liste des pièces à fournir (candidature + offre) et du barème de notation pondéré. Doit produire un JSON conforme au schéma défini en §5.1.
>
> 3. **Un parseur CCTP opérationnel** sur `Cas-Univ-Rouen-MP2026-08/4-CCTP 2026-08.docx` : extraction de la structure hiérarchique des prestations + détection des exigences agents (qualifications, équipements). Produit un JSON structuré.
>
> 4. **Un script d'ingestion RAG** : convertit les 119 PDF de `SLIDE REP AO/` en chunks indexés dans Qdrant (ou pgvector), avec métadonnées de catégorie. Doit fonctionner en CLI.
>
> 5. **Un README technique** détaillé : setup local, dépendances, commandes de test.
>
> 6. **Un document `ARCHITECTURE.md`** : schéma textuel des modules, des flux de données, et des choix techniques justifiés.
>
> **Ne pas** implémenter la génération LLM (Module C) ni le module BPU complet à cette itération — uniquement le scaffolding + parseurs A/B + RAG ingestion. Le but est d'avoir une base technique solide à challenger avant d'attaquer la génération.

---

## 15. Décisions à prendre / clarifications avant V1

À documenter dans un `DECISIONS.md` au fur et à mesure :

- [ ] Hébergement : cloud public / cloud souverain FR / on-prem GSS ?
- [ ] Choix LLM final : Anthropic uniquement / multi-providers / Mistral local ?
- [ ] Vector DB final : Qdrant managed / self-host / pgvector ?
- [ ] BPU V1 : mode assistant uniquement (recommandé) ou tentative full-auto ?
- [ ] Module veille : V1 ou V1.5 strict ?
- [ ] Authentification : SSO entreprise GSS (Azure AD ?) ou auth standalone ?
- [ ] Budget LLM mensuel ciblé (impacte choix Sonnet vs Haiku par défaut).

---

**FIN DU BRIEF.**

Toutes les références chiffrées (pourcentages, points de notation, comptes de fichiers) sont issues directement du DCE Université de Rouen Normandie 2026-08 ou de l'audit transcrit. Aucune extrapolation non sourcée.
