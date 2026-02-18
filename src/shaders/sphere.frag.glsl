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
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);

  // Color mixing driven by displacement — ripples carry the color
  float colorMix1 = sin(vDisplacement * 8.0 + uTime * 0.5) * 0.5 + 0.5;
  float colorMix2 = cos(vDisplacement * 6.0 - uTime * 0.3) * 0.5 + 0.5;

  vec3 baseColor = mix(uColor1, uColor2, colorMix1);
  baseColor = mix(baseColor, uColor3, colorMix2 * 0.4);

  // Displacement-driven brightness: ripple peaks glow, valleys are darker
  float rippleIntensity = smoothstep(-0.15, 0.2, vDisplacement);
  vec3 finalColor = baseColor * mix(0.2, 1.0, rippleIntensity);

  // Subtle rim enhancement
  finalColor += baseColor * fresnel * 0.25;

  // Overall brightness
  finalColor *= uBrightness;

  // Soft edge alpha — no hard border, fades at the rim
  float alpha = (1.0 - smoothstep(0.6, 1.0, fresnel)) * 0.92;

  gl_FragColor = vec4(finalColor, alpha);
}
