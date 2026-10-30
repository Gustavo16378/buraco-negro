// Pintura do renderizador com cache. Roda a cada quadro, em cima do que o
// traçado gravou (trace.frag.glsl): desenha o gás girando nos cruzamentos com
// o disco, aplica o desvio de frequência do modo atual e soma o céu já pronto.
// Não integra raio nenhum, por isso é barata.

out vec4 fragColor;

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
    disk += front * diskEmission(first.x, diskGas(first.x, first.y), mix(1.0, first.z, uRealismo));
  }
  if (second.x > 0.0) {
    float a = diskAlpha(second.x);
    disk += (1.0 - front) * a * diskEmission(second.x, diskGas(second.x, second.y), mix(1.0, second.z, uRealismo));
  }
  vec3 col = disk + skyRec.rgb;

  // No modo de depuração a sombra sai com alfa 0, como no renderizador direto.
  bool captured = first.w > 0.5;
  float alpha = (uDebug > 0.5 && captured) ? 0.0 : 1.0;
  fragColor = linearToOutputTexel(vec4(col, alpha));
}
