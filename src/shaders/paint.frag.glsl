// Pintura do renderizador com cache. Roda a cada quadro, em cima do que o
// traçado gravou (trace.frag.glsl): desenha o gás girando nos cruzamentos com
// o disco, aplica o desvio de frequência do modo atual e soma o céu já pronto.
// Não integra raio nenhum nem calcula ruído, por isso é barata.
// Na passada final (uFinal = 1) ela também é o pós-processamento: soma o
// bloom (bloom.ts), aplica o tone mapping e escreve direto na tela, numa
// passada só em vez das três de antes.

out vec4 fragColor;

// Tone mapping ACES filmic do three (com a exposição 1 e o fator 1/0,6 que ele
// usa), o mesmo que o pós-processamento aplicava no fim da cadeia.
vec3 acesFilmic(vec3 color) {
  const mat3 inputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602));
  vec3 v = inputMat * (color / 0.6);
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outputMat * (a / b), 0.0, 1.0);
}

void main() {
  vec4 color;
  if (uUpsample > 0.5) {
    // Em movimento a cache é menor que a tela. A pintura roda antes na
    // resolução dela (numa render target à parte, com uUpsample = 0) e aqui só
    // amplia o resultado com filtro bilinear, como o navegador ampliava o
    // canvas no renderizador direto. Sem isso, cada texel da cache sairia como
    // um bloco.
    color = texture(uLowColor, gl_FragCoord.xy / uPaintSize);
  } else {
    // Pixel da cache que cobre este pixel da tela.
    ivec2 texel = ivec2(gl_FragCoord.xy * uCacheScale);
    vec4 first = texelFetch(uCacheFirst, texel, 0);
    DiskLight d = cachedDiskLight(first, texelFetch(uCacheSecond, texel, 0));
    vec3 col = d.color + texelFetch(uCacheSky, texel, 0).rgb;

    // Imagem parada suavizada: média do raio central com as amostras extras do
    // pixel (trace.frag.glsl), que dão o anel de fótons contínuo, a borda da
    // sombra lisa e as estrelas como pontos. Das extras vem a soma do céu e da
    // parte fixa da luz do disco; o gás que gira entra pelo fator do raio
    // central, de cada cruzamento.
    // Aproximações: numa amostra que cai em outra imagem do disco que a do
    // raio central (só na borda delas), o fator do gás é o do outro ponto, o
    // que só muda o brilho entre 0,5 e 1,3 vezes; e, durante os 0,8 s da troca
    // de modo, a mistura é linear entre as luzes dos dois modos, em vez de
    // ser calculada com o g intermediário.
    if (uAccOn > 0.5) {
      vec4 a0 = texelFetch(uAcc0, texel, 0);
      if (a0.a > 0.0) {
        vec4 a1 = texelFetch(uAcc1, texel, 0);
        vec4 a2 = texelFetch(uAcc2, texel, 0);
        vec4 a3 = texelFetch(uAcc3, texel, 0);
        vec3 s1 = mix(a1.rgb, a2.rgb, uRealismo);
        vec3 s2 = mix(vec3(a1.a, a2.a, a3.a), a3.rgb, uRealismo);
        col = (col + a0.rgb + d.gas1 * s1 + d.gas2 * s2) / (1.0 + a0.a);
      }
    }
    // No modo de depuração a sombra sai com alfa 0, como no renderizador direto.
    bool captured = first.w > 0.5;
    color = vec4(col, (uDebug > 0.5 && captured) ? 0.0 : 1.0);
  }

  if (uFinal > 0.5) {
    vec3 bloom = texture(uBloom, gl_FragCoord.xy / uPaintSize).rgb * uBloomIntensity;
    color.rgb = acesFilmic(color.rgb + bloom);
  }
  fragColor = linearToOutputTexel(color);
}
