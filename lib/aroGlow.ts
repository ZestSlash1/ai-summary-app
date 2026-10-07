/**
 * ARO's reply glow: the colored light that rises behind the thread while a reply is on its
 * way, modeled on the Gemini app's thinking background and measured from a screen recording
 * of it, frame by frame.
 *
 * The light is a palette strip (blue, teal, green, lime, yellow, amber, pink, violet, blue)
 * that slides sideways under the panel, left edge leading. While the model thinks it slides
 * at a steady pace and loops. When the answer starts it speeds up, brightens, lands on blue
 * everywhere, and fades. Dark plumes of noise rise into the lower half of the light.
 *
 * Everything here is framework-free: a palette, a WebGL renderer, and a driver that turns
 * think / answer / release calls into per-frame uniforms. components/AroGlow.tsx runs it.
 */

/** Palette stops over one lap, as [position 0..1, sRGB hex], interpolated in OKLab.
 * Reconstructed from the recording's top edge with the brightness gain divided out. */
export const GLOW_PALETTE: ReadonlyArray<readonly [number, string]> = [
  [0.0, "#2c62e8"],
  [0.122, "#2470c8"],
  [0.281, "#009854"],
  [0.461, "#34a530"],
  [0.546, "#7db406"],
  [0.637, "#eac10e"],
  [0.729, "#f0a225"],
  [0.773, "#e79c2d"],
  [0.8, "#de7959"],
  [0.834, "#cd4ba1"],
  [0.858, "#b242be"],
  [0.919, "#6751d6"],
  [0.983, "#315ee9"],
  [1.0, "#2c62e8"],
];

/** Length of one palette lap, in panel widths. At the thinking pace a lap takes ~4.9s. */
export const GLOW_LAP = 5.9;

/** Timings in seconds and speeds in panel widths per second, all measured from the reference. */
export const GLOW_TIMING = {
  fadeIn: 0.93, // linear, from the send
  drift: 1.1, // the light holds blue this long before it starts to slide
  driftRamp: 0.6,
  pace: 1.21, // slide speed while thinking
  rush: 3.0, // slide speed once the answer starts
  rushRamp: 0.9,
  plumeRamp: 1.5, // the dark plumes grow in once the slide starts
  gainRamp: 0.75,
  settle: 0.08, // a beat on solid blue before the fade
  fadeOut: 0.65,
  release: 0.45, // stopped or failed without an answer
} as const;

/** The light runs at 74% brightness while thinking and at full brightness as the answer lands. */
const GAIN_THINKING = 0.743;
const START = -0.4;
const UNBOUNDED = 1e6;

export type GlowFrame = {
  alpha: number;
  slide: number;
  floor: number;
  ceil: number;
  gain: number;
  plume: number;
  time: number;
};

type Ease = (x: number) => number;
const linear: Ease = (x) => x;
const sineInOut: Ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

type Tween = { from: number; to: number; at: number; dur: number; ease: Ease };
const hold = (v: number): Tween => ({ from: v, to: v, at: 0, dur: 0, ease: linear });
function valueOf(tw: Tween, now: number): number {
  if (tw.dur <= 0 || now >= tw.at + tw.dur) return now < tw.at ? tw.from : tw.to;
  if (now <= tw.at) return tw.from;
  return tw.from + (tw.to - tw.from) * tw.ease((now - tw.at) / tw.dur);
}

/**
 * The glow's timeline. Call think() when a message is sent, answer() when the reply's first
 * words arrive, release() when the turn ends without them, and step(dt) once per frame.
 * With `still` (reduced motion) the light only fades in and out on solid blue.
 */
export function createGlowDriver({ still = false, seed = Math.random() * 100 } = {}) {
  const T = GLOW_TIMING;
  let mode: "idle" | "thinking" | "answering" | "fading" = "idle";
  let now = 0;
  let time = seed;
  // Positions are in panel widths along the palette; the left edge reads slide + 1. At rest
  // the panel spans the lap's opening blue, a touch lighter on the left as in the reference.
  let slide = START;
  let floor = 0;
  let ceil = hold(UNBOUNDED);
  let settleAt = -1;
  let alpha = hold(0);
  let speed = hold(0);
  let gain = hold(GAIN_THINKING);
  let plume = hold(0);

  const to = (tw: Tween, target: number, dur: number, ease: Ease, delay = 0): Tween => ({
    from: valueOf(tw, now + delay),
    to: target,
    at: now + delay,
    dur,
    ease,
  });

  function fadeOut(dur: number) {
    mode = "fading";
    alpha = to(alpha, 0, dur, sineInOut);
  }

  function reset() {
    mode = "idle";
    slide = START;
    floor = 0;
    ceil = hold(UNBOUNDED);
    settleAt = -1;
    alpha = hold(0);
    speed = hold(0);
    gain = hold(GAIN_THINKING);
    plume = hold(0);
  }

  return {
    get running() {
      return mode !== "idle";
    },
    get thinking() {
      return mode === "thinking";
    },

    /** Drop straight to dark, for a glow nobody is watching. */
    reset,

    think() {
      if (mode === "thinking") return;
      // A new turn takes over from a landing or fading one, from wherever its light is.
      const resuming = mode !== "idle";
      if (!resuming) reset();
      mode = "thinking";
      ceil = hold(UNBOUNDED);
      settleAt = -1;
      const a = valueOf(alpha, now);
      alpha = to(alpha, 1, T.fadeIn * (1 - a), linear);
      if (still) return;
      const wait = resuming ? 0 : T.drift;
      speed = to(speed, T.pace, T.driftRamp, sineInOut, wait);
      plume = to(plume, 1, T.plumeRamp, sineInOut, wait);
      gain = to(gain, GAIN_THINKING, 0.4, sineInOut);
    },

    answer() {
      if (mode !== "thinking") return;
      mode = "answering";
      gain = to(gain, 1, still ? 0.3 : T.gainRamp, sineInOut);
      if (still) return;
      const lead = slide + 1;
      if (floor === 0) {
        // A quick answer, before the strip has left its opening blue: draw the left edge
        // back onto that blue instead of running a whole lap.
        ceil = to(hold(lead), floor, 0.5, sineInOut);
        speed = to(speed, 0, 0.3, sineInOut);
      } else {
        // Otherwise finish on the next blue ahead of the left edge, never running backwards,
        // and hurry when that blue is far so the answer is never kept waiting on the light.
        const target = Math.ceil(lead / GLOW_LAP) * GLOW_LAP;
        ceil = hold(target);
        speed = to(speed, Math.max(T.rush, (target - slide) / 1.4), T.rushRamp, sineInOut);
      }
    },

    release() {
      if (mode === "thinking") fadeOut(T.release);
    },

    step(dt: number): GlowFrame {
      now += dt;
      time = (time + dt) % 1000;
      slide += valueOf(speed, now) * dt;
      // Once the trailing edge has left the starting blue, the strip is free to loop.
      if (floor > -UNBOUNDED && slide > floor) floor = -UNBOUNDED;
      if (mode === "thinking" && floor === -UNBOUNDED && slide > 2 * GLOW_LAP) slide -= GLOW_LAP;

      const top = valueOf(ceil, now);
      if (mode === "answering") {
        const allBlue = still || slide + 1 <= floor || slide >= top || top <= floor + 1e-4;
        if (allBlue && settleAt < 0) settleAt = now + (still ? 0.25 : T.settle);
        if (settleAt >= 0 && now >= settleAt) fadeOut(T.fadeOut);
      }
      if (mode === "fading" && now >= alpha.at + alpha.dur) mode = "idle";

      return {
        alpha: valueOf(alpha, now),
        slide,
        floor,
        ceil: top,
        gain: valueOf(gain, now),
        plume: valueOf(plume, now),
        time,
      };
    },
  };
}

export type GlowDriver = ReturnType<typeof createGlowDriver>;

// --- palette texture -------------------------------------------------------------------

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}
function hexToOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToSrgb([L, A, B]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** One lap of the palette as RGBA bytes, `size` texels wide, interpolated in OKLab. */
export function paletteTexels(size = 512): Uint8Array {
  const stops = GLOW_PALETTE.map(([at, hex]) => ({ at, lab: hexToOklab(hex) }));
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const p = i / size;
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1].at) k++;
    const a = stops[k];
    const b = stops[k + 1];
    const f = (p - a.at) / (b.at - a.at);
    const rgb = oklabToSrgb([0, 1, 2].map((c) => a.lab[c] + (b.lab[c] - a.lab[c]) * f) as [number, number, number]);
    out.set([...rgb.map((v) => Math.round(v * 255)), 255], i * 4);
  }
  return out;
}

// --- renderer ----------------------------------------------------------------------------

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // y runs down, like the page
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uNoiseX, uTime, uSlide, uFloor, uCeil, uLap;
uniform float uGain, uAlpha, uPlume, uLight;
uniform sampler2D uPalette;

// 3D simplex noise, Ian McEwan / Ashima Arts (MIT), 2022 revision.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  float x = vUv.x;
  float y = vUv.y;

  // A slow field that drifts right; it carves the plumes and stirs the body's color.
  vec3 q = vec3(x * uNoiseX - uTime * 0.08, y * 1.0 - uTime * 0.05, uTime * 0.18);
  float broad = snoise(q);
  float n = 0.88 * broad + 0.12 * snoise(q * 2.1 + vec3(11.7, 3.1, 5.3));
  float depth = smoothstep(0.06, 0.5, y);

  // Palette position: the left edge leads, and the body runs a little ahead or behind.
  float w = clamp(uSlide + (1.0 - x) + uPlume * 0.16 * broad * depth, uFloor, uCeil);
  vec3 color = texture2D(uPalette, vec2(w / uLap, 0.5)).rgb;

  // Vertical profile, measured: a bright bloom on the top edge over a broad, dimmer body.
  // Where the field dips, darkness rises from below and swallows both, up to a soft edge;
  // where it swells, the body hangs a little lower.
  float bloom = 0.81 * exp(-(y * y) / 0.034225);
  float body = 0.19 * (1.0 - smoothstep(0.36, 0.6, y - uPlume * 0.12 * max(n, 0.0)));
  // n mostly stays within ±0.4; a deep dip lifts the dark to a third of the way up.
  float plume = smoothstep(0.0, 0.11, 0.64 +uPlume * 0.34 * clamp(n / 0.38, -1.15, 0.0) - y);
  float side = 1.0 - 0.11 * pow(abs(x - 0.5) * 2.0, 3.0);
  float level = (bloom + body) * plume * uGain * side * uAlpha;

  // Dimmer light is deeper, not grayer: the reference saturates as it darkens, both down
  // the panel and through the fades. Light theme: a softer, lifted tint instead.
  color = mix(pow(color, vec3(1.6 - 0.6 * level)), mix(color, vec3(1.0), 0.12), uLight);
  float a = level * mix(1.0, 0.5, uLight);

  // Interleaved gradient noise, one 8-bit step: dark gradients band without it.
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  a = clamp(a + dither, 0.0, 1.0);
  gl_FragColor = vec4(min(color * a + dither, vec3(a)), a);
}`;

export type GlowRenderer = {
  /** Match the drawing buffer to the canvas's CSS size times `dpr`. */
  resize(dpr: number): void;
  draw(frame: GlowFrame, light: boolean): void;
  clear(): void;
  dispose(): void;
};

/** A WebGL renderer for the glow, or null when WebGL is unavailable. */
export function createGlowRenderer(canvas: HTMLCanvasElement): GlowRenderer | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  function compile(type: number, src: string) {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, src);
    gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
      throw new Error(`AroGlow shader: ${gl!.getShaderInfoLog(sh)}`);
    }
    return sh;
  }
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`AroGlow program: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteTexels(512));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const u = Object.fromEntries(
    ["uNoiseX", "uTime", "uSlide", "uFloor", "uCeil", "uLap", "uGain", "uAlpha", "uPlume", "uLight", "uPalette"].map(
      (name) => [name, gl.getUniformLocation(program, name)]
    )
  );
  gl.uniform1i(u.uPalette, 0);
  gl.uniform1f(u.uLap, GLOW_LAP);

  return {
    resize(dpr) {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      // The plumes were measured on a tall phone. On wider panels, keep them from
      // stretching into flat hills by packing a few more across.
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      gl.uniform1f(u.uNoiseX, 1.1 * Math.sqrt(Math.max(1, aspect / 0.46)));
    },
    draw(f, light) {
      gl.uniform1f(u.uTime, f.time);
      gl.uniform1f(u.uSlide, f.slide);
      gl.uniform1f(u.uFloor, f.floor);
      gl.uniform1f(u.uCeil, f.ceil);
      gl.uniform1f(u.uGain, f.gain);
      gl.uniform1f(u.uAlpha, f.alpha);
      gl.uniform1f(u.uPlume, f.plume);
      gl.uniform1f(u.uLight, light ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    clear() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    },
  };
}
