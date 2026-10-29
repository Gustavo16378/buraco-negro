// Etapa 1: raios em linha reta (ainda sem gravidade), céu de estrelas
// procedurais e uma esfera preta de raio 1 no lugar do horizonte.

uniform vec3 uCamPos;    // posição da câmera, em r_s
uniform mat4 uCamMatrix; // matrixWorld da câmera
uniform float uFov;      // campo de visão vertical, em radianos
uniform float uAspect;   // largura / altura

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.14159265359;
const float INV_UINT_MAX = 1.0 / 4294967295.0;

vec3 rayDirection(vec2 uv) {
  float t = tan(uFov * 0.5);
  return normalize(mat3(uCamMatrix) * vec3(uv.x * t * uAspect, uv.y * t, -1.0));
}

// ---------------------------------------------------------------------------
// Céu procedural
//
// Tudo aqui é função só da direção `d` do raio (o tamanho do pixel entra só
// para suavizar). Girar a câmera não faz nada "nadar", e a Etapa 2 entorta o
// céu inteiro só mudando a direção final do raio.
// ---------------------------------------------------------------------------

// Hash inteiro PCG3D (Jarzynski e Olano, 2020).
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

float hash31(uvec3 p) {
  return float(pcg3d(p).x) * INV_UINT_MAX;
}

// Value noise 3D em [0, 1]. O deslocamento de 4096 mantém a grade positiva
// para a conversão em uint.
float noise3(vec3 p) {
  uvec3 i = uvec3(floor(p) + 4096.0);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i),                  hash31(i + uvec3(1u, 0u, 0u)), u.x),
                 mix(hash31(i + uvec3(0u, 1u, 0u)), hash31(i + uvec3(1u, 1u, 0u)), u.x), u.y),
             mix(mix(hash31(i + uvec3(0u, 0u, 1u)), hash31(i + uvec3(1u, 0u, 1u)), u.x),
                 mix(hash31(i + uvec3(0u, 1u, 1u)), hash31(i + uvec3(1u, 1u, 1u)), u.x), u.y), u.z);
}

// Soma de oitavas de noise3, normalizada para ficar em [0, 1].
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < octaves; i++) {
    sum += amp * noise3(p);
    norm += amp;
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum / norm;
}

// --- Via Láctea -------------------------------------------------------------
// A faixa segue um grande círculo cujo plano faz 60° com o plano do disco
// (y = 0). Ela passa ~2° ao lado da direção inicial da câmera (22 r_s, 8°
// acima do disco), atrás do buraco negro, para a lente da Etapa 2 ter o que
// distorcer.
const vec3 GAL_N = vec3(0.865317, 0.5, -0.035028);       // normal do plano da galáxia
const vec3 GAL_C = vec3(0.344743, -0.644440, -0.682531); // centro galáctico, no plano, 40° ao lado

// Devolve o brilho difuso da faixa, já escurecido pela poeira. Por referência:
// `band` (0 a 1, presença da faixa, usada para concentrar estrelas) e
// `transmission` (quanto a poeira deixa passar, aplicado também às estrelas).
vec3 milkyWay(vec3 d, out float band, out float transmission) {
  band = 0.0;
  transmission = 1.0;

  float lat = asin(clamp(dot(d, GAL_N), -1.0, 1.0)); // latitude galáctica
  float toCenter = acos(clamp(dot(d, GAL_C), -1.0, 1.0));
  float bulge = exp(-toCenter * toCenter / (0.35 * 0.35)); // bojo central, ~20° de raio

  // Meia largura irregular (radianos), mais grossa perto do centro galáctico.
  float width = (0.09 + 0.13 * bulge) * mix(0.7, 1.3, noise3(d * 3.0 + 5.3));
  if (abs(lat) > 3.5 * width) return vec3(0.0);

  band = exp(-lat * lat / (width * width));

  // Coordenada esticada ao longo da faixa: o ruído varia mais rápido na
  // direção perpendicular ao plano, então nuvens e poeira saem alongadas.
  vec3 q = d + GAL_N * dot(d, GAL_N) * 2.0;

  // Brilho difuso de estrelas não resolvidas, em nuvens.
  float clouds = fbm(q * 5.0 + 11.0, 5);
  float glow = 0.022 * band * (2.0 * clouds * clouds) * (1.0 + 2.5 * bulge);
  vec3 tint = mix(vec3(0.80, 0.85, 1.0), vec3(1.0, 0.82, 0.60), bulge);

  // Faixas escuras de poeira, no meio da faixa e um pouco deslocadas do centro.
  float dustLat = (lat - 0.25 * width) / (0.45 * width);
  float dustProfile = exp(-dustLat * dustLat);
  float lanes = smoothstep(0.45, 0.62, fbm(q * 7.0 + 47.0, 5));
  transmission = 1.0 - 0.9 * dustProfile * lanes;

  return glow * tint * transmission;
}

// --- Estrelas ---------------------------------------------------------------
// A esfera de direções é dividida nas 6 faces de um cubo, com coordenadas
// equiangulares (células de tamanho angular quase igual). Cada célula pode ter
// uma estrela, com posição, brilho e cor tirados de um hash da célula.

// Face dominante (0 a 5) e coordenadas (u, v) em [-1, 1] sobre ela.
int cubeFace(vec3 d, out vec2 uv) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) { uv = d.zy / a.x; return d.x > 0.0 ? 0 : 1; }
  if (a.y >= a.z)               { uv = d.xz / a.y; return d.y > 0.0 ? 2 : 3; }
  uv = d.xy / a.z;
  return d.z > 0.0 ? 4 : 5;
}

// Inverso de cubeFace: direção (não normalizada) para a face e (u, v).
vec3 cubeDir(int face, vec2 uv) {
  if (face == 0) return vec3( 1.0, uv.y, uv.x);
  if (face == 1) return vec3(-1.0, uv.y, uv.x);
  if (face == 2) return vec3(uv.x,  1.0, uv.y);
  if (face == 3) return vec3(uv.x, -1.0, uv.y);
  if (face == 4) return vec3(uv.x, uv.y,  1.0);
  return vec3(uv.x, uv.y, -1.0);
}

// Cor de estrela de t = 0 (fria, alaranjada) a t = 1 (quente, azulada),
// passando por amarelada e branca. Aproximação visual, não é corpo negro.
vec3 starColor(float t) {
  vec3 c = mix(vec3(1.0, 0.50, 0.24), vec3(1.0, 0.84, 0.62), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0), smoothstep(0.3, 0.55, t));
  return mix(c, vec3(0.58, 0.72, 1.0), smoothstep(0.55, 1.0, t));
}

// Uma camada de estrelas.
//   cells:   células por aresta de cada face do cubo
//   density: chance de uma célula ter estrela (pode passar de 1 = todas têm)
//   amp:     brilho de pico mínimo (x) e máximo (y), linear, e o expoente (z)
//            da distribuição: quanto maior, mais estrelas ficam perto do mínimo
//   sigma:   raio angular próprio da estrela, em radianos
//   pix:     tamanho angular do pixel nesta direção
//   pixRef:  tamanho angular do pixel no centro da tela
// Estrela menor que o pixel é desenhada com ~1 pixel de largura e o mesmo
// fluxo, o que evita cintilação quando a câmera gira devagar.
// A densidade vem calculada na direção do pixel, não na da estrela: como ela
// varia devagar no céu, a diferença dentro de uma estrela é desprezível.
vec3 starLayer(vec3 d, float pix, float pixRef, float cells, float density, vec3 amp, float sigma, uint seed) {
  vec2 uv;
  int face = cubeFace(d, uv);
  vec2 cell = floor((atan(uv) * (4.0 / PI) * 0.5 + 0.5) * cells);

  float s = max(sigma, 0.7 * pix);
  float peak = (0.7 * pixRef) * (0.7 * pixRef) / (s * s);

  vec3 sum = vec3(0.0);
  // Olha as 8 células vizinhas também, para o brilho de uma estrela perto da
  // borda da célula não ser cortado.
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(i, j);
      if (any(lessThan(c, vec2(0.0))) || any(greaterThanEqual(c, vec2(cells)))) continue;

      uvec3 k = pcg3d(uvec3(uvec2(c), uint(face) + 8u * seed));
      vec3 h1 = vec3(k) * INV_UINT_MAX;          // xy: posição na célula, z: existe?
      vec3 h2 = vec3(pcg3d(k)) * INV_UINT_MAX;   // x: brilho, y: cor

      vec2 q = tan(((c + 0.2 + 0.6 * h1.xy) / cells * 2.0 - 1.0) * (PI / 4.0));
      // Células equiangulares ainda variam ~30% em área entre o centro e o canto
      // da face. A chance de existir estrela acompanha a área, para a densidade
      // ficar uniforme no céu todo.
      float q2x = q.x * q.x, q2y = q.y * q.y;
      float area = (1.0 + q2x) * (1.0 + q2y) / pow(1.0 + q2x + q2y, 1.5);
      if (h1.z > density * area) continue;

      vec3 sd = normalize(cubeDir(face, q));
      float dist = length(d - sd); // corda ~ ângulo, ótimo para ângulos pequenos

      float a = mix(amp.x, amp.y, pow(h2.x, amp.z));
      sum += starColor(h2.y) * a * peak * exp(-dist * dist / (2.0 * s * s));
    }
  }
  return sum;
}

vec3 sky(vec3 d, float pix, float pixRef) {
  float band, transmission;
  vec3 col = milkyWay(d, band, transmission);

  // Ruído de baixa frequência na densidade: regiões do céu mais cheias e
  // outras quase vazias (de 0,15x a 1,7x a densidade média).
  float clump = mix(0.15, 1.7, smoothstep(0.3, 0.7, fbm(d * 2.2 + 31.7, 2)));

  // As camadas fracas se concentram na Via Láctea; as brilhantes, que são as
  // estrelas mais próximas, ficam quase uniformes.
  vec3 stars = vec3(0.0);
  stars += starLayer(d, pix, pixRef, 200.0, 0.21 * clump * (1.0 + 4.0 * band), vec3(0.008, 0.06, 3.0), 0.0002, 0u);
  stars += starLayer(d, pix, pixRef,  70.0, 0.30 * clump * (1.0 + 2.0 * band), vec3(0.03, 0.50, 5.0),  0.0003, 1u);
  stars += starLayer(d, pix, pixRef,  24.0, 0.35 * clump * (1.0 + 0.5 * band), vec3(0.20, 4.00, 6.0),  0.0005, 2u);
  stars += starLayer(d, pix, pixRef,   8.0, 0.30,                              vec3(3.00, 20.0, 2.0),  0.0007, 3u);

  return col + stars * transmission;
}

// ---------------------------------------------------------------------------

void main() {
  vec3 ro = uCamPos;
  vec3 rd = rayDirection(vUv);

  // Tamanho angular do pixel: o local (variação da direção entre pixels
  // vizinhos) e o de referência no centro da tela. Calculados aqui, fora de
  // if e de laço, porque derivadas de tela só valem em fluxo uniforme.
  float pix = max(length(dFdx(rd)), length(dFdy(rd)));
  float pixRef = tan(uFov * 0.5) * abs(dFdy(vUv.y));

  vec3 col = sky(rd, pix, pixRef);

  // Esfera preta de raio 1 (horizonte), com o raio seguindo em linha reta.
  // `impact` é a menor distância entre a reta do raio e o centro: abaixo de 1,
  // o raio acerta a esfera. A borda é suavizada em ~1 pixel.
  float b = dot(ro, rd);
  float impact = length(ro - b * rd);
  float cover = clamp((1.0 - impact) / max(fwidth(impact), 1e-6) + 0.5, 0.0, 1.0);
  if (b > 0.0) cover = 0.0; // centro atrás da câmera: a reta passa perto, mas o raio não volta
  col *= 1.0 - cover;

  // O shader trabalha em cor linear (HDR). Aqui só converte para o espaço de
  // cor da tela; o tone mapping fica para o pós-processamento.
  fragColor = linearToOutputTexel(vec4(col, 1.0));
}
