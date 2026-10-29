export const pt = {
  locale: 'pt-BR',
  title: 'Buraco negro em tempo real',
  mode: {
    label: 'Modo de visualização',
    interstellar: 'Interstellar',
    real: 'Física real',
  },
  language: {
    label: 'Idioma',
    pt: 'Português',
    en: 'English',
  },
  debug: {
    title: 'debug',
    fps: 'fps',
    dpr: 'dpr',
    steps: 'passos',
    distance: 'distância',
    shadowMeasured: 'sombra medida',
    shadowExpected: 'sombra esperada',
    difference: 'diferença',
    withinLimit: 'dentro do limite de 2%',
    aboveLimit: 'acima do limite de 2%',
  },
}

/** Estrutura dos textos: o inglês tem que ter exatamente as mesmas chaves. */
export type Dict = typeof pt
