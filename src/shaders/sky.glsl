// ---------------------------------------------------------------------------
// Céu procedural
//
// Tudo aqui é função só da direção `d` do raio (o tamanho do pixel entra só
// para suavizar). Girar a câmera não faz nada "nadar", e a lente gravitacional
// entorta o céu inteiro só mudando a direção final do raio.
// ---------------------------------------------------------------------------

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
// referência" (o tamanho angular de um pixel CSS no centro da tela; veja
// pixelFootprint), para as estrelas terem o mesmo tamanho na tela em qualquer
// resolução do traçado.
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
  float ref;  // tamanho angular do pixel de referência no centro da tela
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
  // Pixel do traçado no centro da tela, vezes quantos pixels do traçado cabem
  // num pixel CSS (uPixelScale): as estrelas ficam do mesmo tamanho na tela
  // com qualquer dpr e também na cache em movimento, que é menor.
  p.ref = tan(uFov * 0.5) * abs(dFdy(vUv.y)) * uPixelScale;
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
  for (int j = -1; j <= 1 + uNoUnroll; j++) {
    for (int i = -1; i <= 1 + uNoUnroll; i++) {
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

  // As camadas vão num laço (com uNoUnroll), e não em 6 chamadas seguidas,
  // para o compilador gerar uma cópia só de starLayer.
  Stars layers[6] = Stars[6](
    Stars(300.0, grain,  2.0, vec2(0.04, 0.16), vec2(0.70, 0.70), vec2(0.0),       4u),
    Stars(160.0, inBand, 3.0, vec2(0.30, 0.80), vec2(0.70, 0.90), vec2(0.0),       0u),
    Stars(120.0, small,  2.0, vec2(0.22, 0.35), vec2(0.70, 0.75), vec2(0.0),       5u),
    Stars( 70.0, medium, 3.0, vec2(0.30, 0.90), vec2(0.70, 1.00), vec2(0.0),       1u),
    Stars( 24.0, large,  4.0, vec2(0.80, 1.60), vec2(1.00, 1.50), vec2(0.04, 3.5), 2u),
    Stars(  8.0, huge,   2.0, vec2(1.60, 2.60), vec2(1.40, 2.00), vec2(0.10, 5.5), 3u));
  // Só o grão da faixa leva a cor da Via Láctea.
  vec3 tints[6] = vec3[6](g.tint, vec3(1.0), vec3(1.0), vec3(1.0), vec3(1.0), vec3(1.0));
  for (int l = 0; l < 6 + uNoUnroll; l++) col += tints[l] * starLayer(d, P, layers[l]);

  return col;
}
