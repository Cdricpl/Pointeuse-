# 🕒 Pointeuse — École des devoirs

Application web simple de **pointeuse** pour **2 employées** avec un **accès administrateur**.
Elle gère les horaires imposés, la justification des heures effectuées hors horaire,
la validation par l'admin (heures supplémentaires / récupérations) et des statistiques.

Aucune dépendance, aucun framework lourd : uniquement **Node.js** (modules natifs) et
un stockage **JSON**. Fonctionne dès le premier lancement.

---

## 🚀 Lancer l'application

Pré-requis : avoir **Node.js** installé (version 16 ou plus récente).

```bash
node server.js
```

Puis ouvrir dans le navigateur : **http://localhost:3000**

> Aucune installation (`npm install`) n'est nécessaire : le serveur n'utilise que
> les modules livrés avec Node.js.

---

## 👥 Comptes par défaut

| Compte      | Rôle      | Code PIN |
|-------------|-----------|----------|
| Employée 1  | Employée  | `1111`   |
| Employée 2  | Employée  | `2222`   |
| Admin       | Admin     | `0000`   |

Les comptes et PIN sont définis dans `data/db.json` (créé automatiquement au
premier lancement). Vous pouvez y modifier les noms ou les PIN.

---

## 🧭 Les 3 pages

1. **Connexion** (`index.html`) — choix du compte + code PIN.
2. **Espace employée** (`employee.html`) — pointeuse + horaire imposé + historique.
3. **Espace admin** (`admin.html`) — horaires, validations, statistiques, tous les pointages.

---

## ✨ Fonctionnalités

### Pour les employées
- **▶️ Commencer le travail** : enregistre l'heure d'arrivée.
- **⏹️ Terminer le travail** : enregistre l'heure de départ.
- Récapitulatif **du jour** et **de la semaine**.
- Historique personnel en lecture seule : **une employée ne peut jamais modifier ses heures**.

### Horaires imposés (définis par l'admin)
- Heure de **début** et de **fin** (ex. 14h–18h).
- **Jours obligatoires** de présence.
- Les employées **voient** leur horaire mais ne peuvent pas le changer.

### Justification automatique des écarts
Quand une employée pointe **en dehors de l'horaire imposé** (arrivée en avance,
départ en retard, ou travail un jour non prévu) et que l'écart dépasse **5 minutes** :
1. L'application **calcule automatiquement l'écart** (en minutes).
2. Elle **exige une justification** (champ texte obligatoire).
3. Le pointage passe **« En attente de validation Admin »**.

### Validation par l'admin
L'admin peut, pour chaque justification en attente :
- **Valider** ou **refuser**.
- Classer l'écart validé en **Heures supplémentaires** ou **Récupération**.

### Tableau de bord admin
- Vue **globale** des pointages des deux employées, avec **filtres** (employée, période).
- Liste des **justifications en attente**.
- **Statistiques** par employée : total heures prestées, heures supplémentaires, récupérations.

---

## 🔐 Règles de sécurité

- Les employées **ne peuvent jamais modifier leurs heures** (aucune route API ne le permet côté employée).
- Seul l'**admin** peut : modifier les horaires, valider/refuser les justifications,
  et corriger un pointage (`/api/admin/edit-punch`).
- Chaque appel API vérifie le **jeton de session** et le **rôle**.

---

## 🗂️ Architecture du projet

```
Pointeuse-/
├── server.js            # Serveur HTTP + API (Node natif, aucune dépendance)
├── package.json         # Script "start" (optionnel : npm start)
├── data/
│   └── db.json          # Base de données JSON (créée au 1er lancement)
├── public/
│   ├── index.html       # Page de connexion
│   ├── employee.html    # Espace employée (pointeuse + historique)
│   ├── admin.html       # Espace admin (horaires + validations + stats)
│   ├── common.js        # Fonctions partagées (API, session, formatage)
│   └── style.css        # Feuille de style commune
└── README.md
```

### Pourquoi ce choix technique ?
- **Node.js natif + JSON** : aucun `npm install`, aucun serveur de base de données à
  configurer. C'est le plus simple à installer et à maintenir pour 2 employées.
- Le stockage JSON (`data/db.json`) est lisible et modifiable à la main si besoin.
- Si un jour le volume grandit, on pourra remplacer le fichier JSON par SQLite sans
  changer le reste de l'application (l'API resterait identique).

---

## 🧪 Démonstration rapide

1. Lancer `node server.js` et ouvrir http://localhost:3000.
2. **Connexion Employée 1** (PIN `1111`) → cliquer **Commencer le travail**, puis
   **Terminer le travail**. Si vous pointez pendant l'horaire imposé, c'est « Normal ».
3. Pour tester une **heure supplémentaire** : l'admin peut d'abord fixer un horaire court
   (ex. 14h–15h) pour l'Employée 1 ; en pointant plus longtemps, l'application demandera
   une **justification** et le pointage passera « En attente ».
4. **Connexion Admin** (PIN `0000`) → onglet **Justifications en attente** :
   choisir « Heures supplémentaires » ou « Récupération » puis **Valider**.
5. Les **statistiques** de l'admin se mettent à jour automatiquement.

---

## ⚙️ Notes

- Le port peut être changé : `PORT=8080 node server.js`.
- Les sessions sont gardées en mémoire : après un redémarrage du serveur,
  il suffit de se reconnecter.
- Pour repartir de zéro, supprimez le fichier `data/db.json` (il sera recréé).
