// Fonte do bloom do renderizador com cache (bloom.ts): só a luz do disco,
// numa resolução menor que a tela, acima do limiar de brilho. As estrelas e a
// Via Láctea ficam de fora: antes o bloom pegava a imagem inteira, e as
// estrelas mais fortes viravam bolas borradas.
// Cada pixel daqui cobre vários da tela; ele faz a média do disco em 4 pontos
// do próprio quadrado, para um detalhe fino (o anel de fótons) não piscar
// conforme cai ou não no centro do pixel.

out vec4 fragColor;

void main() {
  ivec2 size = textureSize(uCacheFirst, 0) - 1;
  vec3 sum = vec3(0.0);
  // uCacheScale: texels da cache por pixel desta passada.
  ivec2 t0 = clamp(ivec2((gl_FragCoord.xy + vec2(-0.25, -0.25)) * uCacheScale), ivec2(0), size);
  ivec2 t1 = clamp(ivec2((gl_FragCoord.xy + vec2(0.25, -0.25)) * uCacheScale), ivec2(0), size);
  ivec2 t2 = clamp(ivec2((gl_FragCoord.xy + vec2(-0.25, 0.25)) * uCacheScale), ivec2(0), size);
  ivec2 t3 = clamp(ivec2((gl_FragCoord.xy + vec2(0.25, 0.25)) * uCacheScale), ivec2(0), size);
  sum += cachedDisk(texelFetch(uCacheFirst, t0, 0), texelFetch(uCacheSecond, t0, 0));
  sum += cachedDisk(texelFetch(uCacheFirst, t1, 0), texelFetch(uCacheSecond, t1, 0));
  sum += cachedDisk(texelFetch(uCacheFirst, t2, 0), texelFetch(uCacheSecond, t2, 0));
  sum += cachedDisk(texelFetch(uCacheFirst, t3, 0), texelFetch(uCacheSecond, t3, 0));
  vec3 disk = sum * 0.25;
  // Limiar suave no brilho, como o LuminancePass do postprocessing.
  float l = dot(disk, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(disk * smoothstep(uBloomThreshold, uBloomThreshold + uBloomSmoothing, l), 1.0);
}
