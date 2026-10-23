/* Главный экран: слайдшоу фотографий на WebGL2 — «растворение» через шум с тёплой кромкой,
   медленный наезд (Ken Burns), лёгкий параллакс от мыши, плёночное зерно и виньетка.
   Без WebGL остаётся обычная картинка с плавной сменой — сайт не ломается. */

export const SLIDES = ['yurt', 'rando-cheval', 'trekking', 'ski-rando', 'trout'];
const DUR = 6.5;      // секунд на слайд
const TRANS = 1.7;    // секунд на растворение

const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uMix, uZA, uZB;
uniform vec2 uSzA, uSzB, uMouse;
uniform sampler2D uA, uB;
out vec4 o;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= .5; } return s; }

vec2 cover(vec2 uv, vec2 sz, float z, vec2 par){
  float ra = uRes.x / uRes.y, ri = sz.x / sz.y;
  vec2 s = ra > ri ? vec2(1., ri / ra) : vec2(ra / ri, 1.);
  return (uv - .5) * s / z + .5 + par;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  float n = fbm(uv * asp * 2.6 + vec2(uTime * .03, 0.));
  n = n * .78 + uv.x * .22;                       // растворение идёт слева направо
  float w = .13;
  float th = uMix * (1. + 2. * w) - w;
  float m = smoothstep(n - w, n + w, th);
  float band = m * (1. - m) * 4. * step(.001, uMix) * step(uMix, .999);

  vec2 dA = vec2(n - .5, .5 - n) * .035 * m;      // лёгкое «течение» кадров в зоне перехода
  vec2 dB = vec2(n - .5, .5 - n) * .035 * (1. - m);
  vec2 par = uMouse * .012;
  vec3 a = texture(uA, cover(uv, uSzA, uZA, par * .6) + dA).rgb;
  vec3 b = texture(uB, cover(uv, uSzB, uZB, par) - dB).rgb;
  vec3 c = mix(a, b, m);

  c += vec3(1., .62, .26) * band * .55;           // тёплая золотая кромка
  c *= vec3(1.03, 1., .96);                       // чуть теплее
  float v = 1. - smoothstep(.35, 1.25, length((uv - .5) * vec2(1.1, 1.)));
  c *= mix(.62, 1., v);                           // виньетка
  c += (h21(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .035;   // зерно
  o = vec4(c, 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function initHero({ root, canvas, poster, dots, prev, next, label, onSlide }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = SLIDES.length;
  let cur = 0, nxt = 0, mixv = 0, trans = false, tStart = 0;
  let clock = 0, last = 0, running = false, visible = true, dead = false;
  let lowRes = true;
  const slideStart = new Array(N).fill(0);
  let slideClockBase = 0; // clock в момент появления текущего слайда
  const mouse = [0, 0], mouseT = [0, 0];

  // кнопки-точки
  const dotEls = SLIDES.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label(i));
    b.addEventListener('click', () => go(i));
    dots.appendChild(b);
    return b;
  });
  function paintDots(p) {
    dotEls.forEach((b, i) => b.style.setProperty('--p', i < cur ? 1 : i === cur ? p : 0));
  }
  function relabel() { dotEls.forEach((b, i) => b.setAttribute('aria-label', label(i))); }

  /* ---------- запасной режим без WebGL ---------- */
  let gl = null, prog, U = {}, tex = [], texSz = [], loading = [];
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
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('hero shader', e);
      return false;
    }
    gl.useProgram(prog);
    ['uRes', 'uTime', 'uMix', 'uZA', 'uZB', 'uSzA', 'uSzB', 'uMouse', 'uA', 'uB'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
    gl.uniform1i(U.uA, 0);
    gl.uniform1i(U.uB, 1);
    gl.bindVertexArray(gl.createVertexArray());
    return true;
  }

  function loadTex(i) {
    if (tex[i]) return Promise.resolve(tex[i]);
    if (loading[i]) return loading[i];
    loading[i] = new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        if (!gl) return rej(new Error('no gl'));
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        tex[i] = t;
        texSz[i] = [im.naturalWidth, im.naturalHeight];
        res(t);
      };
      im.onerror = rej;
      im.src = url(i);
    });
    return loading[i];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
    const k = Math.min(1, Math.sqrt(2.2e6 / (w * h)));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  const zoomOf = (i, now) => reduce ? 1.04 : 1.03 + 0.05 * Math.min(Math.max(now - slideStart[i], 0) / 10, 1);

  function draw(now) {
    if (!gl || !tex[cur]) return;
    const b = trans && tex[nxt] ? nxt : cur;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[b]);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, now);
    gl.uniform1f(U.uMix, b === cur ? 0 : mixv);
    gl.uniform1f(U.uZA, zoomOf(cur, now));
    gl.uniform1f(U.uZB, zoomOf(b, now));
    gl.uniform2f(U.uSzA, texSz[cur][0], texSz[cur][1]);
    gl.uniform2f(U.uSzB, texSz[b][0], texSz[b][1]);
    gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- переключение ---------- */
  function go(i) {
    i = (i + N) % N;
    if (i === cur || trans) { if (!trans && i === cur) slideClockBase = clock; return; }
    nxt = i;
    const start = () => {
      trans = true; tStart = clock; mixv = 0;
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
    if (trans) {
      const k = Math.min((clock - tStart) / TRANS, 1);
      mixv = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
      if (k >= 1) { cur = nxt; trans = false; mixv = 0; slideClockBase = clock; if (gl) loadTex((cur + 1) % N).catch(() => {}); }
    }
    if (!trans && !reduce) {
      const p = (clock - slideClockBase) / DUR;
      paintDots(Math.min(p, 1));
      if (p >= 1) go(cur + 1);
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
      root.classList.add('gl-ready');
      slideStart[0] = 0; slideClockBase = 0;
      paintDots(0);
      play();
      loadTex(1).catch(() => {});
    }, () => startFallback());
  } else {
    // без WebGL: смена картинок по таймеру
    paintDots(0);
    if (!reduce) setInterval(() => { if (!document.hidden && visible) go(cur + 1); }, DUR * 1000);
  }

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? play() : pause(); }, { threshold: 0.02 }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  window.addEventListener('resize', () => { if (gl && tex[cur] && !running) draw(clock); });

  prev.addEventListener('click', () => go(cur - 1));
  next.addEventListener('click', () => go(cur + 1));

  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = root.getBoundingClientRect();
    mouseT[0] = ((e.clientX - r.left) / r.width - .5) * 2;
    mouseT[1] = -((e.clientY - r.top) / r.height - .5) * 2;
  });
  // свайп
  let sx = 0, sy = 0, sId = null;
  root.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; sId = e.pointerId; });
  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sId) return; sId = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(cur + (dx < 0 ? 1 : -1));
  });

  return { go, relabel, get index() { return cur; } };
}
