// ---------------------------------------------------------------------------
// Traçado dos raios
//
// A posição x é tratada como um ponto num espaço euclidiano auxiliar, com
// |x| = r (a coordenada radial de Schwarzschild). O parâmetro da integração
// não é o tempo: só o formato da órbita e a direção final importam.
// ---------------------------------------------------------------------------

// Direção do pixel uv (de -1 a 1) no referencial da câmera.
vec3 rayDirection(vec2 uv) {
  float t = tan(uFov * 0.5);
  return normalize(mat3(uCamMatrix) * vec3(uv.x * t * uAspect, uv.y * t, -1.0));
}

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
