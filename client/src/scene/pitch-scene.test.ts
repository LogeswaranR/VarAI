import { Line, Mesh } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { fixture } from '../harness/fixtures'
import { createPitchScene } from './pitch-scene'

describe('illustrative Three.js pitch, never tracking or a calculated decision', () => {
  it('starts with no supplied markers or reference before release', () => {
    const world = createPitchScene()
    expect(world.markers.children).toHaveLength(0)
    world.updateDiagram(null)
    expect(world.markers.children).toHaveLength(0)
    world.dispose()
  })

  it.each(['S1', 'S2'] as const)('maps %s from the exact supplied normalised coordinates without mutating the record', id => {
    const diagram = fixture(id).diagram
    const before = structuredClone(diagram)
    const world = createPitchScene()
    world.updateDiagram(diagram)
    expect(world.markers.children).toHaveLength(diagram.markers.length + 1)
    for (const marker of diagram.markers) {
      const object = world.markers.getObjectByName(marker.id)
      expect(object).toBeInstanceOf(Mesh)
      expect(object?.position.x).toBe(marker.x - 50)
      expect(object?.position.z).toBe((marker.y - 50) * 0.64)
    }
    const reference = world.markers.getObjectByName('supplied-position-reference')
    expect(reference).toBeInstanceOf(Line)
    if (!(reference instanceof Line)) throw new Error('Expected a supplied positional reference.')
    expect(reference.geometry.getAttribute('position').getX(0)).toBe(diagram.secondLastReferenceX! - 50)
    expect(diagram).toEqual(before)
    world.dispose()
  })

  it('S3 and replay reset clear positions and dispose previous marker resources', () => {
    const world = createPitchScene()
    world.updateDiagram(fixture('S1').diagram)
    const marker = world.markers.children.find(child => child instanceof Mesh)
    if (!(marker instanceof Mesh)) throw new Error('Expected a supplied marker.')
    const disposeGeometry = vi.spyOn(marker.geometry, 'dispose')
    world.updateDiagram(fixture('S3').diagram)
    expect(world.markers.children).toHaveLength(0)
    expect(disposeGeometry).toHaveBeenCalledOnce()
    world.updateDiagram(fixture('S2').diagram)
    expect(world.markers.children.length).toBeGreaterThan(0)
    world.updateDiagram(null)
    expect(world.markers.children).toHaveLength(0)
    world.dispose()
  })

  it('releases pitch geometry and materials when the view is unmounted', () => {
    const world = createPitchScene()
    const mesh = world.scene.children.find(child => child instanceof Mesh)
    if (!(mesh instanceof Mesh) || Array.isArray(mesh.material)) throw new Error('Expected a pitch surface.')
    const geometry = vi.spyOn(mesh.geometry, 'dispose')
    const material = vi.spyOn(mesh.material, 'dispose')
    world.dispose()
    expect(geometry).toHaveBeenCalledOnce()
    expect(material).toHaveBeenCalledOnce()
  })
})
