import * as THREE from 'three'

// Copies of a model share geometry and material, so every (geometry,
// material) pair among `models` can be drawn as one InstancedMesh. The
// models are removed from `group` and the instanced meshes added instead.
// Only for things that never move again.
export function instanceStatic(group, models) {
  group.updateMatrixWorld(true)
  const buckets = new Map()

  for (const model of models) {
    model.traverse(child => {
      if (!child.isMesh) return
      const key = `${child.geometry.uuid}:${child.material.uuid}`
      if (!buckets.has(key)) buckets.set(key, { geometry: child.geometry, material: child.material, matrices: [] })
      // Relative to the group, which is where the instanced mesh will live
      buckets.get(key).matrices.push(child.matrixWorld.clone().premultiply(group.matrixWorld.clone().invert()))
    })
    group.remove(model)
  }

  for (const { geometry, material, matrices } of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length)
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.computeBoundingSphere()
    group.add(mesh)
  }
}

const scratch = new THREE.Matrix4()

// The same idea for things that move: each registered object (positioned by
// physics, never added to the scene) drives its instances every frame.
export class DynamicInstances {
  constructor(scene) {
    this.scene = scene
    this.entries = []
    this.buckets = new Map()
  }

  // `object` moves; `model` hangs under it with the meshes to draw
  register(object, model) {
    object.updateMatrixWorld(true)
    const inverse = object.matrixWorld.clone().invert()
    model.traverse(child => {
      if (!child.isMesh) return
      const key = `${child.geometry.uuid}:${child.material.uuid}`
      if (!this.buckets.has(key)) this.buckets.set(key, { geometry: child.geometry, material: child.material, items: [] })
      // Where the mesh sits relative to the moving object
      this.buckets.get(key).items.push({ object, local: child.matrixWorld.clone().premultiply(inverse) })
    })
  }

  build() {
    for (const bucket of this.buckets.values()) {
      bucket.mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.items.length)
      bucket.mesh.castShadow = true
      bucket.mesh.receiveShadow = true
      bucket.mesh.frustumCulled = false
      this.scene.add(bucket.mesh)
    }
    this.update()
  }

  update() {
    for (const { mesh, items } of this.buckets.values()) {
      if (!mesh) continue
      items.forEach(({ object, local }, index) => {
        object.updateMatrix()
        mesh.setMatrixAt(index, scratch.multiplyMatrices(object.matrix, local))
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}
