// Moteur de règles Catan (logique pure, sans interface). L'état est un objet JSON stocké dans Firebase.
// Après lecture depuis Firebase, appeler Moteur.norm(s) pour restaurer les tableaux/objets vides.
(function (root) {
  const RES = ['bois','brique','mouton','ble','minerai'];
  const TERRAIN = { foret:'bois', colline:'brique', pre:'mouton', champ:'ble', montagne:'minerai' };
  const COUT = { route:{bois:1,brique:1}, colonie:{bois:1,brique:1,mouton:1,ble:1}, ville:{ble:2,minerai:3}, dev:{mouton:1,ble:1,minerai:1} };
  const R = 1 / Math.sqrt(3), cle = (x, y) => Math.round(x*100) + ',' + Math.round(y*100);
  const alea = n => Math.floor(Math.random() * n);
  const melange = a => { a = a.slice(); for (let i = a.length-1; i > 0; i--) { const j = alea(i+1); [a[i],a[j]] = [a[j],a[i]]; } return a; };
  const err = m => ({ erreur: m }), OK = { ok: true };

  // ---- Topologie : sommets, arêtes, coins de chaque hexagone (selon la taille du plateau) ----
  const caches = {};
  function topo(s) {
    const g = s.nb >= 5 ? 'g' : 'p'; if (caches[g]) return caches[g];
    const V = new Map(), vs = [], es = new Map(), edgeById = {};
    const vid = (x, y) => { const k = cle(x,y); if (!V.has(k)) { V.set(k, vs.length); vs.push({ hexs:[], voisins:[] }); } return V.get(k); };
    const coins = s.plateau.hexs.map((h, i) => {
      const c = [0,1,2,3,4,5].map(k => { const a = (60*k+30)*Math.PI/180; return vid(h.x + R*Math.cos(a), h.y + R*Math.sin(a)); });
      c.forEach((v, k) => { vs[v].hexs.push(i); const w = c[(k+1)%6], a = Math.min(v,w), b = Math.max(v,w), id = a+'-'+b;
        if (!es.has(id)) { es.set(id, { id, a, b }); edgeById[id] = es.get(id); vs[v].voisins.push(w); vs[w].voisins.push(v); } });
      return c; });
    return caches[g] = { vs, edges:[...es.values()], edgeById, coins };
  }
  const objet = o => Array.isArray(o) ? Object.fromEntries(o.map((x, i) => [i, x]).filter(([, x]) => x != null)) : (o || {});
  const norm = s => { s.colonies = objet(s.colonies); s.routes = objet(s.routes); s.ecartes = objet(s.ecartes); s.routeMax = s.routeMax || { j:null, len:0 }; s.armee = s.armee || { j:null, n:0 };
    if (s.moutons) { s.moutons.banque = s.moutons.banque || []; s.moutons.mains = s.moutons.mains || {}; s.moutons.noms = s.moutons.noms || {};
      s.ordre.forEach(j => s.moutons.mains[j] = s.moutons.mains[j] || []); }
    s.pioche = s.pioche || []; s.aDefausser = s.aDefausser || {};
    s.ordre.forEach(j => { const p = s.joueurs[j]; p.dev = p.dev || []; p.devNouv = p.devNouv || []; RES.forEach(r => p.res[r] = p.res[r] || 0); }); return s; };

  // Cartes mouton : chaque carte est un objet distinct (id). Après chaque action, on aligne les listes d'ids sur les compteurs de laine :
  // une carte qui quitte un porteur est tirée au hasard parmi ses cartes, puis attribuée au hasard aux porteurs qui en reçoivent.
  function syncMoutons(s) {
    const m = s.moutons; if (!m) return; norm(s);
    const H = [[m.banque, s.banque.mouton]].concat(s.ordre.map(j => [m.mains[j], s.joueurs[j].res.mouton])), pool = [];
    H.forEach(([l, n]) => { while (l.length > n) pool.push(l.splice(alea(l.length), 1)[0]); });
    H.forEach(([l, n]) => { while (l.length < n && pool.length) l.push(pool.splice(alea(pool.length), 1)[0]); });
  }
  function creer(noms, plateau, nb) {
    const grand = nb >= 5, banque = {}; RES.forEach(r => banque[r] = grand ? 24 : 19);
    const cartes = grand ? { chevalier:20, pv:5, routes:3, invention:3, monopole:3 } : { chevalier:14, pv:5, routes:2, invention:2, monopole:2 };
    const joueurs = {}; noms.forEach(j => joueurs[j] = { res:{bois:0,brique:0,mouton:0,ble:0,minerai:0}, dev:[], devNouv:[], chevaliers:0, pieces:{route:15,colonie:5,ville:4} });
    return norm({ ordre:noms, nb, plateau, tour:0, phase:'setup', setup:{ i:0, attend:'colonie' }, des:null, joueurs, colonies:{}, routes:{},
      voleur:plateau.hexs.findIndex(h => h.type === 'desert'), banque, pioche:melange(Object.entries(cartes).flatMap(([t,n]) => Array(n).fill(t))),
      routeMax:{j:null,len:0}, armee:{j:null,n:0}, vainqueur:null, devJoue:false, routesGratuites:0 });
  }
  function courant(s) {
    const n = s.ordre.length;
    if (s.phase === 'setup') return s.ordre[s.setup.i < n ? s.setup.i : 2*n-1-s.setup.i];
    if (s.speciale) return s.speciale.restants[0]; // phase du joueur jumelé (5-6 joueurs)
    return s.ordre[s.tour];
  }
  const nbCartes = p => RES.reduce((t, r) => t + p.res[r], 0);
  function pv(s, j) { let t = 0; for (const v in s.colonies) if (s.colonies[v].j === j) t += s.colonies[v].ville ? 2 : 1;
    t += s.joueurs[j].dev.concat(s.joueurs[j].devNouv).filter(c => c === 'pv').length;
    return t + (s.routeMax.j === j ? 2 : 0) + (s.armee.j === j ? 2 : 0); }
  const paie = (s, j, cout) => { for (const r in cout) { s.joueurs[j].res[r] -= cout[r]; s.banque[r] += cout[r]; } };
  const peutPayer = (s, j, cout) => Object.keys(cout).every(r => s.joueurs[j].res[r] >= cout[r]);

  // ---- Légalité des placements ----
  function peutColonie(s, j, v, initial) {
    const t = topo(s); if (s.colonies[v]) return false;
    if (t.vs[v].voisins.some(w => s.colonies[w])) return false; // règle de distance
    if (initial) return true;
    return t.vs[v].voisins.some(w => s.routes[Math.min(v,w)+'-'+Math.max(v,w)] === j);
  }
  function peutRoute(s, j, e, dernier) {
    const t = topo(s), ed = t.edgeById[e]; if (!ed || s.routes[e]) return false;
    if (dernier !== undefined) return ed.a === dernier || ed.b === dernier;
    return [ed.a, ed.b].some(v => (s.colonies[v] && s.colonies[v].j === j) ||
      (!(s.colonies[v] && s.colonies[v].j !== j) && t.vs[v].voisins.some(w => s.routes[Math.min(v,w)+'-'+Math.max(v,w)] === j)));
  }
  // ---- Route la plus longue / armée ----
  function routeLen(s, j) {
    const t = topo(s), adj = {}; let best = 0;
    Object.keys(s.routes).filter(e => s.routes[e] === j).forEach(e => { const ed = t.edgeById[e]; [ed.a, ed.b].forEach(v => (adj[v] = adj[v] || []).push(ed)); });
    const dfs = (v, used, len) => { best = Math.max(best, len); if (len > 0 && s.colonies[v] && s.colonies[v].j !== j) return;
      for (const e of adj[v] || []) if (!used.has(e.id)) { used.add(e.id); dfs(e.a === v ? e.b : e.a, used, len+1); used.delete(e.id); } };
    Object.keys(adj).forEach(v => dfs(+v, new Set(), 0)); return best;
  }
  function majRoute(s) {
    const L = {}; s.ordre.forEach(j => L[j] = routeLen(s, j));
    const max = Math.max(...Object.values(L)), tops = s.ordre.filter(j => L[j] === max), h = s.routeMax.j;
    if (max < 5) s.routeMax = { j:null, len:0 };
    else if (h && L[h] === max) s.routeMax = { j:h, len:max };
    else if (tops.length === 1) s.routeMax = { j:tops[0], len:max };
    else s.routeMax = { j:null, len:max };
  }
  const verifVictoire = s => { const j = courant(s); if (pv(s, j) >= 10) { s.vainqueur = j; s.phase = 'fin'; } };

  // ---- Mise en place en serpent ----
  function colonieInitiale(s, j, v) {
    if (s.phase !== 'setup' || s.setup.attend !== 'colonie' || courant(s) !== j) return err('Pas votre placement');
    if (!peutColonie(s, j, v, true)) return err('Emplacement interdit');
    s.colonies[v] = { j, ville:false }; s.joueurs[j].pieces.colonie--; s.setup.dernier = v; s.setup.attend = 'route';
    if (s.setup.i >= s.ordre.length) topo(s).vs[v].hexs.forEach(h => { const r = TERRAIN[s.plateau.hexs[h].type]; if (r && s.banque[r] > 0) { s.banque[r]--; s.joueurs[j].res[r]++; } });
    return OK;
  }
  function routeInitiale(s, j, e) {
    if (s.phase !== 'setup' || s.setup.attend !== 'route' || courant(s) !== j) return err('Pas votre placement');
    if (!peutRoute(s, j, e, s.setup.dernier)) return err('Route interdite');
    s.routes[e] = j; s.joueurs[j].pieces.route--; s.setup.i++; s.setup.attend = 'colonie';
    if (s.setup.i === 2*s.ordre.length) { s.phase = 'des'; s.tour = 0; delete s.setup; }
    return OK;
  }
  // ---- Dés, production, 7 ----
  function lancer(s, j) {
    if (s.phase !== 'des' || courant(s) !== j) return err('Pas le moment');
    const d = [1+alea(6), 1+alea(6)], tot = d[0]+d[1]; s.des = d;
    if (tot === 7) { s.aDefausser = {}; s.ordre.forEach(x => { const n = nbCartes(s.joueurs[x]); if (n > 7) s.aDefausser[x] = Math.floor(n/2); });
      s.retour = 'principal'; s.phase = Object.keys(s.aDefausser).length ? 'defausse' : 'voleur'; return { ok:true, des:d }; }
    const dem = {}; // demande par ressource et par joueur
    s.plateau.hexs.forEach((h, i) => { const r = TERRAIN[h.type]; if (h.jeton !== tot || i === s.voleur || !r) return;
      topo(s).coins[i].forEach(v => { const c = s.colonies[v]; if (c) { dem[r] = dem[r] || {}; dem[r][c.j] = (dem[r][c.j] || 0) + (c.ville ? 2 : 1); } }); });
    for (const r in dem) { const tous = Object.entries(dem[r]), total = tous.reduce((a, [, n]) => a + n, 0);
      if (total <= s.banque[r]) tous.forEach(([x, n]) => { s.joueurs[x].res[r] += n; s.banque[r] -= n; });
      else if (tous.length === 1) { const n = s.banque[r]; s.joueurs[tous[0][0]].res[r] += n; s.banque[r] = 0; } } // pénurie : personne, sauf un seul bénéficiaire
    s.phase = 'principal'; return { ok:true, des:d };
  }
  function defausser(s, j, cartes) {
    if (s.phase !== 'defausse' || !s.aDefausser[j]) return err('Rien à défausser');
    const n = RES.reduce((t, r) => t + (cartes[r] || 0), 0); if (n !== s.aDefausser[j] || !peutPayer(s, j, cartes)) return err('Défausse invalide');
    paie(s, j, cartes); delete s.aDefausser[j]; if (!Object.keys(s.aDefausser).length) s.phase = 'voleur'; return OK;
  }
  function defausseAuto(s, j) { const c = {}; let n = s.aDefausser[j]; const m = RES.flatMap(r => Array(s.joueurs[j].res[r]).fill(r));
    melange(m).slice(0, n).forEach(r => c[r] = (c[r] || 0) + 1); return defausser(s, j, c); }
  function deplacerVoleur(s, j, hex, cible) {
    if (s.phase !== 'voleur' || courant(s) !== j) return err('Pas le moment'); if (hex === s.voleur) return err('Le voleur doit bouger');
    const voisins = [...new Set(topo(s).coins[hex].map(v => s.colonies[v] && s.colonies[v].j).filter(x => x && x !== j))];
    if (voisins.length && !voisins.includes(cible)) return err('Choisissez un joueur à voler');
    s.voleur = hex;
    if (cible) { const m = RES.flatMap(r => Array(s.joueurs[cible].res[r]).fill(r)); let r = null; if (m.length) { r = m[alea(m.length)]; s.joueurs[cible].res[r]--; s.joueurs[j].res[r]++; }
      s.vol = { par:j, a:cible, res:r, ts:Date.now() }; } // trace du vol, pour l'annonce à l'écran
    s.phase = s.retour || 'principal'; return OK;
  }
  // ---- Construction et achats ----
  function construire(s, j, type, id) {
    if (!['principal','speciale'].includes(s.phase) || courant(s) !== j) return err('Pas votre tour');
    const gratuit = type === 'route' && s.routesGratuites > 0, p = s.joueurs[j];
    if (!p.pieces[type]) return err('Plus de pièces');
    if (!gratuit && !peutPayer(s, j, COUT[type])) return err('Ressources insuffisantes');
    if (type === 'route') { if (!peutRoute(s, j, id)) return err('Route interdite'); s.routes[id] = j; if (gratuit) s.routesGratuites--; }
    else if (type === 'colonie') { if (!peutColonie(s, j, +id, false)) return err('Colonie interdite'); s.colonies[id] = { j, ville:false }; }
    else if (type === 'ville') { if (!s.colonies[id] || s.colonies[id].j !== j || s.colonies[id].ville) return err('Ville interdite'); s.colonies[id].ville = true; p.pieces.colonie++; }
    if (!gratuit) paie(s, j, COUT[type]); p.pieces[type]--;
    majRoute(s); verifVictoire(s); return OK;
  }
  function acheterDev(s, j) {
    if (!['principal','speciale'].includes(s.phase) || courant(s) !== j) return err('Pas votre tour');
    if (!s.pioche.length) return err('Pioche vide'); if (!peutPayer(s, j, COUT.dev)) return err('Ressources insuffisantes');
    paie(s, j, COUT.dev); s.joueurs[j].devNouv.push(s.pioche.pop()); verifVictoire(s); return OK;
  }
  function jouerDev(s, j, type, arg) {
    const p = s.joueurs[j], ok = (s.phase === 'principal' || s.phase === 'speciale' || (s.phase === 'des' && type !== 'routes')) && courant(s) === j;
    if (!ok) return err('Pas le moment'); if (s.devJoue) return err('Une carte par tour'); const i = p.dev.indexOf(type); if (i < 0) return err('Carte indisponible');
    p.dev.splice(i, 1); s.devJoue = true;
    if (type === 'chevalier') { p.chevaliers++; s.retour = s.phase; s.phase = 'voleur';
      if (p.chevaliers >= 3 && p.chevaliers > s.armee.n) s.armee = { j, n:p.chevaliers }; }
    else if (type === 'routes') s.routesGratuites = Math.min(2, s.joueurs[j].pieces.route);
    else if (type === 'invention') { if (!RES.includes((arg || [])[0]) || !RES.includes((arg || [])[1])) { p.dev.splice(i, 0, type); s.devJoue = false; return err('Choisis 2 ressources'); } arg.slice(0, 2).forEach(r => { if (s.banque[r] > 0) { s.banque[r]--; p.res[r]++; } }); }
    else if (type === 'monopole') { if (!RES.includes(arg)) { p.dev.splice(i, 0, type); s.devJoue = false; return err('Choisis une ressource'); } s.ordre.forEach(x => { if (x !== j) { p.res[arg] += s.joueurs[x].res[arg]; s.joueurs[x].res[arg] = 0; } }); }
    verifVictoire(s); return OK;
  }
  // ---- Commerce ----
  function taux(s, j, r) { let t = 4; const ports = topo(s); s.plateau.ports.forEach(q => { const c = ports.coins[q.hex];
    [c[(q.dir+5)%6], c[q.dir]].forEach(v => { if (s.colonies[v] && s.colonies[v].j === j) { if (TERRAIN[q.type] === r) t = Math.min(t, 2); else if (q.type === 'generique') t = Math.min(t, 3); } }); }); return t; }
  function echangerBanque(s, j, donne, recoit) {
    if (!['principal','speciale'].includes(s.phase) || courant(s) !== j || donne === recoit) return err('Échange impossible'); // le joueur jumelé peut échanger avec la banque, pas avec les joueurs
    const t = taux(s, j, donne); if (s.joueurs[j].res[donne] < t) return err('Pas assez de cartes'); if (s.banque[recoit] < 1) return err('Banque vide');
    s.joueurs[j].res[donne] -= t; s.banque[donne] += t; s.banque[recoit]--; s.joueurs[j].res[recoit]++; return OK;
  }
  function echangerJoueurs(s, j, autre, offre, demande) { // l'accord des deux joueurs est géré par l'interface
    if (s.phase !== 'principal' || courant(s) !== j || autre === j) return err('Échange impossible');
    if (!peutPayer(s, j, offre) || !peutPayer(s, autre, demande)) return err('Cartes manquantes');
    for (const r in offre) { s.joueurs[j].res[r] -= offre[r]; s.joueurs[autre].res[r] += offre[r]; }
    for (const r in demande) { s.joueurs[autre].res[r] -= demande[r]; s.joueurs[j].res[r] += demande[r]; } return OK;
  }
  // ---- Fin de tour (phase de construction spéciale à 5-6 joueurs) ----
  function suivant(s) { s.tour = (s.tour + 1) % s.ordre.length; s.phase = 'des'; s.des = null; }
  function finTour(s, j) {
    if (s.phase !== 'principal' || courant(s) !== j) return err('Pas votre tour');
    const p = s.joueurs[j]; delete s.echange; p.dev = p.dev.concat(p.devNouv); p.devNouv = []; s.devJoue = false; s.routesGratuites = 0;
    if (s.nb >= 5) { s.speciale = { restants:[s.ordre[(s.tour + 3) % s.ordre.length]] }; s.phase = 'speciale'; } // 5-6 joueurs : le joueur situé 3 places à gauche joue à son tour sa phase de construction
    else suivant(s); return OK;
  }
  function finSpeciale(s, j) {
    if (s.phase !== 'speciale' || courant(s) !== j) return err('Pas votre tour');
    const p = s.joueurs[j]; p.dev = p.dev.concat(p.devNouv); p.devNouv = []; s.devJoue = false; s.routesGratuites = 0;
    delete s.speciale; suivant(s); return OK;
  }
  // Tour sauté (chrono écoulé) : résout au hasard les actions obligatoires en attente
  function sauterTour(s) {
    const j = courant(s);
    if (s.phase === 'setup') { const t = topo(s); // placement automatique au hasard si le temps est écoulé
      if (s.setup.attend === 'colonie') colonieInitiale(s, j, melange(t.vs.map((_, k) => k).filter(k => peutColonie(s, j, k, true)))[0]);
      const e = melange(t.edges.filter(x => (x.a === s.setup.dernier || x.b === s.setup.dernier) && peutRoute(s, j, x.id, s.setup.dernier)));
      return routeInitiale(s, j, e[0].id); }
    if (s.phase === 'fin') return OK;
    if (s.phase === 'defausse') { Object.keys(s.aDefausser).forEach(x => defausseAuto(s, x)); }
    if (s.phase === 'voleur') { const h = melange(s.plateau.hexs.map((_, i) => i).filter(i => i !== s.voleur))[0];
      const c = topo(s).coins[h].map(v => s.colonies[v] && s.colonies[v].j).filter(x => x && x !== j); deplacerVoleur(s, j, h, c[0]); }
    if (s.phase === 'des') lancer(s, j);
    if (s.phase === 'speciale') return finSpeciale(s, j);
    if (s.phase === 'principal') return finTour(s, j); return OK;
  }
  // ---- Offre d'échange entre joueurs : le joueur dont c'est le tour propose, le premier qui accepte conclut ----
  const nettoie = o => { const r = {}; RES.forEach(x => { const n = Math.floor(+(o || {})[x] || 0); if (n > 0) r[x] = n; }); return r; };
  function proposerEchange(s, j, offre, demande) {
    if (s.phase !== 'principal' || courant(s) !== j) return err('Pas votre tour');
    const o = nettoie(offre), d = nettoie(demande);
    if (!Object.keys(o).length || !Object.keys(d).length) return err('Offre incomplète');
    if (Object.keys(o).some(r => d[r])) return err('Même ressource des deux côtés');
    if (!peutPayer(s, j, o)) return err('Cartes manquantes');
    s.echange = { de:j, offre:o, demande:d, ts:Date.now() }; return OK;
  }
  function accepterEchange(s, j) {
    const x = s.echange; if (!x || x.de === j || s.phase !== 'principal') return err('Aucune offre');
    if (!peutPayer(s, j, x.demande)) return err('Cartes manquantes');
    const r = echangerJoueurs(s, x.de, j, x.offre, x.demande); if (r.erreur) return r; s.echAcc = { de:x.de, avec:j, offre:x.offre, demande:x.demande, ts:Date.now() }; delete s.echange; return OK;
  }
  function finRoutes(s, j) { if (courant(s) !== j) return err('Pas votre tour'); s.routesGratuites = 0; return OK; } // abandonne les routes gratuites restantes
  function annulerEchange(s, j) { if (!s.echange || s.echange.de !== j) return err('Aucune offre'); delete s.echange; return OK; }
  // Joueur écarté (« continuer sans lui ») : ses tours sont passés et sa défausse est automatique
  function autoEcartes(s) {
    const ec = s.ecartes || {}; if (s.phase === 'fin') return err('');
    if (s.phase === 'defausse') { const l = Object.keys(s.aDefausser).filter(x => ec[x]); l.forEach(x => defausseAuto(s, x)); return l.length ? OK : err(''); }
    if (ec[courant(s)]) return sauterTour(s); return err('');
  }
  root.Moteur = { finRoutes, proposerEchange, accepterEchange, annulerEchange, autoEcartes, syncMoutons, RES, COUT, topo, norm, creer, courant, pv, nbCartes, peutColonie, peutRoute, colonieInitiale, routeInitiale, lancer, defausser, defausseAuto,
    deplacerVoleur, construire, acheterDev, jouerDev, taux, echangerBanque, echangerJoueurs, finTour, finSpeciale, sauterTour, routeLen };
  if (typeof module !== 'undefined') module.exports = root.Moteur;
})(typeof window !== 'undefined' ? window : this);
