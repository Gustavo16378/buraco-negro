// Buraco negro de Schwarzschild (sem rotação), unidades geométricas com
// r_s = 1. Este arquivo abre todos os shaders do buraco negro: uniforms,
// constantes e o ruído. Os outros pedaços (raytrace, sky, disk) e um main
// (legacy, trace, paint, gas) são concatenados depois dele em
// src/scene/shaderSource.ts.
//
// ESCAPE_R, DT_FACTOR, MIN_DT, MAX_DT, MAX_LOOP_STEPS, OPACITY_STOP,
// DISK_FADE_IN, DISK_FADE_OUT, T_PROFILE_PEAK e FLOW_PERIOD chegam como
// #define, vindos de
// src/physics/constants.ts: são as mesmas que o integrador na CPU usa.

uniform vec3 uCamPos;    // posição da câmera, em r_s
uniform mat4 uCamMatrix; // matrixWorld da câmera
uniform float uFov;      // campo de visão vertical, em radianos
uniform float uAspect;   // largura / altura
uniform int uMaxSteps;   // limite de passos da integração por raio
uniform float uDebug;    // 1 com ?debug na URL: alfa 0 nos pixels da sombra, para medir
uniform float uDiskIn;   // raio interno do disco (ISCO = 3)
uniform float uDiskOut;  // raio externo do disco
uniform float uTemp;     // temperatura de pico do disco, em kelvin
uniform float uTime;     // tempo da simulação, em unidades de r_s / c
uniform float uRealismo; // 0 = modo Interstellar (sem desvio de frequência), 1 = Física real
uniform float uProbe;    // ?debug: 1 na verificação da sonda de raio, 2 no autoteste do céu
uniform vec2 uProbeUv;   // pixel da sonda, em coordenadas de tela de -1 a 1 (como vUv)
uniform uvec3 uSelfTestHash; // entrada fixa do hash no autoteste (a mesma da CPU)
uniform vec3 uSelfTestPoint; // ponto fixo do ruído no autoteste (o mesmo da CPU)

// Renderizador com cache: o que o traçado gravou (ver trace.frag.glsl) e a
// proporção entre o tamanho da cache e o da tela em que a pintura desenha.
uniform sampler2D uCacheSky;
uniform sampler2D uCacheFirst;
uniform sampler2D uCacheSecond;
uniform vec2 uCacheScale;
// Campos de ruído do gás das duas cópias, numa grade polar (ver gas.frag.glsl),
// e a semente do campo que a passada do gás está calculando.
uniform sampler2D uGas0;
uniform sampler2D uGas1;
uniform float uGasSeed;
// Em movimento: 1 quando a pintura só amplia uLowColor (a pintura feita na
// resolução da cache) para a tela; uPaintSize é o tamanho do destino.
uniform float uUpsample;
uniform sampler2D uLowColor;
uniform vec2 uPaintSize;
// Pós-processamento do renderizador com cache (bloom.ts): uFinal = 1 na
// passada que desenha na tela (soma o bloom e aplica o tone mapping).
uniform float uFinal;
uniform sampler2D uBloom;
uniform float uBloomIntensity;
uniform float uBloomThreshold;
uniform float uBloomSmoothing;
// Suavização da imagem parada (BlackHoleCached.tsx): uAccumulate = 1 nas
// passadas extras do traçado, com o raio deslocado de uJitter dentro do pixel
// (em coordenadas de tela, -1 a 1); uAcc0 a uAcc3 guardam a soma delas, que a
// pintura usa quando uAccOn = 1.
uniform float uAccumulate;
uniform vec2 uJitter;
uniform sampler2D uAcc0;
uniform sampler2D uAcc1;
uniform sampler2D uAcc2;
uniform sampler2D uAcc3;
uniform float uAccOn;
// Sempre 0. Com LOOPED_SKY (?lacos na URL), é somado ao limite dos laços do
// céu e do fbm, para o compilador não conseguir prever quantas voltas eles
// dão. O compilador de shaders do Direct3D, que o Chrome usa no Windows,
// desenrola todo laço de limite constante e copia o corpo de cada função em
// cada chamada: com as 6 camadas de estrelas e os fbm do céu, o traçado
// levava ~4 s para compilar na primeira visita (e o ANGLE compila duas vezes,
// veja BlackHoleCached.tsx). Com os laços de verdade, ~1,6 s, e o resultado
// não muda no desktop. Mas num Android (Mali-G52) a imagem ficou preta com
// essa versão, então ela só entra com ?lacos até sabermos o motivo.
uniform int uNoUnroll;
#ifdef LOOPED_SKY
#define NO_UNROLL + uNoUnroll
#else
#define NO_UNROLL
#endif
// Pixels do traçado por pixel CSS, para o tamanho das estrelas (sky.glsl). O
// renderizador direto deixa 1: as estrelas ficam do tamanho de um pixel do
// render, como até a Etapa 5.1.
uniform float uPixelScale;

in vec2 vUv;

const float PI = 3.14159265359;
const float INV_UINT_MAX = 1.0 / 4294967295.0;

// Hash inteiro PCG3D (Jarzynski e Olano, 2020).
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

float hash31(uvec3 p) {
  return float(pcg3d(p).x) * INV_UINT_MAX;
}

// Value noise 3D em [0, 1]. O deslocamento de 4096 mantém a grade positiva
// para a conversão em uint.
float noise3(vec3 p) {
  uvec3 i = uvec3(floor(p) + 4096.0);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i),                  hash31(i + uvec3(1u, 0u, 0u)), u.x),
                 mix(hash31(i + uvec3(0u, 1u, 0u)), hash31(i + uvec3(1u, 1u, 0u)), u.x), u.y),
             mix(mix(hash31(i + uvec3(0u, 0u, 1u)), hash31(i + uvec3(1u, 0u, 1u)), u.x),
                 mix(hash31(i + uvec3(0u, 1u, 1u)), hash31(i + uvec3(1u, 1u, 1u)), u.x), u.y), u.z);
}

// Soma de oitavas de noise3, normalizada para ficar em [0, 1].
float fbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < octaves NO_UNROLL; i++) {
    sum += amp * noise3(p);
    norm += amp;
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum / norm;
}
