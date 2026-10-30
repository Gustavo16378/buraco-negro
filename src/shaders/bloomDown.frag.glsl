// Bloom (bloom.ts), redução: cada nível tem a metade do anterior, com o
// filtro de 13 amostras do MipmapBlurPass do postprocessing (Jimenez, 2014),
// o mesmo que o renderizador direto usa.

uniform sampler2D uInput;
uniform vec2 uTexel; // tamanho de um texel de uInput, em coordenadas de textura

in vec2 vUv;
out vec4 fragColor;

// Fora da imagem a amostra não conta (em vez de repetir a borda).
float inside(vec2 uv) {
  return float(uv.s >= 0.0 && uv.s <= 1.0 && uv.t >= 0.0 && uv.t <= 1.0);
}

vec4 tap(vec2 uv, vec2 offset, float weight) {
  vec2 p = uv + uTexel * offset;
  return weight * inside(p) * texture(uInput, p);
}

void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  const float inner = 0.125;
  const float outer = 0.05556;
  vec4 c = tap(uv, vec2(-1.0, 1.0), inner) + tap(uv, vec2(1.0, 1.0), inner)
         + tap(uv, vec2(-1.0, -1.0), inner) + tap(uv, vec2(1.0, -1.0), inner)
         + tap(uv, vec2(-2.0, 2.0), outer) + tap(uv, vec2(0.0, 2.0), outer) + tap(uv, vec2(2.0, 2.0), outer)
         + tap(uv, vec2(-2.0, 0.0), outer) + tap(uv, vec2(2.0, 0.0), outer)
         + tap(uv, vec2(-2.0, -2.0), outer) + tap(uv, vec2(0.0, -2.0), outer) + tap(uv, vec2(2.0, -2.0), outer)
         + outer * texture(uInput, uv);
  fragColor = c;
}
