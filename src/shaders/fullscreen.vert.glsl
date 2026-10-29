// Quad de tela cheia. Os vértices do plano 2x2 já estão em clip space,
// então as matrizes da câmera do three são ignoradas aqui: quem monta o raio
// de cada pixel é o fragment shader, com os uniforms da câmera.

out vec2 vUv; // posição do pixel na tela, de -1 a 1 nos dois eixos

void main() {
  vUv = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
