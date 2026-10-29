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
// Céu de estrelas procedurais
//
// O céu é função só da direção do raio. Girar a câmera não faz as estrelas
// "nadarem": cada estrela tem uma direção fixa no espaço.
// A esfera de direções é dividida nas 6 faces de um cubo, com coordenadas
// equiangulares (células de tamanho angular quase igual). Cada célula pode ter
// uma estrela, com posição, brilho e cor tirados de um hash da célula.
// ---------------------------------------------------------------------------

// Hash inteiro PCG3D (Jarzynski e Olano, 2020).
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

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

// Uma camada de estrelas.
//   cells:   células por aresta de cada face do cubo
//   density: chance de uma célula ter estrela
//   amp:     brilho de pico mínimo e máximo (linear, pode passar de 1)
//   sigma:   raio angular próprio da estrela, em radianos
//   pix:     tamanho angular do pixel nesta direção
//   pixRef:  tamanho angular do pixel no centro da tela
// Estrela menor que o pixel é desenhada com ~1 pixel de largura e o mesmo
// fluxo, o que evita cintilação quando a câmera gira devagar.
vec3 starLayer(vec3 d, float pix, float pixRef, float cells, float density, vec2 amp, float sigma, uint seed) {
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

      // Muitas fracas, poucas fortes.
      float a = mix(amp.x, amp.y, pow(h2.x, 4.0));
      // Leve variação de cor, de alaranjada a azulada, quase sempre perto do branco.
      vec3 tint = mix(vec3(1.0), mix(vec3(1.0, 0.8, 0.6), vec3(0.75, 0.85, 1.0), h2.y), 0.55);

      sum += tint * a * peak * exp(-dist * dist / (2.0 * s * s));
    }
  }
  return sum;
}

vec3 sky(vec3 d, float pix, float pixRef) {
  vec3 col = vec3(0.0);
  col += starLayer(d, pix, pixRef, 200.0, 0.70, vec2(0.012, 0.10), 0.0002, 0u); // fundo denso e quase apagado
  col += starLayer(d, pix, pixRef, 70.0,  0.40, vec2(0.06, 0.60),  0.0003, 1u); // intermediárias
  col += starLayer(d, pix, pixRef, 24.0,  0.35, vec2(0.50, 5.00),  0.0005, 2u); // poucas e brilhantes
  return col;
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
