// Gás do renderizador com cache: o campo de ruído de uma cópia do gás
// (semente uGasSeed), ainda sem a rotação, numa grade polar. A largura anda
// em r (gasRadius, em disk.glsl) e a altura no ângulo, de 0 a 2π. A pintura
// (paint.frag.glsl) lê dois desses campos, gira cada um de Ω · idade e
// mistura, que é a mesma conta de diskGas com o ruído calculado no ponto.
// Cada campo só muda quando a cópia dele reinicia (a cada FLOW_PERIOD / 2
// uma das duas), então esta passada roda pouco, e em faixas (gasFields.ts).

out vec4 fragColor;

void main() {
  vec2 uv = vUv * 0.5 + 0.5; // centro do texel i: (i + 0,5) / N, como a pintura amostra
  fragColor = vec4(diskNoise(gasRadius(uv.x), 2.0 * PI * uv.y, uGasSeed), 0.0, 0.0, 1.0);
}
