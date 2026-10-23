import {
  AmbientLight, BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, DirectionalLight,
  Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshStandardMaterial, Scene,
  SphereGeometry, Vector3,
} from 'three'
import type { Material, Object3D } from 'three'
import type { SceneInput } from '../contracts/interfaces'

function disposeObjects(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  root.traverse(object => {
    if (object instanceof Mesh || object instanceof Line) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
}

export function createPitchScene() {
  const scene = new Scene()
  const markers = new Group()
  markers.name = 'supplied-markers'
  scene.add(new AmbientLight(0xd4e7ff, 1.8))
  const light = new DirectionalLight(0xffffff, 3)
  light.position.set(-30, 80, 45)
  scene.add(light)

  const bed = new Mesh(new BoxGeometry(112, 2, 76),
    new MeshStandardMaterial({ color: 0x1d303b, roughness: 0.75, metalness: 0.25 }))
  bed.position.y = -1.4
  scene.add(bed)
  for (let index = 0; index < 10; index++) {
    const stripe = new Mesh(new BoxGeometry(10, 0.3, 64),
      new MeshStandardMaterial({ color: index % 2 ? 0x123e32 : 0x164737, roughness: 1 }))
    stripe.position.set(-45 + index * 10, -0.15, 0)
    scene.add(stripe)
  }

  const chalk = new LineBasicMaterial({ color: 0x9cccb4, transparent: true, opacity: 0.85 })
  function line(points: readonly (readonly [number, number])[]) {
    const geometry = new BufferGeometry().setFromPoints(points.map(([x, z]) => new Vector3(x, 0.2, z)))
    scene.add(new Line(geometry, chalk))
  }
  line([[-50, -32], [50, -32], [50, 32], [-50, 32], [-50, -32]])
  line([[0, -32], [0, 32]])
  line(Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2
    return [Math.cos(angle) * 9, Math.sin(angle) * 9] as const
  }))
  for (const side of [-1, 1]) {
    line([[side * 50, -18], [side * 34, -18], [side * 34, 18], [side * 50, 18]])
    line([[side * 50, -8], [side * 44, -8], [side * 44, 8], [side * 50, 8]])
    const goal = new BufferGeometry().setFromPoints([
      new Vector3(side * 50, 0.2, -4), new Vector3(side * 54, 3, -4),
      new Vector3(side * 54, 3, 4), new Vector3(side * 50, 0.2, 4),
    ])
    scene.add(new Line(goal, chalk))
  }
  scene.add(markers)

  function updateDiagram(diagram: SceneInput['diagram'] | null) {
    disposeObjects(markers)
    markers.clear()
    if (diagram?.status !== 'ILLUSTRATIVE') return
    if (diagram.secondLastReferenceX !== null) {
      const x = diagram.secondLastReferenceX - 50
      const reference = new Line(
        new BufferGeometry().setFromPoints([new Vector3(x, 0.3, -32), new Vector3(x, 0.3, 32)]),
        new LineDashedMaterial({ color: 0xffd791, dashSize: 1.5, gapSize: 1 }),
      )
      reference.name = 'supplied-position-reference'
      reference.computeLineDistances()
      markers.add(reference)
    }
    for (const marker of diagram.markers) {
      const geometry = marker.role === 'RECEIVER' ? new ConeGeometry(1.8, 2.5, 3)
        : marker.role === 'OPPONENT' ? new BoxGeometry(2.4, 1.8, 2.4)
          : marker.role === 'BALL' ? new SphereGeometry(0.85, 16, 12)
            : new CylinderGeometry(1.4, 1.6, 1.1, 24)
      const color = marker.role === 'RECEIVER' ? 0xffd791 : marker.role === 'OPPONENT' ? 0x9ac7ff : 0xf4f7ff
      const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 }))
      mesh.name = marker.id
      // Normalised illustration coordinates, not measured pitch distances or tracking.
      mesh.position.set(marker.x - 50, 1.3, (marker.y - 50) * 0.64)
      markers.add(mesh)
    }
  }

  return { scene, markers, updateDiagram, dispose: () => disposeObjects(scene) }
}
