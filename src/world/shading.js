import * as THREE from 'three'
import { waveHeightGLSL } from './waves.js'
import { createNoiseData } from '../utils/noise.js'

function createNoiseTexture() {
  const { data, size } = createNoiseData()
  const texture = new THREE.DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

// Uniforms shared by every stylised material. Updating a value here updates
// the whole world at once (the day cycle drives most of these).
export const shared = {
  uTime: { value: 0 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uNoise: { value: createNoiseTexture() },

  // Soft shadows of clouds you never see, drifting over sea and islands
  uCloudShadow: { value: 0.45 },
  uCloudScale: { value: 0.0045 },
  uCloudSpeed: { value: new THREE.Vector2(0.0035, 0.0018) },

  uSunDirection: { value: new THREE.Vector3(-0.5, 0.75, 0.42).normalize() },
  uLightColor: { value: new THREE.Color('#fff1de') },
  uLightIntensity: { value: 1.15 },
  uShadowColor: { value: new THREE.Color('#4d57ff') },
  // N·L range over which a surface turns from shadowed (low) to lit (high)
  uCoreShadowEdges: { value: new THREE.Vector2(-0.25, 1) },

  // Light bouncing off the sea onto anything just above it
  uBounceColor: { value: new THREE.Color('#38d6e6') },
  uBounceStrength: { value: 0.4 },
  uWaterLine: { value: 0.09 },

  // Wind: two scrolling noise samples give a gusty 2D offset (see windGLSL)
  uWindDirection: { value: new THREE.Vector2(Math.sin(2.2), Math.cos(2.2)) },
  uWindStrength: { value: 0.55 },
  uWindTime: { value: 0 },

  // Fog colour is a screen-space gradient; the sky uses the very same one,
  // so the far sea dissolves into the sky without a visible horizon
  uFogColorA: { value: new THREE.Color('#bff6ff') },
  uFogColorB: { value: new THREE.Color('#8f9dff') },
  uFogCenter: { value: new THREE.Vector2(0.5, 1.15) },
  uFogRadial: { value: new THREE.Vector2(0.2, 1.3) },
  uFogNear: { value: 40 },
  uFogFar: { value: 120 },

  // Anything standing between the camera and the boat thins out around it
  uSeeThroughCenter: { value: new THREE.Vector2(-1000, -1000) }, // drawing-buffer pixels
  uSeeThroughRadius: { value: 120 },
  uSeeThroughDepth: { value: 0 }, // the boat's distance along the view axis
}

// Usable in vertex and fragment shaders that declare uNoise and the wind uniforms
export const windGLSL = /* glsl */ `
  uniform vec2 uWindDirection;
  uniform float uWindStrength;
  uniform float uWindTime;
  vec2 windOffset(vec2 position) {
    float gust = texture2D(uNoise, position * 0.1 + uWindDirection * uWindTime).r - 0.5;
    float swell = texture2D(uNoise, position * 0.05 + uWindDirection * uWindTime * 0.2).r - 0.5;
    return uWindDirection * (gust + swell) * uWindStrength;
  }
`

export const fogColorGLSL = /* glsl */ `
  vec3 stylizedFogColor() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float t = smoothstep(uFogRadial.x, uFogRadial.y, length(screenUv - uFogCenter));
    return mix(uFogColorA, uFogColorB, t);
  }
`

const fragmentHeader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform sampler2D uNoise;
  uniform float uCloudShadow;
  uniform float uCloudScale;
  uniform vec2 uCloudSpeed;
  uniform vec3 uSunDirection;
  uniform vec3 uLightColor;
  uniform float uLightIntensity;
  uniform vec3 uShadowColor;
  uniform vec2 uCoreShadowEdges;
  uniform vec3 uBounceColor;
  uniform float uBounceStrength;
  uniform float uWaterLine;
  uniform vec3 uFogColorA;
  uniform vec3 uFogColorB;
  uniform vec2 uFogCenter;
  uniform vec2 uFogRadial;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec2 uSeeThroughCenter;
  uniform float uSeeThroughRadius;
  uniform float uSeeThroughDepth;
  varying vec3 vStylizedWorld;

  // 4x4 ordered-dither threshold for screen-door transparency
  float bayer4(vec2 pixel) {
    vec2 cell = mod(floor(pixel), 4.0);
    int index = int(cell.x + cell.y * 4.0);
    const float matrix[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    return (matrix[index] + 0.5) / 16.0;
  }
  ${waveHeightGLSL()}
  ${fogColorGLSL}
`

const seeThroughBlock = /* glsl */ `
  #include <clipping_planes_fragment>
  #ifdef STYLIZED_SEE_THROUGH
    float seeThrough = length(gl_FragCoord.xy - uSeeThroughCenter) / uSeeThroughRadius;
    if (seeThrough < 1.0 && vViewPosition.z < uSeeThroughDepth - 2.0) {
      if (bayer4(gl_FragCoord.xy) < (1.0 - seeThrough * seeThrough) * 0.8) discard;
    }
  #endif
`

// Replaces three's light accumulation. The shadow map is still read, but
// only as a mask: shadowed areas take a tinted colour instead of going dark.
const lightingBlock = /* glsl */ `
  vec3 stylizedNormal = normalize(inverseTransformDirection(normal, viewMatrix));

  float dropShadow = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    if (receiveShadow) {
      DirectionalLightShadow sunShadow = directionalLightShadows[ 0 ];
      dropShadow = getShadow(directionalShadowMap[ 0 ], sunShadow.shadowMapSize, sunShadow.shadowIntensity, sunShadow.shadowBias, sunShadow.shadowRadius, vDirectionalShadowCoord[ 0 ]);
    }
  #endif

  float coreShadow = 1.0 - smoothstep(uCoreShadowEdges.x, uCoreShadowEdges.y, dot(stylizedNormal, uSunDirection));
  float cloud = texture2D(uNoise, vStylizedWorld.xz * uCloudScale + uTime * uCloudSpeed).g;
  float cloudShadow = smoothstep(0.56, 0.68, cloud) * uCloudShadow;
  float shade = clamp(max(max(coreShadow, 1.0 - dropShadow), cloudShadow), 0.0, 1.0);

  vec3 baseColor = diffuseColor.rgb;

  float facingDown = smoothstep(-0.3, 1.0, -stylizedNormal.y);
  float nearSea = pow(clamp(1.0 - max(vStylizedWorld.y, 0.0) / 1.6, 0.0, 1.0), 2.0);
  baseColor = mix(baseColor, uBounceColor, facingDown * nearSea * uBounceStrength);

  #ifdef STYLIZED_WATERLINE
    // White foam wherever a surface crosses the moving water surface
    float waterDistance = abs(vStylizedWorld.y - waveHeight(vStylizedWorld.xz, uTime));
    baseColor = mix(baseColor, vec3(1.0), 1.0 - step(uWaterLine, waterDistance));
  #endif

  // STYLIZED_SHADE
  vec3 stylizedColor = mix(baseColor * uLightColor * uLightIntensity, baseColor * uShadowColor, shade);
  // STYLIZED_EXTRA
`

const fogBlock = /* glsl */ `
  float stylizedFog = smoothstep(uFogNear, uFogFar, vViewPosition.z);
  outgoingLight = mix(outgoingLight, stylizedFogColor(), stylizedFog);
  #include <opaque_fragment>
`

// Turns a MeshLambertMaterial into the stylised look. `extend` can patch the
// shader further (the ocean adds waves); `key` must then be unique to it.
// `seeThrough` lets the boat show through it (off for the sea and the boat).
export function stylize(material, { waterLine = true, seeThrough = true, extend = null, key = 'default' } = {}) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStylizedWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 stylizedWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          stylizedWorld = instanceMatrix * stylizedWorld;
        #endif
        vStylizedWorld = (modelMatrix * stylizedWorld).xyz;`
      )

    const defines = `${waterLine ? '#define STYLIZED_WATERLINE\n' : ''}${seeThrough ? '#define STYLIZED_SEE_THROUGH\n' : ''}`
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${defines}#include <common>\n${fragmentHeader}`)
      .replace('#include <clipping_planes_fragment>', seeThroughBlock)
      .replace('#include <lights_fragment_begin>', lightingBlock)
      .replace('#include <lights_fragment_maps>', '')
      .replace('#include <lights_fragment_end>', '')
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 outgoingLight = stylizedColor + totalEmissiveRadiance;'
      )
      .replace('#include <opaque_fragment>', fogBlock)

    extend?.(shader)
  }
  material.customProgramCacheKey = () => `stylized-${key}-${waterLine}-${seeThrough}`
  return material
}

export function createStylizedMaterial(parameters = {}, options) {
  return stylize(new THREE.MeshLambertMaterial(parameters), options)
}

// Swaps every material under `root` for a stylised one with the same colour
// and texture. Shared source materials map to one shared result.
export function stylizeObject(root, options) {
  const cache = new Map()
  root.traverse(child => {
    if (!child.isMesh) return
    const convert = source => {
      if (!cache.has(source)) {
        cache.set(
          source,
          createStylizedMaterial(
            {
              color: source.color,
              map: source.map,
              vertexColors: source.vertexColors,
              flatShading: source.flatShading,
              side: source.side,
              transparent: source.transparent,
              alphaTest: source.alphaTest,
            },
            options
          )
        )
      }
      return cache.get(source)
    }
    child.material = Array.isArray(child.material) ? child.material.map(convert) : convert(child.material)
  })
}
