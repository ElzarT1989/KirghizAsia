/* KirghizAsia — поведение страницы: языки, шапка, появление блоков, горизонтальный скролл активностей,
   карточки туров с фильтром и окном, форма заявки → WhatsApp. WebGL-сцены лежат в hero.js и topo.js. */
import { DICT, TOURS, SEASONS, PHONE } from '/js/i18n.js';
import { initHero } from '/js/hero.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const LOCALE = { fr: 'fr-FR', en: 'en-GB', ru: 'ru-RU' };
const FILTERS = ['all', 'cheval', 'trek', 'ski', 'multi', 'peche'];

let lang = 'fr';
let filter = 'all';
let openTour = null;
let heroCtl = null, heroIdx = 0;

const store = {
  get() { try { return localStorage.getItem('ka-lang'); } catch { return null; } },
  set(v) { try { localStorage.setItem('ka-lang', v); } catch { /* приватный режим */ } },
};
const t = (k) => DICT[lang]?.[k] ?? DICT.fr[k] ?? '';

function detectLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && DICT[q]) return q;
  const s = store.get();
  if (s && DICT[s]) return s;
  const n = (navigator.language || 'fr').toLowerCase();
  if (n.startsWith('fr')) return 'fr';
  if (/^(ru|ky|kk|uk|be)/.test(n)) return 'ru';
  return /^en/.test(n) ? 'en' : 'en';
}

/* ───────── язык ───────── */
const money = (n) => new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const seasonOf = (id) => { const [a, b] = SEASONS[id]; return `${t('m.' + a)} – ${t('m.' + b)}`; };

function applyLang(l, persist) {
  lang = l;
  if (persist) store.set(l);
  document.documentElement.lang = l;
  document.title = t('meta.title');
  $('meta[name="description"]')?.setAttribute('content', t('meta.desc'));
  $$('[data-i18n]').forEach((el) => { const v = t(el.dataset.i18n); if (v) el.textContent = v; });
  $$('[data-i18n-html]').forEach((el) => { const v = t(el.dataset.i18nHtml); if (v) el.innerHTML = v; });
  $$('[data-i18n-aria]').forEach((el) => { const v = t(el.dataset.i18nAria); if (v) el.setAttribute('aria-label', v); });
  $$('[data-i18n-ph]').forEach((el) => { const v = t(el.dataset.i18nPh); if (v) el.setAttribute('placeholder', v); });
  $$('[data-lang]').forEach((b) => { const on = b.dataset.lang === l; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  renderChips();
  renderTours();
  renderSelect();
  if (openTour) fillModal(openTour);
  heroCtl?.relabel();
  setCaption(heroIdx, false);
  measureHS();
}

/* ───────── подпись к слайду героя ───────── */
function setCaption(i, animate = true) {
  heroIdx = i;
  const no = $('#slideNo'), tx = $('#slideTx');
  const set = () => { no.textContent = String(i + 1).padStart(2, '0'); tx.textContent = t('sl.' + i); tx.style.opacity = 1; };
  if (!animate || reduce) return set();
  tx.style.opacity = 0;
  setTimeout(set, 320);
}

/* ───────── шапка и меню ───────── */
const bar = $('#top-bar'), nav = $('#nav'), burger = $('#burger');
function onScroll() {
  bar.classList.toggle('scrolled', scrollY > 40);
  if (scrollY < 200) $$('a.on', nav).forEach((a) => a.classList.remove('on'));
}
function setMenu(open) {
  nav.classList.toggle('open', open);
  bar.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', open);
  document.documentElement.style.overflow = open ? 'hidden' : '';
}
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// подсветка текущего раздела в меню
{
  const links = new Map($$('a', nav).map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) links.forEach((a, id) => a.classList.toggle('on', id === e.target.id)); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); s && io.observe(s); });
}

/* ───────── появление блоков и счётчики ───────── */
function countUp(el) {
  const to = +el.dataset.count;
  if (reduce) return;
  const t0 = performance.now();
  (function step(now) {
    const k = clamp((now - t0) / 1400, 0, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
{
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('[data-r]').forEach((el) => io.observe(el));
}

/* ───────── горизонтальный скролл активностей ───────── */
const hs = $('#activites'), track = $('#hsTrack'), sticky = $('.hs-sticky', hs), hsBar = $('#hsBar');
const panels = $$('.pn', track);
const wide = matchMedia('(min-width: 900px)');
let hsDist = 0, hsX = 0, hsTarget = 0, hsRaf = 0;

function measureHS() {
  if (!wide.matches) {
    hs.style.height = ''; track.style.transform = ''; hsX = hsTarget = 0;
    panels.forEach((p) => p.style.removeProperty('--px'));
    return;
  }
  hsDist = Math.max(track.offsetWidth - innerWidth, 0);
  hs.style.height = `${sticky.offsetHeight + hsDist}px`;
  hsScroll();
}
function hsScroll() {
  if (!wide.matches) return;
  const r = hs.getBoundingClientRect();
  const p = clamp(-r.top / (hsDist || 1), 0, 1);
  hsTarget = p * hsDist;
  hsBar.style.transform = `scaleX(${p})`;
  if (!hsRaf) hsRaf = requestAnimationFrame(hsTick);
}
function hsTick() {
  hsRaf = 0;
  hsX += (hsTarget - hsX) * (reduce ? 1 : 0.14);
  if (Math.abs(hsTarget - hsX) < 0.3) hsX = hsTarget;
  track.style.transform = `translate3d(${-hsX}px,0,0)`;
  const vw = innerWidth;
  panels.forEach((p) => {
    const c = p.offsetLeft + p.offsetWidth / 2 - hsX;       // центр панели в окне
    p.style.setProperty('--px', `${clamp(-(c - vw / 2) / vw * 70, -64, 64).toFixed(1)}px`);
  });
  if (hsX !== hsTarget) hsRaf = requestAnimationFrame(hsTick);
}
addEventListener('scroll', hsScroll, { passive: true });
addEventListener('resize', measureHS);
wide.addEventListener('change', measureHS);
// фокус с клавиатуры на скрытой панели: прокручиваем страницу к ней, а не сам контейнер
track.addEventListener('focusin', (e) => {
  if (!wide.matches) return;
  const pn = e.target.closest('.pn');
  sticky.scrollLeft = 0;
  if (!pn) return;
  const top = hs.getBoundingClientRect().top + scrollY;
  scrollTo({ top: top + clamp(pn.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), 0, hsDist), behavior: 'instant' });
});
addEventListener('load', measureHS);

/* ───────── туры ───────── */
const chipsEl = $('#chips'), grid = $('#tourGrid');
function renderChips() {
  chipsEl.innerHTML = FILTERS.map((f) => `<button type="button" class="chip" data-f="${f}" aria-pressed="${f === filter}">${t('f.' + f)}</button>`).join('');
}
function renderTours(animate = true) {
  const list = TOURS.filter((x) => filter === 'all' || x.cat === filter);
  grid.innerHTML = list.map((x, i) => {
    const price = x.price == null ? `<b>${t('tour.quote')}</b>` : `<small>${t('tour.from')}</small><b>${money(x.price)}</b>`;
    return `<article class="card"${animate ? ` style="--i:${i}"` : ' style="animation:none"'}>
      <span class="card-img"><img src="/img/${x.img}.webp" alt="" loading="lazy" decoding="async"><span class="card-badge">${t('tour.badge')}</span></span>
      <div class="card-body">
        <span class="card-cat">${t('f.' + x.cat)}</span>
        <h3><button type="button" class="card-open" data-id="${x.id}">${t('t.' + x.id + '.t')}</button></h3>
        <div class="card-meta"><span>${x.days} ${t('tour.days')}</span><span>${seasonOf(x.id)}</span></div>
        <div class="card-foot"><div class="card-price">${price}</div><span class="card-go">${t('tour.open')} <i>→</i></span></div>
      </div></article>`;
  }).join('');
}
function setFilter(f) {
  filter = f;
  $$('.chip', chipsEl).forEach((c) => c.setAttribute('aria-pressed', c.dataset.f === f));
  renderTours();
}
chipsEl.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) setFilter(c.dataset.f); });
$$('[data-filter]').forEach((a) => a.addEventListener('click', () => setFilter(a.dataset.filter)));

/* окно тура */
const modal = $('#tourModal');
const wa = (text) => `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`;
function fillModal(id) {
  const x = TOURS.find((v) => v.id === id);
  if (!x) return;
  const title = t('t.' + id + '.t');
  $('#tmImg').src = `/img/${x.img}.webp`;
  $('#tmTag').textContent = t('f.' + x.cat);
  $('#tmTitle').textContent = title;
  $('#tmDesc').textContent = t('t.' + id + '.d');
  const price = x.price == null ? t('tour.quote') : `${money(x.price)} / ${t('tour.from')}`;
  const facts = [
    [t('tour.dur'), `${x.days} ${t('tour.days')}`],
    [t('tour.season'), seasonOf(id)],
    [t('tour.dep'), t('tour.depv').replace('{n}', x.min || 2)],
    [t('tour.price'), price],
  ];
  $('#tmFacts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const cta = $('#tmCta');
  cta.textContent = t('tour.cta');
  cta.href = wa(t('wa.hello') + t('wa.tour').replace('{t}', title));
}
grid.addEventListener('click', (e) => {
  const b = e.target.closest('.card-open');
  if (!b) return;
  openTour = b.dataset.id;
  fillModal(openTour);
  modal.showModal();
  document.documentElement.style.overflow = 'hidden';
});
function closeModal() { if (modal.open) modal.close(); }
$('#tmClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modal.addEventListener('close', () => { openTour = null; document.documentElement.style.overflow = ''; });

/* ───────── форма ───────── */
const sel = $('#fWhat');
function renderSelect() {
  const v = sel.value || 'any';
  sel.innerHTML = [0, 1, 2, 3, 4].map((i) => `<option value="${i}">${t('act.' + i + '.t')}</option>`).join('') + `<option value="any">${t('ct.any')}</option>`;
  sel.value = v;
}
$$('[data-ask]').forEach((a) => a.addEventListener('click', () => { sel.value = a.dataset.ask; }));
$('#quote').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const what = sel.value === 'any' ? '' : t('act.' + sel.value + '.t');
  const rows = [['wa.name', f.get('name')], ['wa.what', what], ['wa.when', f.get('when')], ['wa.who', f.get('who')], ['wa.msg', f.get('msg')]]
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${t(k)} : ${String(v).trim()}`);
  const text = t('wa.hello') + (rows.length ? '\n' + rows.join('\n') : t('wa.gen'));
  const w = window.open(wa(text), '_blank', 'noopener');
  if (!w) location.href = wa(text);
});

/* ───────── язык: переключатель ───────── */
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang, true)));

/* ───────── запуск ───────── */
applyLang(detectLang(), false);

try {
  heroCtl = initHero({
    root: $('#top'), canvas: $('#heroGL'), poster: $('.hero-poster'),
    dots: $('#slideDots'), prev: $('#slPrev'), next: $('#slNext'),
    label: (i) => `${t('hero.goto')} ${i + 1}`,
    onSlide: (i) => setCaption(i),
  });
} catch (err) {
  console.warn('hero', err);
}

// фон «направление» (карта горизонталей) подгружаем, когда блок рядом
{
  const host = $('#destination');
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    import('/js/topo.js').then((m) => m.initTopo($('#topoGL'), host)).catch((err) => console.warn('topo', err));
  }, { rootMargin: '600px 0px' });
  io.observe(host);
}
measureHS();
