import { useEffect, useRef } from 'react'
import { PerspectiveCamera, WebGLRenderer } from 'three'
import type { SceneInput } from '../contracts/interfaces'
import { createPitchScene } from './pitch-scene'

export default function Scene3D({ diagram, onUnavailable }: {
  diagram: SceneInput['diagram'] | null
  onUnavailable: (message: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<((diagram: SceneInput['diagram'] | null) => void) | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // Each effect owns its canvas so StrictMode never reuses a deliberately lost context.
    const canvas = document.createElement('canvas')
    canvas.className = 'scene-canvas'
    canvas.dataset.testid = 'three-pitch'
    canvas.setAttribute('aria-hidden', 'true')
    host.append(canvas)
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    } catch (error) {
      canvas.remove()
      console.error('VarAI could not initialise the 3D pitch.', error)
      onUnavailable('3D rendering could not start. Showing the supplied 2D diagram instead.')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x0b141f)
    const world = createPitchScene()
    const camera = new PerspectiveCamera(38, 1, 0.1, 500)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reveal = reducedMotion.matches ? 1 : 0
    let frame = 0
    let disposed = false
    const started = performance.now()

    function draw() {
      if (disposed) return
      const scale = Math.max(1, 1.5 / camera.aspect)
      const remaining = (1 - reveal) ** 3
      camera.position.set(-12 * remaining, (98 + 18 * remaining) * scale, (88 + 10 * remaining) * scale)
      camera.lookAt(0, 0, 0)
      renderer.render(world.scene, camera)
      canvas.dataset.rendered = 'true'
      canvas.dataset.cameraMotion = reveal < 1 ? 'revealing' : 'settled'
    }
    function resize() {
      const { width, height } = canvas.getBoundingClientRect()
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      draw()
    }
    function animate(now: number) {
      reveal = Math.min((now - started) / 900, 1)
      draw()
      if (reveal < 1) frame = requestAnimationFrame(animate)
    }
    function settle() {
      cancelAnimationFrame(frame)
      reveal = 1
      draw()
    }
    function contextLost(event: Event) {
      event.preventDefault()
      console.error('VarAI lost the 3D pitch rendering context.')
      onUnavailable('The 3D rendering context was lost. Showing the supplied 2D diagram instead. Reload to try 3D again.')
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    canvas.addEventListener('webglcontextlost', contextLost)
    reducedMotion.addEventListener('change', settle)
    updateRef.current = next => { world.updateDiagram(next); draw() }
    resize()
    if (reveal < 1) frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', contextLost)
      reducedMotion.removeEventListener('change', settle)
      updateRef.current = null
      world.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [onUnavailable])

  useEffect(() => { updateRef.current?.(diagram) }, [diagram])

  return <div ref={hostRef} className="scene-canvas-host" aria-hidden="true" />
}
