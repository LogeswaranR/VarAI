import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture } from '../harness/fixtures'
import Scene3D from './Scene3D'

const lifecycle = vi.hoisted(() => ({
  canvases: [] as HTMLCanvasElement[],
  dispose: vi.fn(),
  loseContext: vi.fn(),
  fail: false,
}))

vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      if (lifecycle.fail) throw new Error('Controlled renderer failure')
      lifecycle.canvases.push(canvas)
    }
    setPixelRatio = vi.fn()
    setClearColor = vi.fn()
    setSize = vi.fn()
    render = vi.fn()
    dispose = lifecycle.dispose
    forceContextLoss = lifecycle.loseContext
  },
}))

beforeEach(() => {
  lifecycle.canvases.length = 0
  lifecycle.dispose.mockClear()
  lifecycle.loseContext.mockClear()
  lifecycle.fail = false
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
  })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 400))
})

describe('Three.js React lifecycle with a simulated renderer, not GPU evidence', () => {
  it('owns a fresh canvas per StrictMode effect and releases every renderer', () => {
    const unavailable = vi.fn()
    const { unmount } = render(<StrictMode><Scene3D diagram={fixture('S1').diagram} onUnavailable={unavailable} /></StrictMode>)
    expect(lifecycle.canvases).toHaveLength(2)
    expect(lifecycle.canvases[0]).not.toBe(lifecycle.canvases[1])
    expect(lifecycle.canvases[0]?.isConnected).toBe(false)
    expect(lifecycle.canvases[1]?.isConnected).toBe(true)
    expect(screen.getByTestId('three-pitch')).toHaveAttribute('data-camera-motion', 'settled')
    unmount()
    expect(lifecycle.dispose).toHaveBeenCalledTimes(2)
    expect(lifecycle.loseContext).toHaveBeenCalledTimes(2)
    expect(unavailable).not.toHaveBeenCalled()
  })

  it('updates supplied records without recreating the renderer', () => {
    const unavailable = vi.fn()
    const { rerender } = render(<Scene3D diagram={null} onUnavailable={unavailable} />)
    rerender(<Scene3D diagram={fixture('S2').diagram} onUnavailable={unavailable} />)
    rerender(<Scene3D diagram={null} onUnavailable={unavailable} />)
    expect(lifecycle.canvases).toHaveLength(1)
    expect(screen.getByTestId('three-pitch')).toHaveAttribute('data-rendered', 'true')
  })

  it('reports renderer initialisation failure and removes the unusable canvas', () => {
    lifecycle.fail = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unavailable = vi.fn()
    const { container } = render(<Scene3D diagram={null} onUnavailable={unavailable} />)
    expect(unavailable).toHaveBeenCalledWith('3D rendering could not start. Showing the supplied 2D diagram instead.')
    expect(log).toHaveBeenCalledOnce()
    expect(container.querySelector('canvas')).toBeNull()
  })
})
