// Pisco — Pirate Life gameplay layer.
// Replaces the old generic teddy-bear-style stat loop with a lightweight
// pirate-parrot progression system while leaving the AR/3D engine untouched.
const SAVE_KEY = 'piscoPirateSaveV1';
const LEGACY_SAVE_KEY = 'mochiPirateSaveV1';
let lastRenderedName = 'Pisco';

const $p = s => document.querySelector(s);
let toastTimer = null;
let game = null;

function clamp(v){ return Math.max(0, Math.min(100, v)); }
function xpNeeded(level){ return 80 + (level - 1) * 35; }
function rankFor(level){
  if(level >= 12) return 'Lenda dos Sete Mares';
  if(level >= 8) return 'Capitão';
  if(level >= 5) return 'Corsário';
  if(level >= 3) return 'Marinheiro';
  return 'Grumete';
}
function load(){
  let old = {};
  try { old = JSON.parse(localStorage.getItem('arPetSave') || '{}') || {}; } catch {}
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY) || '{}') || {}; } catch {}
  const base = {
    name: old.name || 'Pisco',
    hunger: 82,
    mood: 86,
    energy: 74,
    clean: 90,
    level: 1,
    xp: 0,
    doubloons: 12,
    rations: 6,
    maxRations: 6,
    voyages: 0,
    bond: 0,
    last: Date.now(),
    lastVoyage: 0,
    sound: old.sound !== false,
    vibration: old.vibration !== false
  };
  game = Object.assign(base, saved);
  // Prefer the gameplay save, then the shared app save; never revive the retired default.
  const savedName = typeof saved.name === 'string' ? saved.name.trim() : '';
  const sharedName = typeof old.name === 'string' ? old.name.trim() : '';
  game.name = (savedName && savedName !== 'Mochi') ? savedName.slice(0,18) : (sharedName && sharedName !== 'Mochi' ? sharedName.slice(0,18) : 'Pisco');
  lastRenderedName = 'Pisco';
  applyOfflineTime();
  save();
}
function save(){
  game.last = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(game));
}
function pirateToast(message){
  const el = $p('#toast');
  if(!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function applyOfflineTime(){
  const hours = Math.min(48, Math.max(0, (Date.now() - Number(game.last || Date.now())) / 3600000));
  if(hours > 0.02){
    game.hunger = clamp(game.hunger - hours * 5);
    game.mood = clamp(game.mood - hours * 3);
    game.energy = clamp(game.energy - hours * 1.8);
    game.clean = clamp(game.clean - hours * 1.4);
  }
  const days = Math.floor((Date.now() - Number(game.lastVoyage || Date.now())) / 86400000);
  if(days > 0){
    game.rations = Math.min(game.maxRations, game.rations + Math.min(days * 2, 6));
    game.lastVoyage = Date.now();
  }
}
function addXP(amount){
  game.xp += amount;
  let leveled = false;
  while(game.xp >= xpNeeded(game.level)){
    game.xp -= xpNeeded(game.level);
    game.level++;
    game.maxRations = Math.min(14, 6 + Math.floor(game.level / 2));
    game.rations = Math.min(game.maxRations, game.rations + 2);
    game.doubloons += 10 + game.level;
    game.energy = clamp(game.energy + 12);
    game.mood = clamp(game.mood + 8);
    leveled = true;
    pirateToast(`🏴‍☠️ A bordo! ${game.name} alcançou o nível ${game.level}: ${rankFor(game.level)}!`);
  }
  return leveled;
}
function bar(id, value){
  const valueEl = $p('#' + id + 'Value');
  if(valueEl) valueEl.textContent = Math.round(value);
  const row = valueEl?.parentElement;
  const track = row?.querySelector('.statTrack i');
  if(track) track.style.width = `${clamp(value)}%`;
}
function ensureProgressUI(){
  const stats = $p('.stats');
  if(!stats || $p('#pirateProgress')) return;
  const heading = stats.querySelector('.statsHeading');
  const progress = document.createElement('div');
  progress.id = 'pirateProgress';
  progress.innerHTML = `
    <div class="pirateMeta"><b id="pirateRank">GRUMETE</b><span id="pirateCoins">🪙 12</span></div>
    <div class="pirateXp"><i id="pirateXpBar"></i></div>
    <div class="pirateMeta"><span id="pirateLevel">Nível 1</span><span id="pirateRations">🍖 6/6 rações</span></div>`;
  heading?.insertAdjacentElement('afterend', progress);
}
function syncDisplayedName(){
  const previous = lastRenderedName || 'Pisco';
  const next = game.name || 'Pisco';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes){
    if(node.parentElement?.closest('#petName')) continue;
    if(node.nodeValue.includes(previous) || node.nodeValue.includes('Mochi') || node.nodeValue.includes('Pisco'))
      node.nodeValue = node.nodeValue.split(previous).join(next).split('Mochi').join(next).split('Pisco').join(next);
  }
  document.querySelectorAll('[title],[aria-label],[placeholder],meta[name="description"]').forEach(el=>{
    for(const attr of ['title','aria-label','placeholder','content']){
      if(!el.hasAttribute(attr)) continue;
      const value=el.getAttribute(attr);
      if(value.includes(previous) || value.includes('Mochi') || value.includes('Pisco')) el.setAttribute(attr,value.split(previous).join(next).split('Mochi').join(next).split('Pisco').join(next));
    }
  });
  document.title = document.title.split(previous).join(next).split('Mochi').join(next).split('Pisco').join(next);
  lastRenderedName = next;
}
function updateUI(){
  ensureProgressUI();
  bar('hunger', game.hunger);
  bar('mood', game.mood);
  bar('energy', game.energy);
  bar('clean', game.clean);
  const rank = $p('#pirateRank');
  const coins = $p('#pirateCoins');
  const level = $p('#pirateLevel');
  const rations = $p('#pirateRations');
  const xpBar = $p('#pirateXpBar');
  if(rank) rank.textContent = rankFor(game.level).toUpperCase();
  if(coins) coins.textContent = `🪙 ${game.doubloons}`;
  if(level) level.textContent = `Nível ${game.level} · ${game.xp}/${xpNeeded(game.level)} XP`;
  if(rations) rations.textContent = `🍖 ${game.rations}/${game.maxRations} rações`;
  if(xpBar) xpBar.style.width = `${Math.min(100, game.xp / xpNeeded(game.level) * 100)}%`;
  const status = $p('#statusText');
  if(status) status.textContent = `${game.name} está pronto para zarpar, marujo!`;
  const name = $p('#petName');
  if(name && document.activeElement !== name) name.value = game.name;
  syncDisplayedName();
  try { const old=JSON.parse(localStorage.getItem('arPetSave')||'{}'); old.name=game.name; localStorage.setItem('arPetSave',JSON.stringify(old)); } catch {}
  window.dispatchEvent(new CustomEvent('petnamechange',{detail:game.name}));
}
function playSound(){
  if(!game.sound) return;
  try{
    const C = window.AudioContext || window.webkitAudioContext;
    const c = new C(); const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = 440 + Math.random() * 120;
    g.gain.setValueAtTime(.03, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .1);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .1);
    o.onended = () => c.close();
  } catch {}
}
function vibrate(ms=20){ if(game.vibration && navigator.vibrate) navigator.vibrate(ms); }
function finish(message, xp=0){
  addXP(xp); save(); updateUI(); playSound(); vibrate();
  if(message) pirateToast(message);
}
function action(type){
  if(type === 'feed'){
    if(game.rations <= 0){ pirateToast('🥥 A despensa está vazia! Encontre um tesouro ou espere a próxima reposição.'); return; }
    if(game.hunger >= 96){ pirateToast(`🍗 ${game.name} já está de barriga cheia!`); return; }
    game.rations--;
    game.hunger = clamp(game.hunger + 24);
    game.mood = clamp(game.mood + 5);
    finish(`🍍 ${game.name} devorou uma ração tropical! Restam ${game.rations}.`, 12);
    return;
  }
  if(type === 'play'){
    if(game.energy < 12){ pirateToast(`😴 ${game.name} está sem energia. Deixe o capitão descansar um pouco.`); return; }
    game.energy = clamp(game.energy - 12);
    game.mood = clamp(game.mood + 14);
    game.hunger = clamp(game.hunger - 5);
    game.voyages++;
    const treasure = Math.random() < .22;
    if(treasure){
      const loot = 4 + Math.floor(Math.random() * 9);
      game.doubloons += loot;
      finish(`🗺️ Treino de voo! ${game.name} encontrou ${loot} dobrões num baú perdido.`, 22);
    } else {
      finish(`🦜 ${game.name} treinou o voo e fez uma ronda pelo convés!`, 20);
    }
    return;
  }
  if(type === 'pet'){
    game.mood = clamp(game.mood + 10);
    game.bond += 8;
    finish(`❤️ ${game.name} recebeu carinho do capitão. Laço +8!`, 8);
    return;
  }
  if(type === 'clean'){
    game.clean = clamp(game.clean + 28);
    game.mood = clamp(game.mood + 5);
    finish(`🌊 Banho de mar concluído! ${game.name} está pronto para o próximo porto.`, 10);
  }
}
function bindActions(){
  document.querySelectorAll('[data-action]').forEach(oldButton => {
    const fresh = oldButton.cloneNode(true);
    oldButton.replaceWith(fresh);
    fresh.addEventListener('click', () => action(fresh.dataset.action));
  });
}
function rewriteButtons(){
  const labels = {
    feed:['🍍','Alimentar'],
    play:['🗺️','Treinar voo'],
    pet:['❤️','Carinho'],
    clean:['🌊','Banho de mar']
  };
  document.querySelectorAll('[data-action]').forEach(button => {
    const v = labels[button.dataset.action];
    if(!v) return;
    button.querySelector('.actionIcon').textContent = v[0];
    button.querySelector('small').textContent = v[1];
  });
}
function bindSettings(){
  const name = $p('#petName');
  if(name){
    name.value = game.name;
    name.oninput = e => { game.name = e.target.value.trim().slice(0,18) || 'Pisco'; save(); updateUI(); };
  }
  const sound = $p('#soundToggle');
  if(sound){ sound.checked = game.sound; sound.onchange = e => { game.sound = e.target.checked; save(); }; }
  const vibration = $p('#vibrationToggle');
  if(vibration){ vibration.checked = game.vibration; vibration.onchange = e => { game.vibration = e.target.checked; save(); }; }
  const reset = $p('#resetBtn');
  if(reset){ reset.onclick = () => { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('arPetSave'); location.reload(); }; }
}
function migrateOldActionText(){
  const heading = document.querySelector('.actionHeading');
  if(heading) heading.innerHTML = '<span>⚓</span> ROTINA DO CAPITÃO <span>⚓</span>';
  const statsHeading = document.querySelector('.statsHeading small');
  if(statsHeading) statsHeading.textContent = 'DIÁRIO DE BORDO';
}

load();
window.addEventListener('load', () => {
  migrateOldActionText();
  rewriteButtons();
  bindActions();
  bindSettings();
  updateUI();
});
migrateOldActionText();
rewriteButtons();
bindActions();
bindSettings();
updateUI();
