// Etapa 0: ainda sem física. Monta o raio de cada pixel a partir da câmera
// e pinta pela direção dele, para conferir que a câmera chega certa ao shader.

uniform vec3 uCamPos;    // posição da câmera, em r_s
uniform mat4 uCamMatrix; // matrixWorld da câmera
uniform float uFov;      // campo de visão vertical, em radianos
uniform float uAspect;   // largura / altura

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.14159265359;

vec3 rayDirection(vec2 uv) {
  float t = tan(uFov * 0.5);
  return normalize(mat3(uCamMatrix) * vec3(uv.x * t * uAspect, uv.y * t, -1.0));
}

// 1 sobre a linha mais próxima de um múltiplo de `spacing`, 0 longe dela.
// A largura usa fwidth para ficar com ~1 pixel em qualquer zoom.
float gridLine(float coord, float spacing) {
  float d = abs(fract(coord / spacing + 0.5) - 0.5) * spacing;
  return 1.0 - smoothstep(0.0, 1.5 * fwidth(coord), d);
}

void main() {
  vec3 dir = rayDirection(vUv);

  // Gradiente: cada eixo do mundo vira um canal de cor (x vermelho, y verde, z azul).
  vec3 col = (0.5 + 0.5 * dir) * 0.55;

  // Grade de latitude e longitude a cada 15°, com o equador (plano do futuro disco) mais forte.
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float spacing = radians(15.0);
  float grid = max(gridLine(lat, spacing), gridLine(lon, spacing));
  float equator = gridLine(lat, PI);
  col = mix(col, vec3(1.0), 0.25 * grid + 0.5 * equator);

  // Contorno na direção da origem com o tamanho angular de uma esfera de raio 1.
  // Serve só para conferir uCamPos: fica no centro ao orbitar e cresce ao aproximar.
  float camDist = length(uCamPos);
  float angle = acos(clamp(dot(dir, -uCamPos / camDist), -1.0, 1.0));
  float ring = 1.0 - smoothstep(0.0, 1.5 * fwidth(angle), abs(angle - asin(1.0 / camDist)));
  col = mix(col, vec3(0.0), ring);

  fragColor = vec4(col, 1.0);
}
