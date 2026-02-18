uniform float uTime;
uniform vec3 uColor1;    // primary color
uniform vec3 uColor2;    // secondary color
uniform vec3 uColor3;    // accent color
uniform float uFresnelPower;
uniform float uBrightness;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec3 vWorldPosition;

void main() {
  // View direction for Fresnel
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  // Fresnel — edges glow brighter
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);

  // Color mixing based on displacement + Fresnel + time
  float colorMix1 = sin(vDisplacement * 8.0 + uTime * 0.5) * 0.5 + 0.5;
  float colorMix2 = cos(vDisplacement * 6.0 - uTime * 0.3) * 0.5 + 0.5;

  // Blend three colors
  vec3 baseColor = mix(uColor1, uColor2, colorMix1);
  baseColor = mix(baseColor, uColor3, colorMix2 * 0.4);

  // Apply Fresnel glow
  vec3 fresnelColor = mix(baseColor * 0.3, baseColor, fresnel);

  // Add rim brightness
  float rim = fresnel * fresnel;
  fresnelColor += rim * baseColor * 0.8;

  // Inner darkness (center is darker, edges glow)
  float innerDark = smoothstep(0.0, 0.6, fresnel);
  vec3 finalColor = mix(baseColor * 0.05, fresnelColor, innerDark);

  // Overall brightness
  finalColor *= uBrightness;

  // Alpha — center is more opaque, edges are glowing
  float alpha = mix(0.85, 1.0, fresnel);

  gl_FragColor = vec4(finalColor, alpha);
}
