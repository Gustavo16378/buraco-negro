// Renderizador direto (?legacy): cada pixel traça o raio e pinta o resultado
// no mesmo quadro, a cada quadro. É o renderizador até a Etapa 5.1; fica
// acessível para comparar com o renderizador com cache.

out vec4 fragColor;

void main() {
  // Autoteste do céu (?debug): o hash, o ruído e o fbm em entradas fixas,
  // para comparar com a mesma conta feita na CPU, e o brilho da Via Láctea no
  // centro galáctico (zero aqui quer dizer que a faixa some na tela).
  if (uProbe > 1.5) {
    Galaxy g = milkyWay(GAL_C);
    fragColor = vec4(hash31(uSelfTestHash), noise3(uSelfTestPoint), fbm(uSelfTestPoint, 5),
                     dot(g.glow, vec3(0.2126, 0.7152, 0.0722)));
    return;
  }

  // Na passada de verificação da sonda, o pixel calculado é o da sonda.
  vec2 uv = uProbe > 0.5 ? uProbeUv : vUv;
  vec3 x = uCamPos;
  vec3 v = observerToRay(rayDirection(uv), x);
  vec3 L = cross(x, v);
  float h2 = dot(L, L);

  // Luz do disco acumulada da frente para trás (o raio vai da câmera para a
  // cena) e opacidade acumulada.
  vec3 disk = vec3(0.0);
  float opacity = 0.0;
  // r e g do primeiro cruzamento com o disco (para a sonda).
  float firstR = 0.0;
  float firstG = 0.0;

  bool captured = false;
  for (int i = 0; i < MAX_LOOP_STEPS; i++) {
    if (i >= uMaxSteps) break;                       // passos acabaram: trata como escapou
    float r = length(x);
    if (r < 1.0) { captured = true; break; }         // caiu no horizonte
    if (r > ESCAPE_R && dot(x, v) > 0.0) break;      // escapou
    vec3 prev = x;
    vec3 prevV = v;
    // Passo adaptativo: menor perto do buraco, onde a curvatura é forte.
    rk4(x, v, h2, clamp(DT_FACTOR * r, MIN_DT, MAX_DT));

    // Cruzou o plano do disco? O raio pode cruzar várias vezes: é isso que
    // mostra a parte de trás do disco por cima e por baixo da sombra, e as
    // imagens secundárias perto do anel de fótons.
    if ((prev.y > 0.0) != (x.y > 0.0)) {
      // Ponto e direção no cruzamento por interpolação linear entre as duas
      // pontas do passo (aproximação: o trecho é tratado como reto).
      float f = prev.y / (prev.y - x.y);
      vec3 p = mix(prev, x, f);
      float rp = length(p);
      if (rp > uDiskIn && rp < uDiskOut) {
        float g;
        vec4 s = diskSample(p, rp, normalize(mix(prevV, v, f)), g);
        if (firstR == 0.0) {
          firstR = rp;
          firstG = g;
        }
        disk += (1.0 - opacity) * s.a * s.rgb;
        opacity += (1.0 - opacity) * s.a;
        // O que está atrás já não aparece. No modo de depuração o raio segue
        // mesmo assim, para saber se ele cai no horizonte e medir a sombra
        // inteira, inclusive a parte escondida atrás do disco.
        if (opacity > OPACITY_STOP && uDebug < 0.5) break;
      }
    }
  }
  if (length(x) < 1.0) captured = true;

  // Passada de verificação da sonda (?debug): em vez de cor, devolve o
  // destino (0 céu, 1 horizonte, 2 disco, com a mesma regra da CPU), o r e o
  // g do primeiro cruzamento com o disco e a opacidade acumulada. uProbe é
  // igual em todos os pixels, então sair aqui não quebra as derivadas do céu.
  if (uProbe > 0.5) {
    float destination = opacity > OPACITY_STOP ? 2.0 : (captured ? 1.0 : 0.0);
    fragColor = vec4(destination, firstR, firstG, opacity);
    return;
  }

  // O céu usa derivadas de tela, que só valem em fluxo uniforme: por isso ele
  // é chamado para todo pixel, depois do laço e fora de qualquer if, mesmo nos
  // que caíram no buraco ou pararam no disco (nesses, ele pula a parte cara).
  vec3 dir = normalize(v);
  float skyWeight = captured ? 0.0 : 1.0 - opacity;
  vec3 background = sky(dir, pixelFootprint(dir), skyWeight);
  // Num raio que caiu, a direção final não tem significado e o céu pode sair
  // inválido (NaN); multiplicar por zero não apaga um NaN, e o desfoque do
  // bloom espalharia esse valor pela tela inteira. Por isso o descarte é com if.
  vec3 col = disk;
  if (!captured) col += skyWeight * background;

  // No modo de depuração a sombra sai com alfa 0 (a página é preta, então não
  // muda nada na tela): é assim que o JS mede o raio dela com readPixels.
  float alpha = (uDebug > 0.5 && captured) ? 0.0 : 1.0;

  // O shader trabalha em cor linear (HDR). Aqui só converte para o espaço de
  // cor da tela; o tone mapping fica para o pós-processamento.
  fragColor = linearToOutputTexel(vec4(col, alpha));
}
