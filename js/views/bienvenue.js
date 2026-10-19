// Premier lancement : trois étapes pour démarrer.
import * as st from '../store.js';
import { S } from '../store.js';
import { icon, toast } from '../ui.js';
import { topbar, go } from '../app.js';

export async function render(root) {
  const d1 = !!S.reglages.domicile, d2 = S.clients.length > 0;
  root.innerHTML = topbar() + `<div class="page" style="max-width:960px">
    <div><h1>Bonjour Jérôme</h1><p class="muted" style="margin-top:8px;font-size:18px">Trois étapes et vos clients apparaissent sur la carte.</p></div>
    <div class="steps">
      <a class="stp${d1 ? ' done' : ''}" href="#/reglages"><span class="n">${d1 ? icon('check') : 1}</span><span class="grow"><b>Vos réglages</b><br><span class="small muted">Adresse de départ, départements, seuils de visite</span></span>${icon('next')}</a>
      <a class="stp${d2 ? ' done' : ''}" href="#/import"><span class="n">${d2 ? icon('check') : 2}</span><span class="grow"><b>Importer vos clients</b><br><span class="small muted">Un fichier Excel ou PDF, puis le chiffre d'affaires</span></span>${icon('next')}</a>
      <a class="stp" href="#/carte"><span class="n">3</span><span class="grow"><b>Voir la carte</b><br><span class="small muted">Vert, orange, rouge : qui aller voir en priorité</span></span>${icon('next')}</a>
    </div>
    <div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><b>Envie de voir avant d'importer ?</b><p class="small muted">Des clients d'exemple sur votre secteur, à retirer en un geste dans les Réglages.</p></div>
      <button class="btn btn-s" id="demo">Voir avec des exemples</button></div>
  </div>`;
  root.querySelector('#demo').onclick = async () => { await st.loadDemo(); toast('Clients d\'exemple affichés'); go('#/carte'); };
}
