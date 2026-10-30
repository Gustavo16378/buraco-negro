import { Component, type ReactNode } from 'react'
import { useStore } from '../state/store.ts'

/**
 * Se o canvas 3D quebrar (o navegador não cria o WebGL2, por exemplo), o erro
 * para aqui em vez de desmontar a página inteira: a tela de carregamento
 * continua na frente e mostra o motivo, em vez de tudo preto.
 */
export class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    useStore.getState().setFailure(error instanceof Error ? error.message : String(error))
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
