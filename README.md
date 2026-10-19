# FirstDiff, application de Jérôme Rivault

Application web installable sur téléphone et ordinateur : carte du secteur, fiches clients, classement, tournées, import Excel/PDF, réglages. Elle fonctionne hors réseau une fois ouverte une première fois.

## Mettre en ligne (Netlify)

1. Dézipper `firstdiff-app.zip`.
2. Ouvrir https://app.netlify.com/drop (créer un compte gratuit si besoin) et glisser le dossier `firstdiff-app` dans la page.
3. Netlify donne une adresse du type `https://xxxx.netlify.app`. Dans *Site configuration > Change site name*, mettre par exemple `firstdiff-jr`.

Envoyer ce lien à Jérôme. Sur son téléphone : ouvrir le lien, puis *Ajouter à l'écran d'accueil* (Safari : bouton Partager ; Chrome : menu). L'icône FirstDiff apparaît comme une vraie application.

## Mettre à jour

1. Modifier les fichiers, puis dans `sw.js` changer `VERSION = 'firstdiff-v1'` en `v2`, `v3`…
2. Sur Netlify, onglet *Deploys*, glisser le nouveau dossier dans la zone de dépôt.

La nouvelle version s'affiche à la deuxième ouverture de l'application.

## Données

- Tout est enregistré **sur l'appareil** (stockage du navigateur). Rien n'est envoyé sur un serveur.
- Téléphone et ordinateur ne se synchronisent pas tout seuls : *Réglages > Sauvegarder* produit un fichier, *Restaurer* le recharge sur un autre appareil.
- L'application rappelle de faire une sauvegarde tous les 30 jours.

## Services extérieurs (gratuits, sans clé)

| Usage | Service |
|---|---|
| Fond de carte | OpenFreeMap (gratuit, sans compte ni clé), affiché avec MapLibre. Clair « Positron », sombre « Dark » |
| Adresses vers position GPS | api-adresse.data.gouv.fr (Base Adresse Nationale) |
| Kilomètres et temps de route | OSRM (router.project-osrm.org). Sans réseau : estimation |
| Navigation | Plans, Google Maps ou Waze, au choix dans Réglages > Guidage (Plans par défaut sur iPhone) |

## Formats d'import reconnus

- **Clients** (Excel, CSV ou PDF avec tableau) : colonnes comme *Code client, Raison sociale/Nom, Contact, Téléphone, Mail, Adresse, CP, Ville, Marque*. La ligne de titres peut être plus bas que la première ligne.
- **Chiffre d'affaires** : une ligne par facture (*Client ou Code client, Date, Montant HT, Marque*) ou une colonne par mois (*janv. 2026, févr. 2026…*). Les montants sont regroupés par client et par mois : réimporter le même fichier met à jour les chiffres au lieu de les ajouter deux fois.
- **Tarifs** : n'importe quel PDF ou Excel, rangé par marque et consultable depuis l'onglet Import.

Si une colonne n'est pas reconnue, *Colonnes reconnues* dans l'aperçu d'import permet de la choisir à la main.

## Structure

```
index.html, manifest.webmanifest, sw.js, _headers
css/app.css           styles (couleurs claires et sombres)
js/app.js             navigation et thème
js/store.js           données, statuts, CA, rappels, sauvegarde
js/db.js              stockage IndexedDB
js/carto.js           carte (MapLibre + OpenFreeMap)
js/geo.js             adresses, itinéraires, liens GPS
js/importers.js       lecture Excel/PDF et rapprochement
js/views/*.js         un fichier par écran
data/                 contours des départements, clients d'exemple
vendor/               MapLibre, SheetJS, pdf.js, polices
```

Aucune étape de compilation : les fichiers se modifient directement.
