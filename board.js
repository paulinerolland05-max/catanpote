// Générateur de plateau Catan aléatoire (3-4 et 5-6 joueurs). Fonctionne dans le navigateur et sous Node.
(function (root) {
  const CFG = {
    petit: { rangees: [3,4,5,4,3],
      tuiles: { foret:4, pre:4, champ:4, colline:3, montagne:3, desert:1 },
      jetons: [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12],
      ports: { generique:4, foret:1, pre:1, champ:1, colline:1, montagne:1 } },
    grand: { rangees: [3,4,5,6,5,4,3],
      tuiles: { foret:6, pre:6, champ:6, colline:5, montagne:5, desert:2 },
      jetons: [2,2,3,3,3,4,4,4,5,5,5,6,6,6,8,8,8,9,9,9,10,10,10,11,11,11,12,12],
      ports: { generique:5, foret:1, pre:1, champ:1, colline:1, montagne:1, pre2:0, extra:1 } }
  };
  const H = Math.sqrt(3) / 2;
  const DIRS = [[1,0],[.5,H],[-.5,H],[-1,0],[-.5,-H],[.5,-H]];
  const cle = (x, y) => Math.round(x * 2) + ',' + Math.round(y / H);
  function melange(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const rouge = n => n === 6 || n === 8;

  function genererPlateau(nbJoueurs) {
    const c = CFG[nbJoueurs >= 5 ? 'grand' : 'petit'];
    const pos = [];
    c.rangees.forEach((len, r) => { for (let i = 0; i < len; i++) pos.push({ x: i - (len - 1) / 2, y: r * H }); });
    const index = new Map(pos.map((p, k) => [cle(p.x, p.y), k]));
    const voisins = pos.map(p => DIRS.map(d => index.get(cle(p.x + d[0], p.y + d[1]))).filter(v => v !== undefined));
    const types = melange(Object.entries(c.tuiles).flatMap(([t, n]) => Array(n).fill(t)));
    const terrestres = types.map((t, k) => t !== 'desert' ? k : -1).filter(k => k >= 0);
    // Jetons : 6/8 jamais adjacents (strict), numéros identiques adjacents évités si possible
    let jetons, ok = false;
    for (let essai = 0; essai < 5000 && !ok; essai++) {
      const m = melange(c.jetons), tmp = {};
      terrestres.forEach((k, i) => tmp[k] = m[i]);
      const mauvais = (strict) => terrestres.some(k => voisins[k].some(v => tmp[v] !== undefined &&
        (rouge(tmp[k]) && rouge(tmp[v]) || (!strict && tmp[k] === tmp[v]))));
      if (!mauvais(true) && (!mauvais(false) || essai > 4000)) { jetons = tmp; ok = true; }
    }
    // Ports : arêtes côtières, espacées, face à la mer
    const aretes = [];
    pos.forEach((p, k) => DIRS.forEach((d, di) => {
      if (index.get(cle(p.x + d[0], p.y + d[1])) === undefined)
        aretes.push({ hex: k, dir: di, mx: p.x + d[0] / 2, my: p.y + d[1] / 2 });
    }));
    const typesPorts = melange(Object.entries(c.ports).flatMap(([t, n]) => t === 'extra' ? ['generique'] : Array(n).fill(t)));
    let choisies;
    for (let essai = 0; essai < 2000; essai++) {
      choisies = [];
      for (const a of melange(aretes)) {
        if (choisies.length === typesPorts.length) break;
        if (choisies.every(b => Math.hypot(a.mx - b.mx, a.my - b.my) >= 1.2)) choisies.push(a);
      }
      if (choisies.length === typesPorts.length) break;
    }
    const ports = choisies.map((a, i) => ({ ...a, type: typesPorts[i] }));
    const hexs = pos.map((p, k) => ({ ...p, type: types[k], jeton: jetons[k] || null }));
    return { hexs, ports, voisins };
  }
  const api = { genererPlateau, rouge };
  if (typeof module !== 'undefined') module.exports = api; else root.CatanBoard = api;
})(this);
