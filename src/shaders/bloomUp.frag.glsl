// Bloom (bloom.ts), ampliação: o nível de baixo, ampliado com um filtro
// tenda de 9 amostras, misturado ao nível de mesma resolução da redução
// conforme o raio, como no MipmapBlurPass do postprocessing.

uniform sampler2D uInput;   // nível de baixo (menor), já ampliado até ali
uniform sampler2D uSupport; // nível desta resolução, da redução
uniform vec2 uTexel;        // tamanho de um texel de uInput
uniform float uRadius;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  vec4 c = texture(uInput, uv) * 0.25;
  c += (texture(uInput, uv + uTexel * vec2(-1.0, 1.0)) + texture(uInput, uv + uTexel * vec2(1.0, 1.0))
      + texture(uInput, uv + uTexel * vec2(-1.0, -1.0)) + texture(uInput, uv + uTexel * vec2(1.0, -1.0))) * 0.0625;
  c += (texture(uInput, uv + uTexel * vec2(0.0, 1.0)) + texture(uInput, uv + uTexel * vec2(-1.0, 0.0))
      + texture(uInput, uv + uTexel * vec2(1.0, 0.0)) + texture(uInput, uv + uTexel * vec2(0.0, -1.0))) * 0.125;
  fragColor = mix(texture(uSupport, uv), c, uRadius);
}
