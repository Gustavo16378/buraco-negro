// Traçado do renderizador com cache. Roda só quando a câmera muda (o
// espaço-tempo é estático: com a câmera parada, o caminho de cada raio não
// muda). Integra o raio do pixel como o renderizador direto (legacy.frag.glsl)
// e grava o que a pintura (paint.frag.glsl) precisa para desenhar o pixel a
// cada quadro sem traçar de novo:
//   - o céu já multiplicado pelo quanto dele aparece (zero se o raio caiu);
//   - r, φ e o g calculado dos dois primeiros cruzamentos com o disco (o gás
//     gira com o tempo e o modo muda o g aplicado, então o disco é pintado
//     depois, a cada quadro);
//   - se o raio caiu no horizonte e a opacidade acumulada do disco.
// Aproximação: só os dois primeiros cruzamentos são guardados. Com o disco
// opaco no miolo, um terceiro só contribui quando os dois primeiros caem nas
// bordas semitransparentes, o que acontece perto do anel de fótons, onde o
// raio dá voltas. O céu atrás já leva em conta a opacidade de todos os
// cruzamentos. Medido contra o renderizador direto na vista inicial: diferença
// média de 0,2 em 255 níveis, e até 25 em poucos pixels junto ao anel.
// Os valores ficam em float16: r e φ com erro de até ~0,004 r_s e ~0,001 rad,
// abaixo de um pixel; a sonda confere com a CPU dentro de 0,1%.
//
// Suavização da imagem parada (uAccumulate = 1): o mesmo traçado, com o raio
// deslocado de uJitter dentro do pixel, devolve a contribuição desta amostra
// para ser somada (mistura aditiva) às das outras: o céu, que é fixo, e a
// parte fixa da luz do disco (cor e brilho pela temperatura, nos dois modos),
// sem o fator do gás, que gira com o tempo (a pintura usa o do raio central).
// É o mesmo programa nas duas funções, com 4 saídas sempre: no Windows o
// ANGLE compila o shader de novo para cada formato de saída, e um programa a
// mais custaria outra compilação de vários segundos.

layout(location = 0) out vec4 cacheSky;    // rgb: céu com o peso do que ficou na frente
layout(location = 1) out vec4 cacheFirst;  // r, φ, g calculado do 1º cruzamento (r = 0: nenhum); a: 1 se caiu
layout(location = 2) out vec4 cacheSecond; // r, φ, g calculado do 2º cruzamento; a: opacidade acumulada
layout(location = 3) out vec4 cacheExtra;  // só na suavização (veja acima); na cache, zero

void main() {
  // Autoteste do céu (?debug), como no renderizador direto.
  if (uProbe > 1.5) {
    Galaxy g = milkyWay(GAL_C);
    cacheSky = vec4(hash31(uSelfTestHash), noise3(uSelfTestPoint), fbm(uSelfTestPoint, 5),
                    dot(g.glow, vec3(0.2126, 0.7152, 0.0722)));
    cacheFirst = vec4(0.0);
    cacheSecond = vec4(0.0);
    cacheExtra = vec4(0.0);
    return;
  }

  vec3 x = uCamPos;
  vec3 v = observerToRay(rayDirection(vUv + uJitter), x);
  vec3 L = cross(x, v);
  float h2 = dot(L, L);

  float opacity = 0.0;
  vec3 first = vec3(0.0);
  vec3 second = vec3(0.0);
  int crossings = 0;

  bool captured = false;
  for (int i = 0; i < MAX_LOOP_STEPS; i++) {
    if (i >= uMaxSteps) break;                       // passos acabaram: trata como escapou
    float r = length(x);
    if (r < 1.0) { captured = true; break; }         // caiu no horizonte
    if (r > ESCAPE_R && dot(x, v) > 0.0) break;      // escapou
    vec3 prev = x;
    vec3 prevV = v;
    rk4(x, v, h2, clamp(DT_FACTOR * r, MIN_DT, MAX_DT));

    if ((prev.y > 0.0) != (x.y > 0.0)) {
      float f = prev.y / (prev.y - x.y);
      vec3 p = mix(prev, x, f);
      float rp = length(p);
      if (rp > uDiskIn && rp < uDiskOut) {
        vec3 hit = vec3(rp, atan(p.z, p.x), frequencyShift(p, rp, normalize(mix(prevV, v, f))));
        if (crossings == 0) first = hit;
        else if (crossings == 1) second = hit;
        crossings++;
        opacity += (1.0 - opacity) * diskAlpha(rp);
        // Como no renderizador direto: o que está atrás já não aparece, e no
        // modo de depuração o raio segue para medir a sombra inteira.
        if (opacity > OPACITY_STOP && uDebug < 0.5) break;
      }
    }
  }
  if (length(x) < 1.0) captured = true;

  // O céu usa derivadas de tela: chamado para todo pixel, fora de if e de laço.
  vec3 dir = normalize(v);
  float skyWeight = captured ? 0.0 : 1.0 - opacity;
  vec3 background = sky(dir, pixelFootprint(dir), skyWeight);
  vec3 skyColor = vec3(0.0);
  if (!captured) skyColor = skyWeight * background; // multiplicar não apagaria um NaN

  if (uAccumulate > 0.5) {
    // Parte fixa da luz do disco desta amostra, da frente para trás como na
    // pintura, com g = 1 (Interstellar) e com o g calculado (Física real).
    float a1 = first.x > 0.0 ? diskAlpha(first.x) : 0.0;
    float a2 = second.x > 0.0 ? (1.0 - a1) * diskAlpha(second.x) : 0.0;
    vec3 s1i = vec3(0.0), s1r = vec3(0.0), s2i = vec3(0.0), s2r = vec3(0.0);
    if (first.x > 0.0) {
      s1i = a1 * diskEmissionStatic(first.x, 1.0);
      s1r = a1 * diskEmissionStatic(first.x, first.z);
    }
    if (second.x > 0.0) {
      s2i = a2 * diskEmissionStatic(second.x, 1.0);
      s2r = a2 * diskEmissionStatic(second.x, second.z);
    }
    cacheSky = vec4(skyColor, 1.0); // a: conta as amostras somadas
    cacheFirst = vec4(s1i, s2i.r);
    cacheSecond = vec4(s1r, s2i.g);
    cacheExtra = vec4(s2r, s2i.b);
    return;
  }

  cacheSky = vec4(skyColor, 1.0);
  cacheFirst = vec4(first, captured ? 1.0 : 0.0);
  cacheSecond = vec4(second, opacity);
  cacheExtra = vec4(0.0);
}
