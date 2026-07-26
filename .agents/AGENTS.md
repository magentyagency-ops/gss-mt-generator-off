# GSS - Règles de Génération pour les Mémoires Techniques (Marp & D2)

Ces règles doivent être strictement appliquées chaque fois que l'agent génère ou modifie un mémoire technique ou un schéma d'architecture pour le projet GSS Sécurité.

## 1. Stratégie Visuelle et Pédagogique (Mémoires Techniques)
- **Densité Visuelle :** Chaque mémoire technique doit intégrer environ **15 à 20 schémas D2** hautement pertinents.
- **Personnalisation :** Les schémas ne doivent JAMAIS être génériques. Ils doivent être sur-mesure, adaptés spécifiquement à l'appel d'offres (AO) et au client final.
- **Objectif Pédagogique :** Les schémas doivent démontrer visuellement les liens logiques entre les compétences de GSS, les processus métiers, la sécurité, et les bénéfices directs pour le client.

## 2. Contraintes Strictes de Mise en Page (Format A4 & Marp)
Les schémas sont compilés en PDF via Marp CLI. La règle absolue est : **Une seule page. Aucune coupure. Aucun débordement. Aucun schéma minuscule.**
- Le schéma doit occuper entre **55 % et 70 % de la hauteur de la page** (soit environ `350px - 440px`).
- Conserver des marges d'environ **2 cm** de tous les côtés.
- L'intégration dans le Markdown Marp doit utiliser ce conteneur précis pour garantir le responsive sans débordement :
  ```html
  <div style="text-align: center; margin: 15px 0; width: 100%;">
    <img src="./schema.svg" alt="Schéma" style="width: 85%; height: auto; max-height: 440px; object-fit: contain; display: block; margin: 0 auto;" />
  </div>
  ```

## 3. Ingénierie du Layout D2 (Cœur du Réacteur)
Pour garantir que le SVG s'affiche en grand avec des textes lisibles (sans être rétréci à l'extrême par le redimensionnement A4), la structure du code D2 doit obéir à ces lois :
- **Topologie Arborescente (Tree Layout) :** Éviter à tout prix les longues chaînes horizontales (`A -> B -> C -> D`). Utiliser plutôt une racine qui se divise en branches parallèles (ex: un niveau 1 `Frontend` qui descend vers 2 colonnes parallèles `Backend` et `Stockage`).
- **Direction Verticale :** Imposer `direction: down` au niveau global et dans les conteneurs majeurs pour favoriser un ratio équilibré (ex: 1.12:1).
- **Polices Géantes :** La taille des textes dans le code D2 doit être énorme pour survivre à la mise à l'échelle sur le slide.
  - Noeuds / Boîtes : `font-size: 20` à `44` (gras).
  - Flèches / Liens : `font-size: 16` à `32` (gras).
- **Syntaxe D2 Stricte :** Ne **JAMAIS** utiliser de nombres à virgule (floats) pour `stroke-width` (ex: `1.5`). Toujours utiliser des entiers (`1`, `2`, `3`), sinon le compilateur Kroki échouera avec une erreur 400.
- **Répartition du Texte :** Utiliser systématiquement `\n` pour couper les longs textes dans les nœuds et réduire leur largeur brute.
