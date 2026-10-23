/* Фон блока «Направление»: медленно «дышащая» карта горизонталей (изолинии шума).
   Рисуется в половинном разрешении и только пока блок виден. Без WebGL2 — просто тёмный фон. */

const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.02 + vec2(17.1, 9.3); a *= .5; } return s; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - .5) * vec2(uRes.x / uRes.y, 1.) * 2.4;
  float t = uTime * .035;
  float h = fbm(p + vec2(t, -t * .6)) + .12 * fbm(p * 3. - vec2(t * 1.6, 0.));
  float L = h * 15.;                       // число горизонталей
  float f = abs(fract(L - .5) - .5) / max(fwidth(L), 1e-4);
  float line = 1. - smoothstep(.0, 1.35, f);
  float idx = 1. - smoothstep(.0, 1.7, abs(fract(L / 4. - .5) - .5) * 4. / max(fwidth(L), 1e-4));  // каждая 4-я — жирнее
  vec3 ink = vec3(.039, .067, .110);
  vec3 gold = vec3(.94, .64, .23);
  float fade = smoothstep(.0, .55, uv.x) * .85 + .15;                // справа линии ярче
  vec3 c = ink + vec3(.02, .035, .06) * h;                            // лёгкая подсветка «высот»
  c = mix(c, gold, line * .17 * fade + idx * .22 * fade);
  o = vec4(c, 1.);
}`;

export function initTopo(canvas, host) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('topo shader', e); return; }
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());
  const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');

  let running = false, last = 0, clock = 0;
  function draw() {
    const k = Math.min(window.devicePixelRatio || 1, 1.25) * .75;
    const w = Math.max(2, Math.round(canvas.clientWidth * k)), h = Math.max(2, Math.round(canvas.clientHeight * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, clock);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(t) {
    if (!running) return;
    clock += Math.min((t - last) / 1000, .1); last = t;
    draw();
    requestAnimationFrame(frame);
  }
  draw();
  if (reduce) return;
  let seen = false;
  const sync = () => {
    const on = seen && !document.hidden;
    if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!on) running = false;
  };
  new IntersectionObserver((es) => { seen = es[0].isIntersecting; sync(); }, { threshold: 0 }).observe(host);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', () => { if (!running) draw(); });
}
