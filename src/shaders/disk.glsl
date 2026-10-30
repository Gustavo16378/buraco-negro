// ---------------------------------------------------------------------------
// Disco de acreção
//
// Fino, no plano y = 0, entre uDiskIn e uDiskOut. Gás em órbita circular
// kepleriana, emitindo como corpo negro na temperatura local. No modo Física
// real a luz sofre os desvios de frequência Doppler e gravitacional; no modo
// Interstellar eles ficam de fora, como no filme.
// ---------------------------------------------------------------------------

// Brilho do disco na temperatura de pico (linear, HDR). Passa de 1 de
// propósito: o tone mapping do pós-processamento comprime depois.
const float DISK_EMISSION = 1.6;

// Perfil de temperatura de disco fino (SPEC): zero na borda interna e pico
// logo depois, em r = uDiskIn · 49/36 (~4,08). Dividido pelo máximo do perfil
// para o pico ficar exatamente em uTemp.
float diskTemperature(float r) {
  float x = r / uDiskIn;
  return uTemp * pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0), 0.25) / T_PROFILE_PEAK;
}

// Cor de corpo negro pela aproximação de Tanner Helland (ajuste das tabelas de
// Mitchell Charity), válida de 1000 K a 40000 K. Ela devolve a cor
// normalizada (canal mais forte = 1) já em sRGB de tela; aqui ela volta para
// linear, porque o shader trabalha em cor linear. O brilho vem à parte.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  vec3 c;
  if (t <= 66.0) {
    c.r = 255.0;
    c.g = 99.4708025861 * log(t) - 161.1195681661;
    c.b = t <= 19.0 ? 0.0 : 138.5177312231 * log(t - 10.0) - 305.0447927307;
  } else {
    c.r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    c.g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    c.b = 255.0;
  }
  return sRGBTransferEOTF(vec4(clamp(c / 255.0, 0.0, 1.0), 1.0)).rgb;
}

// Ruído do gás em coordenadas polares. O ângulo vira um círculo no espaço do
// ruído (sem emenda em ±π) e o raio vira o terceiro eixo. Frequência radial
// alta e angular baixa: as manchas saem alongadas ao longo da órbita.
float diskNoise(float r, float ang, float cycle) {
  vec3 q = vec3(1.5 * cos(ang), 1.5 * sin(ang), 5.0 * r) + cycle * vec3(37.1, 11.7, 23.3);
  return fbm(q, 4);
}

// Período (em r_s / c) em que cada cópia do ruído é reiniciada. Veja diskSample.
const float FLOW_PERIOD = 40.0;

// Fator de desvio de frequência g = ν_observado / ν_emitido da luz que sai do
// gás no ponto p e chega à câmera (SPEC, "Modo Física real").
//   Doppler relativístico: o gás em órbita se move a β = sqrt(0,5 / (r - 1))
//   (velocidade medida por um observador parado ali; 0,5 c na ISCO), na
//   direção t̂ da rotação. Com n = direção do fóton (do gás para a câmera),
//   D = 1 / (γ · (1 - β · t̂·n)).
//   Gravitacional: a luz perde energia ao subir do poço até a câmera,
//   g_grav = sqrt(1 - 1/r) / sqrt(1 - 1/r_câmera).
// Aproximação: rayDir está nas coordenadas da integração, e a velocidade do
// gás é medida no referencial local. Misturar as duas é aceitável para
// visualização (SPEC); o erro é pequeno longe do horizonte.
float frequencyShift(vec3 p, float r, vec3 rayDir) {
  float beta = sqrt(0.5 / (r - 1.0));
  float gamma = inversesqrt(1.0 - beta * beta);
  vec3 t = normalize(vec3(-p.z, 0.0, p.x));
  vec3 n = -rayDir; // o raio foi traçado da câmera para o gás; o fóton faz o caminho inverso
  float doppler = 1.0 / (gamma * (1.0 - beta * dot(t, n)));
  float grav = sqrt(1.0 - 1.0 / r) / sqrt(1.0 - 1.0 / length(uCamPos));
  return doppler * grav;
}

// Quanto gás há agora no ponto do disco a r do centro e no ângulo phi
// (atan(z, x)), de 0 a 1.
// O gás gira no sentido de φ crescente com a velocidade angular kepleriana
// Ω = sqrt(M / r³), M = 0,5. O centro gira mais rápido que a borda, então o
// ruído se estica em faixas finas.
// Aproximação visual: girar um único ruído para sempre esticaria as faixas
// sem limite, até ficarem menores que um pixel e cintilarem. Por isso há
// duas cópias do ruído, cada uma girando com Ω desde o próprio reinício a
// cada FLOW_PERIOD, defasadas em meio período e misturadas por pesos que vão
// a zero no reinício. A velocidade de cada faixa continua kepleriana.
float diskGas(float r, float phi) {
  float omega = sqrt(0.5 / (r * r * r));
  float cycle = uTime / FLOW_PERIOD;
  float age0 = fract(cycle);
  float age1 = fract(cycle + 0.5);
  float w0 = 1.0 - abs(2.0 * age0 - 1.0);
  float w1 = 1.0 - w0;
  float n0 = diskNoise(r, phi - omega * age0 * FLOW_PERIOD, floor(cycle));
  float n1 = diskNoise(r, phi - omega * age1 * FLOW_PERIOD, floor(cycle + 0.5) + 0.5);
  // Mistura que mantém o contraste (a média de dois ruídos seria mais lisa).
  float n = 0.5 + ((n0 - 0.5) * w0 + (n1 - 0.5) * w1) * inversesqrt(w0 * w0 + w1 * w1);
  return smoothstep(0.3, 0.7, n);
}

// Opacidade do disco a r do centro: cai suavemente nas bordas interna e
// externa. No miolo o disco é opaco, como pede o modelo de disco fino que
// emite como corpo negro (opticamente espesso): o ruído muda só o brilho, e a
// transparência fica nas bordas, onde a densidade cai.
float diskAlpha(float r) {
  return smoothstep(uDiskIn, uDiskIn + DISK_FADE_IN, r) * (1.0 - smoothstep(uDiskOut - DISK_FADE_OUT, uDiskOut, r));
}

// Emissão de corpo negro do gás a r do centro, com o desvio de frequência g
// já aplicado: temperatura observada T_obs = g · T e brilho proporcional a
// T_obs⁴ (lei de Stefan-Boltzmann), relativo ao pico, o que já inclui o
// fator g⁴ do SPEC: (g · T)⁴ = g⁴ · T⁴.
vec3 diskEmission(float r, float gas, float g) {
  float tObs = g * diskTemperature(r);
  float tr = tObs / uTemp;
  return blackbody(tObs) * (tr * tr * tr * tr) * DISK_EMISSION * mix(0.5, 1.3, gas);
}

// Uma amostra do disco no ponto p do plano, à distância r do centro, vista
// por um raio com direção rayDir. Devolve a emissão (rgb, linear) e a
// opacidade (a); em g, o desvio de frequência aplicado (no modo Interstellar
// g = 1, como no filme; no Física real entra o valor calculado, e uRealismo
// anima a troca).
vec4 diskSample(vec3 p, float r, vec3 rayDir, out float g) {
  g = mix(1.0, frequencyShift(p, r, rayDir), uRealismo);
  return vec4(diskEmission(r, diskGas(r, atan(p.z, p.x)), g), diskAlpha(r));
}
