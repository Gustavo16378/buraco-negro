// ---------------------------------------------------------------------------
// Disco a partir da cache do traçado (renderizador com cache): o que a
// pintura (paint.frag.glsl) e a fonte do bloom (bloomSource.frag.glsl)
// desenham em cima dos cruzamentos que o traçado gravou.
// ---------------------------------------------------------------------------

// Quanto gás há agora no ponto (r, φ) do disco: a mesma conta de diskGas
// (disk.glsl), com o ruído de cada cópia lido do campo guardado
// (gas.frag.glsl) no ângulo já girado de Ω · idade.
// Aproximação: o ruído vem de uma grade de 1024 × 512 amostras (r × ângulo)
// com interpolação bilinear, em vez de calculado no ponto exato. A oitava
// mais fina do fbm (peso de 7%) fica com cerca de 2 amostras por ciclo na
// direção radial e sai suavizada.
float cachedGas(float r, float phi) {
  GasCopies c = gasCopies();
  float omega = keplerOmega(r);
  float u = gasU(r);
  // textureLod: sem mipmaps o nível não importa, e assim o ruído não depende
  // de derivadas dentro do if de quem chama.
  float n0 = textureLod(uGas0, vec2(u, (phi - omega * c.age0 * FLOW_PERIOD) / (2.0 * PI)), 0.0).r;
  float n1 = textureLod(uGas1, vec2(u, (phi - omega * c.age1 * FLOW_PERIOD) / (2.0 * PI)), 0.0).r;
  return gasBlend(n0, n1, c);
}

// Luz do disco (linear, HDR) no texel da cache: os dois cruzamentos da frente
// para trás, o 1º cobrindo o 2º conforme a opacidade dele, com o desvio de
// frequência do modo atual.
vec3 cachedDisk(vec4 first, vec4 second) {
  vec3 disk = vec3(0.0);
  float front = 0.0;
  if (first.x > 0.0) {
    front = diskAlpha(first.x);
    disk += front * diskEmission(first.x, cachedGas(first.x, first.y), mix(1.0, first.z, uRealismo));
  }
  if (second.x > 0.0) {
    float a = diskAlpha(second.x);
    disk += (1.0 - front) * a * diskEmission(second.x, cachedGas(second.x, second.y), mix(1.0, second.z, uRealismo));
  }
  return disk;
}
