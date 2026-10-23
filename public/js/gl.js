/* Общие куски WebGL2: вершинный шейдер на весь экран, шум, сборка программы, загрузка текстуры. */

export const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const NOISE = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
`;

/* Кадрирование «cover» с фокусной точкой. foc — центр интереса в координатах картинки (0..1),
   H — доля высоты экрана, которую занимает фото (1 — на весь экран; меньше — внизу «дорисовка»).
   Ниже фото кадр продолжается зеркальным, всё сильнее размытым и затемнённым отражением —
   так вертикальный экран телефона не режет широкий снимок до узкой полоски. */
export const PLACE = `
vec3 place(sampler2D T, vec2 uv, vec2 res, vec2 sz, float z, vec2 foc, vec2 par, float H){
  float ra = res.x / res.y, ri = sz.x / sz.y;
  float ba = ra / H;
  vec2 s = ba > ri ? vec2(1., ri / ba) : vec2(ba / ri, 1.);
  vec2 vis = s / z;
  vec2 ctr = clamp(foc, vis * .5, 1. - vis * .5);
  vec2 b = vec2(uv.x, (uv.y - (1. - H)) / H);
  float below = max(-b.y, 0.);
  b.y = abs(b.y);
  vec2 c = ctr + (b - .5) * vis + par;
  float fp = max(vis.x * sz.x / res.x, vis.y * sz.y / (res.y * H));
  float lod = max(log2(max(fp, 1.)), 0.) + 4.6 * smoothstep(0., .5, below);
  vec3 col = textureLod(T, c, lod).rgb;
  float ex = smoothstep(0., .65, below);
  col = mix(col, col * vec3(.5, .56, .68) + vec3(.008, .016, .03), ex);
  return col;
}
`;

export function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

/* Собирает программу и возвращает её вместе с адресами uniform-переменных. */
export function program(gl, frag, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const U = {};
  names.forEach((k) => (U[k] = gl.getUniformLocation(p, k)));
  return { p, U };
}

export function textureFrom(gl, im) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, im);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}
