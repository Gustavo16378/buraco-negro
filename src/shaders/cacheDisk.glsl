// ---------------------------------------------------------------------------
// Disco a partir da cache do traçado (renderizador com cache): o que a
// pintura (paint.frag.glsl) e a fonte do bloom (bloomSource.frag.glsl)
// desenham em cima dos cruzamentos que o traçado gravou.
// ---------------------------------------------------------------------------

// Maior variação de coordenada do campo do gás aceita de um pixel para o
// vizinho (em fração da textura). Na borda de um cruzamento o vizinho cai em
// outro lugar do disco (ou fora dele) e a diferença não quer dizer nada: sem
// o limite, o filtro borraria o gás inteiro naquele pixel.
const float GAS_MAX_GRAD = 1.0 / 64.0;

// Coordenadas, no campo de cada cópia (xy: cópia 0, zw: cópia 1), do ponto
// (r, φ) do disco, já girado de Ω · idade (a mesma conta de diskGas, em
// disk.glsl). r vem limitado ao disco para não dar infinito (Ω em r = 0)
// quando não há cruzamento: esses valores só entram nas diferenças entre
// vizinhos, e um infinito ali viraria NaN.
vec4 gasCoords(float r, float phi) {
  GasCopies c = gasCopies();
  float rs = max(r, uDiskIn);
  float omega = keplerOmega(rs);
  float u = gasU(rs);
  return vec4(u, (phi - omega * c.age0 * FLOW_PERIOD) / (2.0 * PI), u, (phi - omega * c.age1 * FLOW_PERIOD) / (2.0 * PI));
}

// Diferença de coordenadas até o vizinho, pronta para o filtro: o ângulo dá a
// volta (uma diferença perto de 1 é, na verdade, quase 0) e tudo fica
// limitado a GAS_MAX_GRAD.
vec4 gasGrad(vec4 d) {
  d.yw -= floor(d.yw + 0.5);
  return clamp(d, -GAS_MAX_GRAD, GAS_MAX_GRAD);
}

// Quanto gás há agora no ponto do disco, de 0 a 1, com o ruído de cada cópia
// lido do campo guardado (gas.frag.glsl). O filtro da textura (mipmap e
// anisotrópico) faz a média do ruído na área que o pixel cobre no disco: visto
// quase de lado, um pixel cobre ~0,2 r_s na direção radial, onde o ruído muda
// a cada ~1/40 r_s, e ler um ponto só dava um chuvisco.
// Aproximação: o ruído vem de uma grade de 1024 × 512 amostras (r × ângulo),
// em vez de calculado no ponto exato. A oitava mais fina do fbm (peso de 7%)
// fica com cerca de 2 amostras por ciclo na direção radial e sai suavizada.
float cachedGas(vec4 uv, vec4 dx, vec4 dy) {
  float n0 = textureGrad(uGas0, uv.xy, dx.xy, dy.xy).r;
  float n1 = textureGrad(uGas1, uv.zw, dx.zw, dy.zw).r;
  return gasBlend(n0, n1, gasCopies());
}

// Luz do disco no texel da cache e o fator do gás de cada cruzamento
// (gasFactor; 0,9, o do gás médio, quando não há cruzamento), que a
// suavização da imagem parada aplica às outras amostras do pixel.
struct DiskLight {
  vec3 color;
  float gas1;
  float gas2;
};

// Luz do disco (linear, HDR) no texel da cache: os dois cruzamentos da frente
// para trás, o 1º cobrindo o 2º conforme a opacidade dele, com o desvio de
// frequência do modo atual. Usa derivadas de tela (o filtro do gás): só pode
// ser chamada fora de if e de laço.
DiskLight cachedDiskLight(vec4 first, vec4 second) {
  vec4 uv1 = gasCoords(first.x, first.y);
  vec4 uv2 = gasCoords(second.x, second.y);
  vec4 dx1 = gasGrad(dFdx(uv1)), dy1 = gasGrad(dFdy(uv1));
  vec4 dx2 = gasGrad(dFdx(uv2)), dy2 = gasGrad(dFdy(uv2));

  DiskLight d = DiskLight(vec3(0.0), gasFactor(0.5), gasFactor(0.5));
  float front = 0.0;
  if (first.x > 0.0) {
    front = diskAlpha(first.x);
    d.gas1 = gasFactor(cachedGas(uv1, dx1, dy1));
    d.color += front * diskEmissionStatic(first.x, mix(1.0, first.z, uRealismo)) * d.gas1;
  }
  if (second.x > 0.0) {
    float a = diskAlpha(second.x);
    d.gas2 = gasFactor(cachedGas(uv2, dx2, dy2));
    d.color += (1.0 - front) * a * diskEmissionStatic(second.x, mix(1.0, second.z, uRealismo)) * d.gas2;
  }
  return d;
}

vec3 cachedDisk(vec4 first, vec4 second) {
  return cachedDiskLight(first, second).color;
}
