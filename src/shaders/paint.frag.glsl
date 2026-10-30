// Pintura do renderizador com cache. Roda a cada quadro, em cima do que o
// traçado gravou (trace.frag.glsl): desenha o gás girando nos cruzamentos com
// o disco, aplica o desvio de frequência do modo atual e soma o céu já pronto.
// Não integra raio nenhum nem calcula ruído, por isso é barata.

out vec4 fragColor;

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

void main() {
  // Pixel da cache que cobre este pixel da tela (a cache pode ser menor).
  ivec2 texel = ivec2(gl_FragCoord.xy * uCacheScale);
  vec4 skyRec = texelFetch(uCacheSky, texel, 0);
  vec4 first = texelFetch(uCacheFirst, texel, 0);
  vec4 second = texelFetch(uCacheSecond, texel, 0);

  // Disco da frente para trás: o 1º cruzamento cobre o 2º conforme a opacidade
  // dele. O céu já veio com o peso do que ficou na frente.
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
  vec3 col = disk + skyRec.rgb;

  // No modo de depuração a sombra sai com alfa 0, como no renderizador direto.
  bool captured = first.w > 0.5;
  float alpha = (uDebug > 0.5 && captured) ? 0.0 : 1.0;
  fragColor = linearToOutputTexel(vec4(col, alpha));
}
