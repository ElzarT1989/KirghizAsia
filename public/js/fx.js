/* «Волшебство» страницы: слова заголовков выезжают из-под маски, шапка показывает прогресс прокрутки,
   карточки наклоняются за курсором и блестят, кнопки тянутся к курсору, за курсором ходит тёплое сияние,
   панели активностей проявляются, а цвет номера панели подстраивается под яркость фото.
   Всё выключается при prefers-reduced-motion, наклон/магнит/сияние — только для мыши. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ───── слова заголовков ───── */
function wrapWords(node, counter) {
  [...node.childNodes].forEach((n) => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
        const i = document.createElement('span'); i.style.setProperty('--wi', counter.n++); i.textContent = part;
        w.appendChild(i); frag.appendChild(w);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1) wrapWords(n, counter);
  });
}

let wordsIO = null;
export function splitHeadings() {
  if (reduce) return;
  wordsIO = wordsIO || new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('sp-in'); wordsIO.unobserve(e.target); } });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  $$('h1, h2').forEach((h) => {
    if (h.querySelector('.w')) return;               // уже разбит (язык не менялся)
    const seen = h.classList.contains('sp-in');
    wrapWords(h, { n: 0 });
    h.setAttribute('aria-label', h.textContent.trim());
    h.classList.add('split');
    if (seen) return;                                // после смены языка не проигрываем заново
    if (h.closest('.hero')) setTimeout(() => h.classList.add('sp-in'), 250);
    else wordsIO.observe(h);
  });
}

/* ───── шапка: линия прогресса прокрутки ───── */
function scrollLine(bar) {
  let busy = false;
  const upd = () => {
    busy = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--sp', max > 0 ? Math.min(scrollY / max, 1).toFixed(4) : 0);
  };
  addEventListener('scroll', () => { if (!busy) { busy = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd);
  upd();
}

/* ───── карточки: наклон и блик ───── */
function tilt(grid) {
  if (!fine || reduce) return;
  grid.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.classList.add('tilting');
    c.style.setProperty('--ry', ((x - .5) * 9).toFixed(2) + 'deg');
    c.style.setProperty('--rx', ((.5 - y) * 7).toFixed(2) + 'deg');
    c.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    c.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
  });
  grid.addEventListener('pointerout', (e) => {
    const c = e.target.closest('.card');
    if (!c || c.contains(e.relatedTarget)) return;
    c.classList.remove('tilting');
    ['--rx', '--ry'].forEach((k) => c.style.removeProperty(k));
  });
}

/* ───── кнопки тянутся к курсору ───── */
function magnet() {
  if (!fine || reduce) return;
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest?.('.btn, .slide-nav button');
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * .22).toFixed(1) + 'px');
    b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * .32).toFixed(1) + 'px');
  });
  document.addEventListener('pointerout', (e) => {
    const b = e.target.closest?.('.btn, .slide-nav button');
    if (!b || b.contains(e.relatedTarget)) return;
    b.style.removeProperty('--mx'); b.style.removeProperty('--my');
  });
}

/* ───── тёплое сияние за курсором ───── */
function aura() {
  if (!fine || reduce) return;
  const a = document.createElement('div');
  a.className = 'aura'; a.setAttribute('aria-hidden', 'true');
  document.body.appendChild(a);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, on = false, raf = 0;
  const tick = () => {
    x += (tx - x) * .12; y += (ty - y) * .12;
    a.style.transform = `translate3d(${x - 260}px, ${y - 260}px, 0)`;
    raf = (Math.abs(tx - x) + Math.abs(ty - y) > .5) ? requestAnimationFrame(tick) : 0;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX; ty = e.clientY;
    if (!on) { on = true; x = tx; y = ty; a.classList.add('on'); }
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { on = false; a.classList.remove('on'); });
}

/* ───── панели активностей: проявление, фокус кадра, цвет номера ───── */
const FOCUS = { 'rando-cheval': '62% 55%', trekking: '30% 50%', 'ski-rando': '72% 55%', multi: '50% 50%', trout: '50% 50%' };
export const CARD_FOCUS = {
  'rando-cheval': '62% 55%', cmc3: '50% 68%', pdn4: '40% 62%', ski: '50% 36%', trc: '35% 55%',
  multi: '50% 50%', truite: '50% 40%', jennifer1: '66% 70%',
};

/* яркость фото под номером панели → тёмный или светлый контур */
function numberTone(pn) {
  const img = $('.pn-img img', pn), no = $('.pn-no', pn);
  if (!img || !no || !img.naturalWidth || !img.offsetWidth) return;
  const [fx, fy] = (getComputedStyle(img).objectPosition || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
  const W = img.offsetWidth, H = img.offsetHeight, nw = img.naturalWidth, nh = img.naturalHeight;
  const sc = Math.max(W / nw, H / nh);
  const ox = (W - nw * sc) * (isNaN(fx) ? .5 : fx), oy = (H - nh * sc) * (isNaN(fy) ? .5 : fy);
  const bx = no.offsetLeft - img.offsetLeft, by = no.offsetTop - img.offsetTop;
  const sx = Math.max(0, (bx - ox) / sc), sy = Math.max(0, (by - oy) / sc);
  const sw = Math.min(nw - sx, no.offsetWidth / sc), sh = Math.min(nh - sy, no.offsetHeight / sc);
  if (sw < 2 || sh < 2) return;
  try {
    const c = document.createElement('canvas'); c.width = 16; c.height = 10;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 10);
    const d = g.getImageData(0, 0, 16, 10).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    pn.dataset.tone = s / (d.length / 4) / 255 > .55 ? 'dark' : 'light';
  } catch { /* картинка ещё не готова */ }
}

function panels() {
  const list = $$('#hsTrack .pn[data-act]');
  const toneAll = () => list.forEach(numberTone);
  list.forEach((pn) => {
    const img = $('.pn-img img', pn);
    if (!img) return;
    const key = (img.getAttribute('src') || '').split('/').pop().replace(/\.webp$/, '');
    if (FOCUS[key]) pn.style.setProperty('--fp', FOCUS[key]);
    // размытая копия того же снимка — «дорисованный» фон на вертикальных экранах
    const low = ['rando-cheval', 'trekking', 'ski-rando', 'trout'].includes(key) ? '-1280' : '';
    $('.pn-img', pn).style.setProperty('--bg', `url("/img/${key}${low}.webp")`);
    if (img.complete) numberTone(pn); else img.addEventListener('load', () => numberTone(pn), { once: true });
  });
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(toneAll, 250); });
  addEventListener('load', toneAll);

  if (reduce) { list.forEach((p) => p.classList.add('on')); return; }
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
  }, { threshold: 0.3 });
  list.forEach((p) => io.observe(p));
  // панель «Свяжитесь с нами» тоже проявляется
  const c = $('#hsTrack .pn-c');
  if (c) io.observe(c);
}

/* ───── фото проявляются «шторкой» ───── */
function reveals() {
  const els = $$('.portrait-frame, .review-img');
  if (reduce) return;
  els.forEach((e) => e.classList.add('rv'));
  // следим за родителем: элемент под clip-path: inset(100%) для IntersectionObserver «невидим»
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target._rv.classList.add('rv-in'); io.unobserve(e.target); } });
  }, { threshold: 0.18 });
  els.forEach((e) => { const host = e.parentElement || e; host._rv = e; io.observe(host); });
}

export function initFx({ bar, grid }) {
  if (!reduce) document.documentElement.classList.add('fx');
  scrollLine(bar);
  tilt(grid);
  magnet();
  aura();
  panels();
  reveals();
  splitHeadings();
}
