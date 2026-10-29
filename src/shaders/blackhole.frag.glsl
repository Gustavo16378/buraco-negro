// Buraco negro de Schwarzschild (sem rotação), unidades geométricas com
// r_s = 1. Cada pixel lança um raio da câmera para trás no tempo e integra a
// trajetória curvada pela gravidade, somando a luz do disco de acreção a cada
// vez que cruza o plano dele. Se o raio escapar, amostra o céu na direção final.

uniform vec3 uCamPos;    // posição da câmera, em r_s
uniform mat4 uCamMatrix; // matrixWorld da câmera
uniform float uFov;      // campo de visão vertical, em radianos
uniform float uAspect;   // largura / altura
uniform int uMaxSteps;   // limite de passos da integração por raio
uniform float uDebug;    // 1 com ?debug na URL: alfa 0 nos pixels da sombra, para medir
uniform float uDiskIn;   // raio interno do disco (ISCO = 3)
uniform float uDiskOut;  // raio externo do disco
uniform float uTemp;     // temperatura de pico do disco, em kelvin
uniform float uTime;     // tempo da simulação, em unidades de r_s / c
uniform float uRealismo; // 0 = modo Interstellar (sem desvio de frequência), 1 = Física real
uniform float uProbe;    // ?debug: 1 na verificação da sonda de raio, 2 no autoteste do céu
uniform vec2 uProbeUv;   // pixel da sonda, em coordenadas de tela de -1 a 1 (como vUv)
uniform uvec3 uSelfTestHash; // entrada fixa do hash no autoteste (a mesma da CPU)
uniform vec3 uSelfTestPoint; // ponto fixo do ruído no autoteste (o mesmo da CPU)

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.14159265359;
const float INV_UINT_MAX = 1.0 / 4294967295.0;

// ESCAPE_R, DT_FACTOR, MIN_DT, MAX_DT, MAX_LOOP_STEPS, OPACITY_STOP,
// DISK_FADE_IN, DISK_FADE_OUT e T_PROFILE_PEAK chegam como #define, vindos de
// src/physics/constants.ts: são as mesmas que o integrador na CPU usa.

vec3 rayDirection(vec2 uv) {
  float t = tan(uFov * 0.5);
  return normalize(mat3(uCamMatrix) * vec3(uv.x * t * uAspect, uv.y * t, -1.0));
}

// ---------------------------------------------------------------------------
// Céu procedural
//
// Tudo aqui é função só da direção `d` do raio (o tamanho do pixel entra só
// para suavizar). Girar a câmera não faz nada "nadar", e a lente gravitacional
// entorta o céu inteiro só mudando a direção final do raio.
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

struct Galaxy {
  vec3 glow;          // brilho difuso, já escurecido pela poeira
  vec3 tint;          // cor local da faixa
  float band;         // presença da faixa, 0 a 1 (concentra estrelas)
  float clouds;       // nuvens de estrelas, 0 a 1 (onde o grão é mais denso)
  float transmission; // quanto a poeira deixa passar
};

Galaxy milkyWay(vec3 d) {
  Galaxy g = Galaxy(vec3(0.0), vec3(1.0), 0.0, 0.0, 1.0);

  float lat = asin(clamp(dot(d, GAL_N), -1.0, 1.0)); // latitude galáctica
  float toCenter = acos(clamp(dot(d, GAL_C), -1.0, 1.0));
  float bulge = exp(-toCenter * toCenter / (0.35 * 0.35)); // bojo central, ~20° de raio

  // Meia largura irregular (radianos), mais grossa perto do centro galáctico.
  float width = (0.09 + 0.13 * bulge) * mix(0.7, 1.3, noise3(d * 3.0 + 5.3));
  // A 5,5 meias larguras o halo já vale ~5e-4 do pico: cortar aqui não deixa borda.
  if (abs(lat) > 5.5 * width) return g;

  g.band = exp(-lat * lat / (width * width));

  // Coordenada esticada ao longo da faixa: o ruído varia mais rápido na
  // direção perpendicular ao plano, então nuvens e poeira saem alongadas.
  vec3 q = d + GAL_N * dot(d, GAL_N) * 2.0;

  // Brilho difuso de estrelas não resolvidas, em nuvens: um núcleo e um halo
  // fraco com o dobro da largura. Parte do brilho do núcleo fica com o grão de
  // estrelas (em sky()), para a faixa não parecer fumaça. Bem abaixo de 0,8
  // (linear) no máximo, para não competir com o disco nem disparar o bloom.
  float clouds = fbm(q * 5.0 + 11.0, 5);
  g.clouds = smoothstep(0.3, 0.7, clouds);
  float halo = exp(-lat * lat / (4.0 * width * width));
  float glow = (0.075 * g.band * (0.4 + 2.4 * clouds * clouds) + 0.018 * halo * (0.3 + 1.4 * clouds)) * (1.0 + 1.5 * bulge);

  // Cor sutil: amarelada perto do centro galáctico, levemente azulada nas
  // bordas da faixa, quase branca no resto.
  float edge = smoothstep(0.6, 2.2, abs(lat) / width);
  g.tint = mix(vec3(1.0, 0.97, 0.93), vec3(1.0, 0.86, 0.62), bulge);
  g.tint = mix(g.tint, vec3(0.80, 0.88, 1.0), 0.8 * edge);

  // Faixas escuras de poeira, no meio da faixa e um pouco deslocadas do centro.
  float dustLat = (lat - 0.2 * width) / (0.5 * width);
  float dustProfile = exp(-dustLat * dustLat);
  float lanes = smoothstep(0.42, 0.58, fbm(q * 7.0 + 47.0, 5));
  g.transmission = 1.0 - 0.92 * dustProfile * lanes;

  g.glow = glow * g.tint * g.transmission;
  return g;
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

// Parâmetros de uma camada de estrelas. Os tamanhos são em "pixels de
// referência" (o tamanho angular de um pixel no centro da tela), para as
// estrelas terem o mesmo tamanho na tela em qualquer resolução.
struct Stars {
  float cells;  // células por aresta de cada face do cubo
  vec3 density; // chance de uma célula ter estrela (acima de 1 = todas têm), ver density()
  float shape;  // expoente da distribuição de brilho: maior = mais estrelas discretas
  vec2 peak;    // brilho de pico (linear) da mais discreta e da mais forte
  vec2 size;    // sigma do núcleo da mais discreta e da mais forte
  vec2 halo;    // x: pico do halo da mais forte, y: sigma do halo (x = 0: sem halo)
  uint seed;
};

// Como um pixel se relaciona com as direções do céu.
struct Pixel {
  float size; // tamanho angular do pixel nesta direção
  float ref;  // tamanho angular do pixel no centro da tela
  vec3 ux;    // dot(ux, delta): deslocamento angular `delta` convertido em pixels, eixo x
  vec3 uy;    // idem, eixo y
};

// Usa derivadas de tela: só pode ser chamada fora de if e de laço.
Pixel pixelFootprint(vec3 d) {
  vec3 ex = dFdx(d), ey = dFdy(d);
  float a = dot(ex, ex), b = dot(ex, ey), c = dot(ey, ey);
  float det = max(a * c - b * b, 1e-24);
  Pixel p;
  p.size = sqrt(max(a, c));
  p.ref = tan(uFov * 0.5) * abs(dFdy(vUv.y));
  // Base dual de (ex, ey): dot(ux, ex) = 1 e dot(ux, ey) = 0, e o contrário para uy.
  p.ux = (c * ex - b * ey) / det;
  p.uy = (a * ey - b * ex) / det;
  return p;
}

// Densidade de uma camada na direção do pixel, junto com a variação dela de
// um pixel para o vizinho (x e y). Usa derivadas de tela: só pode ser chamada
// fora de if e de laço.
vec3 density(float v) {
  return vec3(v, dFdx(v), dFdy(v));
}

// Soma das estrelas de uma camada que alcançam a direção `d`.
// Cada estrela é uma gaussiana cujo pico e largura crescem juntos com o
// brilho, então as fortes parecem maiores sem virar disco chapado. Os picos
// ficam perto de 1, e as mais fortes ganham um halo largo e fraco.
// Se a estrela ficaria menor que ~1 pixel local, ela é alargada com o mesmo
// fluxo, o que evita cintilação ao girar a câmera.
vec3 starLayer(vec3 d, Pixel P, Stars L) {
  if (L.density.x + 4.0 * (abs(L.density.y) + abs(L.density.z)) <= 0.0) return vec3(0.0);

  vec2 uv;
  int face = cubeFace(d, uv);
  vec2 cell = floor((atan(uv) * (4.0 / PI) * 0.5 + 0.5) * L.cells);
  float minSigma = 0.7 * P.size;

  vec3 sum = vec3(0.0);
  // Olha as 8 células vizinhas também, para o brilho de uma estrela perto da
  // borda da célula não ser cortado. O halo maior (~3 sigma) cabe numa célula
  // das camadas que têm halo.
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(i, j);
      if (any(lessThan(c, vec2(0.0))) || any(greaterThanEqual(c, vec2(L.cells)))) continue;

      uvec3 k = pcg3d(uvec3(uvec2(c), uint(face) + 8u * L.seed));
      vec3 h1 = vec3(k) * INV_UINT_MAX;          // xy: posição na célula, z: existe?
      vec3 h2 = vec3(pcg3d(k)) * INV_UINT_MAX;   // x: brilho, y: cor

      vec2 q = tan(((c + 0.2 + 0.6 * h1.xy) / L.cells * 2.0 - 1.0) * (PI / 4.0));
      // Células equiangulares ainda variam ~30% em área entre o centro e o canto
      // da face. A chance de existir estrela acompanha a área, para a densidade
      // ficar uniforme no céu todo.
      float q2x = q.x * q.x, q2y = q.y * q.y;
      float area = (1.0 + q2x) * (1.0 + q2y) / pow(1.0 + q2x + q2y, 1.5);

      // Densidade estimada na posição da estrela (primeira ordem, a partir do
      // valor e da variação no pixel). Assim todos os pixels de uma estrela
      // tomam a mesma decisão de mostrá-la ou não, e ela nunca sai cortada.
      vec3 delta = normalize(cubeDir(face, q)) - d;
      float dens = L.density.x + L.density.y * dot(P.ux, delta) + L.density.z * dot(P.uy, delta);
      if (h1.z > dens * area) continue;

      float r2 = dot(delta, delta); // corda ao quadrado ~ ângulo ao quadrado

      // b: 0 = mais discreta, 1 = mais forte.
      float b = pow(h2.x, L.shape);

      float sig = mix(L.size.x, L.size.y, b) * P.ref;
      float s = max(sig, minSigma);
      float star = mix(L.peak.x, L.peak.y, b) * (sig * sig) / (s * s) * exp(-r2 / (2.0 * s * s));

      float haloPeak = L.halo.x * smoothstep(0.5, 1.0, b);
      if (haloPeak > 0.0) {
        float hsig = L.halo.y * P.ref;
        float hs = max(hsig, minSigma);
        star += haloPeak * (hsig * hsig) / (hs * hs) * exp(-r2 / (2.0 * hs * hs));
      }

      sum += starColor(h2.y) * star;
    }
  }
  return sum;
}

// Usa derivadas de tela (via density): só pode ser chamada fora de if e de laço.
// `weight` é quanto do céu aparece no pixel (0 na sombra e atrás do disco
// opaco). Onde ele não aparece, os ruídos da Via Láctea são pulados e as
// densidades de estrelas viram zero, o que faz cada camada sair logo no
// começo de starLayer.
// Cuidado: nenhuma camada de estrelas pode ficar dentro de um if. As derivadas
// de density() só são usadas dentro de starLayer, e o compilador do shader
// pode mover o cálculo delas para dentro do if; ali os quatro pixels de cada
// bloco 2x2 não rodam juntos e a derivada sai inválida (NaN), que o bloom
// espalha pela tela inteira. Chamando starLayer sempre, a condição de saída
// dela consome as derivadas antes de qualquer desvio.
vec3 sky(vec3 d, Pixel P, float weight) {
  float shown = weight > 0.002 ? 1.0 : 0.0;
  Galaxy g = Galaxy(vec3(0.0), vec3(1.0), 0.0, 0.0, 1.0);
  if (shown > 0.0) g = milkyWay(d);
  vec3 col = g.glow;

  // Ruído de baixa frequência na densidade: regiões do céu mais cheias e
  // outras quase vazias (de 0,15x a 1,7x a densidade média).
  float clump = shown > 0.0 ? mix(0.15, 1.7, smoothstep(0.3, 0.7, fbm(d * 2.2 + 31.7, 2))) : 0.0;

  // A poeira esconde estrelas (reduz a chance de existirem) em vez de
  // escurecê-las. Junto com o brilho mínimo de cada camada, isso garante que
  // nenhuma estrela vire um ponto cinza quase apagado no fundo preto.
  float open = clump * g.transmission;

  // Grão da Via Láctea: muitas estrelas pequenas e fracas, mais densas nas
  // nuvens, que fazem a faixa parecer feita de estrelas. A densidade cai com
  // band², então elas somem antes de chegar ao fundo preto.
  vec3 grain = density(0.9 * g.band * g.band * mix(0.25, 1.0, g.clouds) * g.transmission);

  // Estrelas visíveis uma a uma. Do mais discreto ao mais forte: muitas
  // pequenas, poucas grandes com halo. O pico mínimo (~0,22) continua bem
  // visível no preto.
  vec3 inBand = density(0.20 * g.band * g.band * open);
  vec3 small  = density(0.14 * open);
  vec3 medium = density(min(0.36 * open * (1.0 + g.band), 0.85));
  vec3 large  = density(0.35 * open);
  vec3 huge   = density(shown * 0.25 * g.transmission);

  col += g.tint * starLayer(d, P, Stars(300.0, grain, 2.0, vec2(0.04, 0.16), vec2(0.7, 0.7), vec2(0.0), 4u));
  col += starLayer(d, P, Stars(160.0, inBand, 3.0, vec2(0.30, 0.80), vec2(0.70, 0.90), vec2(0.0),       0u));
  col += starLayer(d, P, Stars(120.0, small,  2.0, vec2(0.22, 0.35), vec2(0.70, 0.75), vec2(0.0),       5u));
  col += starLayer(d, P, Stars( 70.0, medium, 3.0, vec2(0.30, 0.90), vec2(0.70, 1.00), vec2(0.0),       1u));
  col += starLayer(d, P, Stars( 24.0, large,  4.0, vec2(0.80, 1.60), vec2(1.00, 1.50), vec2(0.04, 3.5), 2u));
  col += starLayer(d, P, Stars(  8.0, huge,   2.0, vec2(1.60, 2.60), vec2(1.40, 2.00), vec2(0.10, 5.5), 3u));

  return col;
}

// ---------------------------------------------------------------------------
// Disco de acreção
//
// Fino, no plano y = 0, entre uDiskIn e uDiskOut. Gás em órbita circular
// kepleriana, emitindo como corpo negro na temperatura local. No modo Física
// real a luz sofre os desvios de frequência Doppler e gravitacional; no modo
// Interstellar eles ficam de fora, como no filme.
// ---------------------------------------------------------------------------

// Brilho do disco na temperatura de pico (linear, HDR). Passa de 1 de
// propósito: o tone mapping do pós-processamento comprime depois.
const float DISK_EMISSION = 1.6;

// Perfil de temperatura de disco fino (SPEC): zero na borda interna e pico
// logo depois, em r = uDiskIn · 49/36 (~4,08). Dividido pelo máximo do perfil
// para o pico ficar exatamente em uTemp.
float diskTemperature(float r) {
  float x = r / uDiskIn;
  return uTemp * pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0), 0.25) / T_PROFILE_PEAK;
}

// Cor de corpo negro pela aproximação de Tanner Helland (ajuste das tabelas de
// Mitchell Charity), válida de 1000 K a 40000 K. Ela devolve a cor
// normalizada (canal mais forte = 1) já em sRGB de tela; aqui ela volta para
// linear, porque o shader trabalha em cor linear. O brilho vem à parte.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  vec3 c;
  if (t <= 66.0) {
    c.r = 255.0;
    c.g = 99.4708025861 * log(t) - 161.1195681661;
    c.b = t <= 19.0 ? 0.0 : 138.5177312231 * log(t - 10.0) - 305.0447927307;
  } else {
    c.r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    c.g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    c.b = 255.0;
  }
  return sRGBTransferEOTF(vec4(clamp(c / 255.0, 0.0, 1.0), 1.0)).rgb;
}

// Ruído do gás em coordenadas polares. O ângulo vira um círculo no espaço do
// ruído (sem emenda em ±π) e o raio vira o terceiro eixo. Frequência radial
// alta e angular baixa: as manchas saem alongadas ao longo da órbita.
float diskNoise(float r, float ang, float cycle) {
  vec3 q = vec3(1.5 * cos(ang), 1.5 * sin(ang), 5.0 * r) + cycle * vec3(37.1, 11.7, 23.3);
  return fbm(q, 4);
}

// Período (em r_s / c) em que cada cópia do ruído é reiniciada. Veja diskSample.
const float FLOW_PERIOD = 40.0;

// Fator de desvio de frequência g = ν_observado / ν_emitido da luz que sai do
// gás no ponto p e chega à câmera (SPEC, "Modo Física real").
//   Doppler relativístico: o gás em órbita se move a β = sqrt(0,5 / (r - 1))
//   (velocidade medida por um observador parado ali; 0,5 c na ISCO), na
//   direção t̂ da rotação. Com n = direção do fóton (do gás para a câmera),
//   D = 1 / (γ · (1 - β · t̂·n)).
//   Gravitacional: a luz perde energia ao subir do poço até a câmera,
//   g_grav = sqrt(1 - 1/r) / sqrt(1 - 1/r_câmera).
// Aproximação: rayDir está nas coordenadas da integração, e a velocidade do
// gás é medida no referencial local. Misturar as duas é aceitável para
// visualização (SPEC); o erro é pequeno longe do horizonte.
float frequencyShift(vec3 p, float r, vec3 rayDir) {
  float beta = sqrt(0.5 / (r - 1.0));
  float gamma = inversesqrt(1.0 - beta * beta);
  vec3 t = normalize(vec3(-p.z, 0.0, p.x));
  vec3 n = -rayDir; // o raio foi traçado da câmera para o gás; o fóton faz o caminho inverso
  float doppler = 1.0 / (gamma * (1.0 - beta * dot(t, n)));
  float grav = sqrt(1.0 - 1.0 / r) / sqrt(1.0 - 1.0 / length(uCamPos));
  return doppler * grav;
}

// Uma amostra do disco no ponto p do plano, à distância r do centro, vista
// por um raio com direção rayDir. Devolve a emissão (rgb, linear) e a
// opacidade (a); em g, o desvio de frequência aplicado.
vec4 diskSample(vec3 p, float r, vec3 rayDir, out float g) {
  // O gás gira no sentido de φ crescente com a velocidade angular kepleriana
  // Ω = sqrt(M / r³), M = 0,5. O centro gira mais rápido que a borda, então o
  // ruído se estica em faixas finas.
  // Aproximação visual: girar um único ruído para sempre esticaria as faixas
  // sem limite, até ficarem menores que um pixel e cintilarem. Por isso há
  // duas cópias do ruído, cada uma girando com Ω desde o próprio reinício a
  // cada FLOW_PERIOD, defasadas em meio período e misturadas por pesos que vão
  // a zero no reinício. A velocidade de cada faixa continua kepleriana.
  float phi = atan(p.z, p.x);
  float omega = sqrt(0.5 / (r * r * r));
  float cycle = uTime / FLOW_PERIOD;
  float age0 = fract(cycle);
  float age1 = fract(cycle + 0.5);
  float w0 = 1.0 - abs(2.0 * age0 - 1.0);
  float w1 = 1.0 - w0;
  float n0 = diskNoise(r, phi - omega * age0 * FLOW_PERIOD, floor(cycle));
  float n1 = diskNoise(r, phi - omega * age1 * FLOW_PERIOD, floor(cycle + 0.5) + 0.5);
  // Mistura que mantém o contraste (a média de dois ruídos seria mais lisa).
  float n = 0.5 + ((n0 - 0.5) * w0 + (n1 - 0.5) * w1) * inversesqrt(w0 * w0 + w1 * w1);
  float gas = smoothstep(0.3, 0.7, n);

  // Densidade caindo suavemente nas bordas interna e externa. No miolo o disco
  // é opaco, como pede o modelo de disco fino que emite como corpo negro
  // (opticamente espesso): o ruído muda só o brilho, e a transparência fica
  // nas bordas, onde a densidade cai.
  float alpha = smoothstep(uDiskIn, uDiskIn + DISK_FADE_IN, r) * (1.0 - smoothstep(uDiskOut - DISK_FADE_OUT, uDiskOut, r));

  // Desvio de frequência: no modo Interstellar g = 1 (como no filme); no
  // Física real entra o valor calculado. uRealismo anima a troca.
  g = mix(1.0, frequencyShift(p, r, rayDir), uRealismo);

  // Emissão de corpo negro na temperatura observada T_obs = g · T. O brilho é
  // proporcional a T_obs⁴ (lei de Stefan-Boltzmann), relativo ao pico, o que
  // já inclui o fator g⁴ do SPEC: (g · T)⁴ = g⁴ · T⁴.
  float tObs = g * diskTemperature(r);
  float tr = tObs / uTemp;
  vec3 emission = blackbody(tObs) * (tr * tr * tr * tr) * DISK_EMISSION * mix(0.5, 1.3, gas);

  return vec4(emission, alpha);
}

// ---------------------------------------------------------------------------
// Traçado dos raios
//
// A posição x é tratada como um ponto num espaço euclidiano auxiliar, com
// |x| = r (a coordenada radial de Schwarzschild). O parâmetro da integração
// não é o tempo: só o formato da órbita e a direção final importam.
// ---------------------------------------------------------------------------

// Aceleração do raio. Com h2 = |x × v|² constante (momento angular), essa
// forma reproduz exatamente a trajetória da luz na métrica de Schwarzschild:
// escrita em u = 1/r e no ângulo φ do plano da órbita, ela vira a equação de
// Binet para fótons, d²u/dφ² + u = 1,5 · r_s · u². É a mesma usada em
// traçadores de referência.
vec3 accel(vec3 x, float h2) {
  float r2 = dot(x, x);
  return -1.5 * h2 * x / (r2 * r2 * sqrt(r2));
}

// Um passo de Runge-Kutta de 4ª ordem sobre (x, v).
void rk4(inout vec3 x, inout vec3 v, float h2, float dt) {
  vec3 k1x = v;
  vec3 k1v = accel(x, h2);
  vec3 k2x = v + 0.5 * dt * k1v;
  vec3 k2v = accel(x + 0.5 * dt * k1x, h2);
  vec3 k3x = v + 0.5 * dt * k2v;
  vec3 k3v = accel(x + 0.5 * dt * k2x, h2);
  vec3 k4x = v + dt * k3v;
  vec3 k4v = accel(x + dt * k3x, h2);
  x += dt / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
  v += dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
}

// Converte a direção `n` que a câmera vê (referencial local de um observador
// parado na posição x) para a direção inicial do raio no espaço da integração.
// Na métrica de Schwarzschild, o observador parado mede o comprimento radial
// como dr / sqrt(1 - 1/r), e o tangencial como r·dφ. Então uma direção com
// componentes locais (radial n_r, tangencial n_t) corresponde, nas
// coordenadas, a (sqrt(1 - 1/r) · n_r, n_t). O raio sai com o parâmetro de
// impacto b = r · sen(α) / sqrt(1 - 1/r), que é a relação usada no critério
// de tamanho da sombra (SPEC 9). Sem essa conversão a sombra sairia 2,6% maior
// a 20 r_s e 8,4% maior a 6 r_s.
// Aproximação: a câmera é tratada como parada em cada posição; a aberração
// causada pelo movimento dela ao orbitar é ignorada.
vec3 observerToRay(vec3 n, vec3 x) {
  vec3 rhat = normalize(x);
  float nr = dot(n, rhat);
  return normalize(n + (sqrt(1.0 - 1.0 / length(x)) - 1.0) * nr * rhat);
}

void main() {
  // Autoteste do céu (?debug): o hash, o ruído e o fbm em entradas fixas,
  // para comparar com a mesma conta feita na CPU, e o brilho da Via Láctea no
  // centro galáctico (zero aqui quer dizer que a faixa some na tela).
  if (uProbe > 1.5) {
    Galaxy g = milkyWay(GAL_C);
    fragColor = vec4(hash31(uSelfTestHash), noise3(uSelfTestPoint), fbm(uSelfTestPoint, 5),
                     dot(g.glow, vec3(0.2126, 0.7152, 0.0722)));
    return;
  }

  // Na passada de verificação da sonda, o pixel calculado é o da sonda.
  vec2 uv = uProbe > 0.5 ? uProbeUv : vUv;
  vec3 x = uCamPos;
  vec3 v = observerToRay(rayDirection(uv), x);
  vec3 L = cross(x, v);
  float h2 = dot(L, L);

  // Luz do disco acumulada da frente para trás (o raio vai da câmera para a
  // cena) e opacidade acumulada.
  vec3 disk = vec3(0.0);
  float opacity = 0.0;
  // r e g do primeiro cruzamento com o disco (para a sonda).
  float firstR = 0.0;
  float firstG = 0.0;

  bool captured = false;
  for (int i = 0; i < MAX_LOOP_STEPS; i++) {
    if (i >= uMaxSteps) break;                       // passos acabaram: trata como escapou
    float r = length(x);
    if (r < 1.0) { captured = true; break; }         // caiu no horizonte
    if (r > ESCAPE_R && dot(x, v) > 0.0) break;      // escapou
    vec3 prev = x;
    vec3 prevV = v;
    // Passo adaptativo: menor perto do buraco, onde a curvatura é forte.
    rk4(x, v, h2, clamp(DT_FACTOR * r, MIN_DT, MAX_DT));

    // Cruzou o plano do disco? O raio pode cruzar várias vezes: é isso que
    // mostra a parte de trás do disco por cima e por baixo da sombra, e as
    // imagens secundárias perto do anel de fótons.
    if ((prev.y > 0.0) != (x.y > 0.0)) {
      // Ponto e direção no cruzamento por interpolação linear entre as duas
      // pontas do passo (aproximação: o trecho é tratado como reto).
      float f = prev.y / (prev.y - x.y);
      vec3 p = mix(prev, x, f);
      float rp = length(p);
      if (rp > uDiskIn && rp < uDiskOut) {
        float g;
        vec4 s = diskSample(p, rp, normalize(mix(prevV, v, f)), g);
        if (firstR == 0.0) {
          firstR = rp;
          firstG = g;
        }
        disk += (1.0 - opacity) * s.a * s.rgb;
        opacity += (1.0 - opacity) * s.a;
        // O que está atrás já não aparece. No modo de depuração o raio segue
        // mesmo assim, para saber se ele cai no horizonte e medir a sombra
        // inteira, inclusive a parte escondida atrás do disco.
        if (opacity > OPACITY_STOP && uDebug < 0.5) break;
      }
    }
  }
  if (length(x) < 1.0) captured = true;

  // Passada de verificação da sonda (?debug): em vez de cor, devolve o
  // destino (0 céu, 1 horizonte, 2 disco, com a mesma regra da CPU), o r e o
  // g do primeiro cruzamento com o disco e a opacidade acumulada. uProbe é
  // igual em todos os pixels, então sair aqui não quebra as derivadas do céu.
  if (uProbe > 0.5) {
    float destination = opacity > OPACITY_STOP ? 2.0 : (captured ? 1.0 : 0.0);
    fragColor = vec4(destination, firstR, firstG, opacity);
    return;
  }

  // O céu usa derivadas de tela, que só valem em fluxo uniforme: por isso ele
  // é chamado para todo pixel, depois do laço e fora de qualquer if, mesmo nos
  // que caíram no buraco ou pararam no disco (nesses, ele pula a parte cara).
  vec3 dir = normalize(v);
  float skyWeight = captured ? 0.0 : 1.0 - opacity;
  vec3 background = sky(dir, pixelFootprint(dir), skyWeight);
  // Num raio que caiu, a direção final não tem significado e o céu pode sair
  // inválido (NaN); multiplicar por zero não apaga um NaN, e o desfoque do
  // bloom espalharia esse valor pela tela inteira. Por isso o descarte é com if.
  vec3 col = disk;
  if (!captured) col += skyWeight * background;

  // No modo de depuração a sombra sai com alfa 0 (a página é preta, então não
  // muda nada na tela): é assim que o JS mede o raio dela com readPixels.
  float alpha = (uDebug > 0.5 && captured) ? 0.0 : 1.0;

  // O shader trabalha em cor linear (HDR). Aqui só converte para o espaço de
  // cor da tela; o tone mapping fica para o pós-processamento.
  fragColor = linearToOutputTexel(vec4(col, alpha));
}
