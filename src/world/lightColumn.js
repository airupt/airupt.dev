import * as THREE from 'three'

// A soft column of light rising from the sea, visible from far away:
// brightest at its foot, fading up into the sky and soft at the edges.
// Set material.uniforms.uStrength to show it (0 hides it).
export function createLightColumn(color, { radius = 0.5, base = 0.9, height = 16 } = {}) {
  const geometry = new THREE.CylinderGeometry(radius, base, height, 16, 1, true)
  geometry.translate(0, height / 2, 0)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying float vFacing;
      void main() {
        vHeight = uv.y;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-viewPosition.xyz)));
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vHeight;
      varying float vFacing;
      void main() {
        float glow = pow(1.0 - vHeight, 1.6) * pow(vFacing, 1.5) * uStrength;
        gl_FragColor = vec4(uColor * glow, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  return { mesh, material }
}
