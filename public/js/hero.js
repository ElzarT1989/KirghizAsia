/* Главный экран: слайдшоу фотографий на WebGL2 — «растворение» через шум с тёплой кромкой с искрами,
   медленный наезд (Ken Burns), параллакс и тёплый свет от мыши, золотая пыль, волны от касания,
   плёночное зерно и виньетка.
   На вертикальном экране фото занимает верх кадра, а низ «дорисовывается» зеркальным размытым
   продолжением — широкий снимок не режется до узкой полоски.
   Цвет текста подстраивается под яркость фото (data-tone на главном экране и в шапке).
   Без WebGL остаётся обычная картинка с плавной сменой — сайт не ломается. */

import { NOISE, PLACE, program, textureFrom, loadImage } from './gl.js';

export const SLIDES = ['yurt', 'rando-cheval', 'trekking', 'ski-rando', 'trout'];
/* где на фото главное (x слева→вправо, y сверху→вниз) — вокруг этой точки кадрируем на узких экранах */
const FOCUS = [[.5, .62], [.6, .55], [.3, .5], [.72, .55], [.5, .5]];
const DUR = 6.5;      // секунд на слайд
const TRANS = 1.7;    // секунд на растворение
const TONE_AT = .38;  // доля растворения, когда текст меняет цвет

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes, uSzA, uSzB, uFA, uFB, uMouse;
uniform float uTime, uMix, uZA, uZB, uH, uDir, uGlow, uFlat, uFx;
uniform vec3 uRip;
uniform sampler2D uA, uB;
out vec4 o;
${NOISE}
${PLACE}

/* слой золотой пыли: одна ячейка на пиксель, мерцает и плывёт вверх */
float dust(vec2 p, float t, float sc, float spd){
  p = p * sc; p.y -= t * spd; p.x += sin(t * .35 + p.y * .8) * .25;
  vec2 i = floor(p), f = fract(p) - .5;
  float h = h21(i);
  vec2 off = (vec2(h21(i + 3.1), h21(i + 7.7)) - .5) * .7;
  float r = .035 + .055 * h21(i + 1.3);
  float tw = .55 + .45 * sin(t * (1. + h * 2.) + h * 40.);
  return smoothstep(r, 0., length(f - off)) * step(.5, h) * tw;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 asp = vec2(uRes.x / uRes.y, 1.);

  /* круги на воде от касания */
  vec2 suv = uv; float ring = 0.;
  if (uRip.z >= 0.) {
    vec2 d = (uv - uRip.xy) * asp; float r = length(d);
    ring = exp(-pow((r - uRip.z * .55) * 11., 2.)) * exp(-uRip.z * 1.4);
    suv = uv - d / max(r, .001) * ring * .02 / asp;
  }

  float n = fbm(suv * asp * 2.6 + vec2(uTime * .03, 0.));
  float gx = uDir > 0. ? suv.x : 1. - suv.x;
  n = n * .78 + gx * .22;                          // растворение идёт слева направо (или справа налево)
  float w = .13;
  float th = uMix * (1. + 2. * w) - w;
  float m = smoothstep(n - w, n + w, th);
  float band = m * (1. - m) * 4. * step(.001, uMix) * step(uMix, .999);

  vec2 dA = vec2(n - .5, .5 - n) * .035 * m;      // лёгкое «течение» кадров в зоне перехода
  vec2 dB = vec2(n - .5, .5 - n) * .035 * (1. - m);
  vec2 par = uMouse * .012;
  vec3 a = place(uA, suv, uRes, uSzA, uZA, uFA, par * .6 + dA, uH);
  vec3 b = place(uB, suv, uRes, uSzB, uZB, uFB, par - dB, uH);
  vec3 c = mix(a, b, m);
  if (uFlat > .5) { o = vec4(c, 1.); return; }

  c += vec3(1., .62, .26) * band * .55;           // тёплая золотая кромка
  float sp = step(.994, h21(floor(gl_FragCoord.xy / 3.) + floor(uTime * 22.))) * band;
  c += vec3(1., .86, .55) * sp * 1.6 * uFx;       // искры на кромке

  /* тёплый свет вслед за курсором */
  float ml = smoothstep(.55, 0., length((uv - (uMouse * .5 + .5)) * asp));
  c += vec3(1., .66, .3) * ml * ml * .16 * uGlow;
  c += vec3(1., .85, .6) * ring * .12 * uFx;

  /* золотая пыль */
  float dd = dust(uv * asp, uTime, 9., .05) * .55 + dust(uv * asp + 4.7, uTime * 1.3, 17., .09) * .4;
  c += vec3(1., .8, .48) * dd * .55 * uFx;

  c *= vec3(1.03, 1., .96);                       // чуть теплее
  float v = 1. - smoothstep(.35, 1.25, length((uv - .5) * vec2(1.1, 1.)));
  c *= mix(.62, 1., v);                           // виньетка
  c += (h21(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .035;   // зерно
  o = vec4(c, 1.);
}`;

const UNIFORMS = ['uRes', 'uTime', 'uMix', 'uZA', 'uZB', 'uSzA', 'uSzB', 'uFA', 'uFB', 'uMouse', 'uH', 'uDir', 'uGlow', 'uFlat', 'uFx', 'uRip', 'uA', 'uB'];

export function initHero({ root, canvas, poster, dots, prev, next, label, onSlide }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const N = SLIDES.length;
  let cur = 0, nxt = 0, mixv = 0, trans = false, tStart = 0, dir = 1, toneDone = true;
  let clock = 0, last = 0, running = false, visible = true, dead = false;
  let lowRes = true;
  const slideStart = new Array(N).fill(0);
  let slideClockBase = 0; // clock в момент появления текущего слайда
  const mouse = [0, 0], mouseT = [0, 0];
  let glow = 0, glowT = 0;
  let rip = [.5, .5, 0], ripOn = false;

  // кнопки-точки
  const dotEls = SLIDES.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label(i));
    b.addEventListener('click', () => go(i, i < cur ? -1 : 1));
    dots.appendChild(b);
    return b;
  });
  function paintDots(p) {
    dotEls.forEach((b, i) => b.style.setProperty('--p', i < cur ? 1 : i === cur ? p : 0));
  }
  function relabel() { dotEls.forEach((b, i) => b.setAttribute('aria-label', label(i))); }

  /* ---------- запасной режим без WebGL ---------- */
  let gl = null, prog, U = {}, tex = [], texSz = [], loading = [];
  let fbo = null, fboTex = null;
  const url = (i) => `/img/${SLIDES[i]}${lowRes ? '-1280' : ''}.webp`;

  function startFallback() {
    root.classList.add('no-gl');
    root.classList.remove('gl-ready');
    gl = null;
  }
  function fallbackShow(i) {
    const im = new Image();
    im.onload = () => {
      poster.src = im.src;
      if (!reduce) poster.animate([{ opacity: .15 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' });
    };
    im.src = url(i);
  }

  /* ---------- WebGL ---------- */
  function setupGL() {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return false;
    try {
      const pr = program(gl, FRAG, UNIFORMS);
      prog = pr.p; U = pr.U;
    } catch (e) {
      console.warn('hero shader', e);
      return false;
    }
    gl.useProgram(prog);
    gl.uniform1i(U.uA, 0);
    gl.uniform1i(U.uB, 1);
    gl.bindVertexArray(gl.createVertexArray());
    return true;
  }

  function loadTex(i) {
    if (tex[i]) return Promise.resolve(tex[i]);
    if (loading[i]) return loading[i];
    loading[i] = loadImage(url(i)).then((im) => {
      if (!gl) throw new Error('no gl');
      tex[i] = textureFrom(gl, im);
      texSz[i] = [im.naturalWidth, im.naturalHeight];
      return tex[i];
    });
    return loading[i];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
    const k = Math.min(1, Math.sqrt((coarse ? 1.5e6 : 2.2e6) / (w * h)));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  const zoomOf = (i, now) => reduce ? 1.04 : 1.03 + 0.05 * Math.min(Math.max(now - slideStart[i], 0) / 10, 1);

  /* доля высоты экрана, которую занимает фото: на широких экранах — весь экран,
     на вертикальных — верхняя часть, а низ дорисовывается */
  function bandH() {
    const ra = canvas.width / canvas.height;
    const hp = .52 + .2 * Math.min(Math.max((ra - .4) / .4, 0), 1);
    const k = Math.min(Math.max((ra - .85) / .4, 0), 1);
    return hp + (1 - hp) * k;
  }
  const focOf = (i) => [FOCUS[i][0], 1 - FOCUS[i][1]];

  function setCommon(a, b, now) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[a]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[b]);
    gl.uniform2f(U.uSzA, texSz[a][0], texSz[a][1]);
    gl.uniform2f(U.uSzB, texSz[b][0], texSz[b][1]);
    gl.uniform2f(U.uFA, ...focOf(a));
    gl.uniform2f(U.uFB, ...focOf(b));
    gl.uniform1f(U.uH, bandH());
  }

  function draw(now) {
    if (!gl || !tex[cur]) return;
    const b = trans && tex[nxt] ? nxt : cur;
    resize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    setCommon(cur, b, now);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, now);
    gl.uniform1f(U.uMix, b === cur ? 0 : mixv);
    gl.uniform1f(U.uZA, zoomOf(cur, now));
    gl.uniform1f(U.uZB, zoomOf(b, now));
    gl.uniform1f(U.uDir, dir);
    gl.uniform1f(U.uFlat, 0);
    gl.uniform1f(U.uFx, reduce ? 0 : 1);
    gl.uniform1f(U.uGlow, reduce ? 0 : glow);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    const age = ripOn ? now - rip[2] : -1;
    if (ripOn && age > 3) ripOn = false;
    gl.uniform3f(U.uRip, rip[0], rip[1], ripOn ? age : -1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- подбор цвета текста: яркость фото под текстом ---------- */
  const MW = 64;
  function measure(i) {
    const cw = canvas.width, ch = canvas.height;
    const mh = Math.max(8, Math.round(MW * ch / cw));
    if (!fbo) {
      fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      fbo = gl.createFramebuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MW, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.viewport(0, 0, MW, mh);
    setCommon(i, i, 0);
    gl.uniform2f(U.uRes, cw, ch);   // тот же кадр, что на экране, только в миниатюре
    gl.uniform1f(U.uTime, 0); gl.uniform1f(U.uMix, 0);
    gl.uniform1f(U.uZA, 1.05); gl.uniform1f(U.uZB, 1.05);
    gl.uniform1f(U.uDir, 1); gl.uniform1f(U.uFlat, 1); gl.uniform1f(U.uFx, 0); gl.uniform1f(U.uGlow, 0);
    gl.uniform2f(U.uMouse, 0, 0);
    gl.uniform3f(U.uRip, 0, 0, -1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(MW * mh * 4);
    gl.readPixels(0, 0, MW, mh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const lum = (x0, y0, x1, y1) => {          // зона в долях экрана, y сверху вниз
      const xa = Math.max(0, Math.floor(x0 * MW)), xb = Math.min(MW, Math.ceil(x1 * MW));
      const ya = Math.max(0, Math.floor(y0 * mh)), yb = Math.min(mh, Math.ceil(y1 * mh));
      let s = 0, c = 0;
      for (let y = ya; y < yb; y++) {
        const row = mh - 1 - y;
        for (let x = xa; x < xb; x++) {
          const k = (row * MW + x) * 4;
          s += (.2126 * px[k] + .7152 * px[k + 1] + .0722 * px[k + 2]) / 255; c++;
        }
      }
      return c ? s / c : 0;
    };
    const hr = root.getBoundingClientRect();
    let zone = [.04, .3, .66, .82];
    const parts = root.querySelectorAll('.hero-inner > *');
    if (parts.length && hr.width > 0 && hr.height > 0) {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      parts.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        x0 = Math.min(x0, (r.left - hr.left) / hr.width); x1 = Math.max(x1, (r.right - hr.left) / hr.width);
        y0 = Math.min(y0, (r.top - hr.top) / hr.height); y1 = Math.max(y1, (r.bottom - hr.top) / hr.height);
      });
      if (x1 > x0 && y1 > y0) zone = [x0, y0, Math.min(x1, .85), y1];
    }
    return { text: lum(...zone), head: lum(0, 0, 1, Math.min(.14, 96 / (hr.height || 900))) };
  }

  function applyTone(i) {
    if (!gl || !tex[i]) return;
    let t;
    try { t = measure(i); } catch (e) { return; }
    const dark = t.text > .55;
    root.dataset.tone = dark ? 'dark' : 'light';
    document.documentElement.dataset.htone = dark ? 'dark' : 'light';
  }

  /* ---------- переключение ---------- */
  function go(i, d) {
    i = (i + N) % N;
    if (i === cur || trans) { if (!trans && i === cur) slideClockBase = clock; return; }
    nxt = i;
    dir = d || 1;
    const start = () => {
      trans = true; tStart = clock; mixv = 0; toneDone = false;
      slideStart[nxt] = clock;
      onSlide && onSlide(nxt);
      if (!gl) { cur = nxt; trans = false; slideClockBase = clock; paintDots(0); fallbackShow(cur); }
      else paintDots(0);
    };
    if (gl) loadTex(i).then(start, () => { startFallback(); fallbackShow(i); cur = i; onSlide && onSlide(i); });
    else start();
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, .1); last = t; clock += dt;
    mouse[0] += (mouseT[0] - mouse[0]) * Math.min(dt * 3, 1);
    mouse[1] += (mouseT[1] - mouse[1]) * Math.min(dt * 3, 1);
    glow += (glowT - glow) * Math.min(dt * 2, 1);
    if (trans) {
      const k = Math.min((clock - tStart) / TRANS, 1);
      mixv = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
      if (!toneDone && k >= TONE_AT) { toneDone = true; applyTone(nxt); }
      if (k >= 1) { cur = nxt; trans = false; mixv = 0; slideClockBase = clock; if (gl) loadTex((cur + 1) % N).catch(() => {}); }
    }
    if (!trans && !reduce) {
      const p = (clock - slideClockBase) / DUR;
      paintDots(Math.min(p, 1));
      if (p >= 1) go(cur + 1, 1);
    } else if (reduce) paintDots(1);
    draw(clock);
    requestAnimationFrame(frame);
  }
  function play() {
    if (running || dead || !gl || !visible || document.hidden) return;
    running = true; last = performance.now(); requestAnimationFrame(frame);
  }
  function pause() { running = false; }

  /* ---------- запуск ---------- */
  lowRes = Math.min(window.innerWidth * (window.devicePixelRatio || 1), 1920) <= 1400;
  if (!setupGL()) startFallback();

  if (gl) {
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; pause(); startFallback(); });
    loadTex(0).then(() => {
      resize(); draw(0);
      applyTone(0);
      root.classList.add('gl-ready');
      slideStart[0] = 0; slideClockBase = 0;
      paintDots(0);
      play();
      loadTex(1).catch(() => {});
    }, () => startFallback());
  } else {
    // без WebGL: смена картинок по таймеру
    paintDots(0);
    if (!reduce) setInterval(() => { if (!document.hidden && visible) go(cur + 1, 1); }, DUR * 1000);
  }

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? play() : pause(); }, { threshold: 0.02 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  let rz = 0;
  window.addEventListener('resize', () => {
    if (!gl || !tex[cur]) return;
    if (!running) draw(clock);
    clearTimeout(rz); rz = setTimeout(() => { resize(); applyTone(trans ? nxt : cur); }, 250);
  });

  prev.addEventListener('click', () => go(cur - 1, -1));
  next.addEventListener('click', () => go(cur + 1, 1));

  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = root.getBoundingClientRect();
    mouseT[0] = ((e.clientX - r.left) / r.width - .5) * 2;
    mouseT[1] = -((e.clientY - r.top) / r.height - .5) * 2;
    glowT = 1;
  });
  root.addEventListener('pointerleave', () => { glowT = 0; mouseT[0] = mouseT[1] = 0; });

  // круги от касания / щелчка (не по кнопкам и ссылкам)
  root.addEventListener('pointerdown', (e) => {
    if (reduce || !gl || e.target.closest('a, button')) return;
    const r = root.getBoundingClientRect();
    rip = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, clock];
    ripOn = true;
  });

  // свайп
  let sx = 0, sy = 0, sId = null;
  root.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; sId = e.pointerId; });
  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sId) return; sId = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });

  return { go, relabel, get index() { return cur; } };
}
