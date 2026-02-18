import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from '../shaders/sphere.vert.glsl';
import fragmentShader from '../shaders/sphere.frag.glsl';
import type { AppState } from '../lib/types';

const STATE_CONFIGS: Record<string, {
  color1: [number, number, number];
  color2: [number, number, number];
  color3: [number, number, number];
  noiseStrength: number;
  noiseSpeed: number;
  noiseFrequency: number;
  pulse: number;
  fresnelPower: number;
  brightness: number;
}> = {
  idle: {
    color1: [0.97, 0.77, 0.71],
    color2: [0.91, 0.64, 0.82],
    color3: [0.72, 0.83, 0.63],
    noiseStrength: 0.12,
    noiseSpeed: 0.15,
    noiseFrequency: 1.5,
    pulse: 0.3,
    fresnelPower: 2.5,
    brightness: 0.9,
  },
  listening: {
    color1: [0.55, 0.36, 0.96],   // vivid purple #8b5cf6
    color2: [0.44, 0.28, 0.85],   // deeper purple
    color3: [0.67, 0.47, 1.0],    // lighter lavender
    noiseStrength: 0.18,
    noiseSpeed: 0.4,
    noiseFrequency: 2.0,
    pulse: 0.8,
    fresnelPower: 2.0,
    brightness: 1.2,
  },
  thinking: {
    color1: [0.94, 0.75, 0.50],
    color2: [0.91, 0.63, 0.38],
    color3: [0.97, 0.82, 0.63],
    noiseStrength: 0.22,
    noiseSpeed: 0.6,
    noiseFrequency: 2.5,
    pulse: 0.2,
    fresnelPower: 3.0,
    brightness: 1.0,
  },
  speaking: {
    color1: [0.06, 0.73, 0.51],   // vivid green #10b981
    color2: [0.12, 0.82, 0.60],   // brighter green
    color3: [0.04, 0.64, 0.44],   // deeper green
    noiseStrength: 0.15,
    noiseSpeed: 0.35,
    noiseFrequency: 1.8,
    pulse: 0.6,
    fresnelPower: 2.2,
    brightness: 1.1,
  },
  sleeping: {
    color1: [0.75, 0.72, 0.85],
    color2: [0.69, 0.66, 0.78],
    color3: [0.72, 0.69, 0.82],
    noiseStrength: 0.06,
    noiseSpeed: 0.05,
    noiseFrequency: 1.2,
    pulse: 0.1,
    fresnelPower: 3.5,
    brightness: 0.4,
  },
};

interface ClawbyCanvasProps {
  state: AppState;
  size?: number;
}

export default function ClawbyCanvas({ state, size = 240 }: ClawbyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const uniformsRef = useRef<any>(null);
  const frameRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());
  const targetConfigRef = useRef(STATE_CONFIGS.idle);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const geometry = new THREE.SphereGeometry(1, 128, 128);

    const config = STATE_CONFIGS.idle;
    const uniforms = {
      uTime: { value: 0 },
      uNoiseStrength: { value: config.noiseStrength },
      uNoiseSpeed: { value: config.noiseSpeed },
      uNoiseFrequency: { value: config.noiseFrequency },
      uPulse: { value: config.pulse },
      uColor1: { value: new THREE.Color(...config.color1) },
      uColor2: { value: new THREE.Color(...config.color2) },
      uColor3: { value: new THREE.Color(...config.color3) },
      uFresnelPower: { value: config.fresnelPower },
      uBrightness: { value: config.brightness },
    };
    uniformsRef.current = uniforms;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      side: THREE.FrontSide,
    });

    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      const elapsed = clockRef.current.getElapsedTime();
      uniforms.uTime.value = elapsed;

      const target = targetConfigRef.current;
      const lerpSpeed = 0.03;

      uniforms.uNoiseStrength.value += (target.noiseStrength - uniforms.uNoiseStrength.value) * lerpSpeed;
      uniforms.uNoiseSpeed.value += (target.noiseSpeed - uniforms.uNoiseSpeed.value) * lerpSpeed;
      uniforms.uNoiseFrequency.value += (target.noiseFrequency - uniforms.uNoiseFrequency.value) * lerpSpeed;
      uniforms.uPulse.value += (target.pulse - uniforms.uPulse.value) * lerpSpeed;
      uniforms.uFresnelPower.value += (target.fresnelPower - uniforms.uFresnelPower.value) * lerpSpeed;
      uniforms.uBrightness.value += (target.brightness - uniforms.uBrightness.value) * lerpSpeed;

      uniforms.uColor1.value.lerp(new THREE.Color(...target.color1), lerpSpeed);
      uniforms.uColor2.value.lerp(new THREE.Color(...target.color2), lerpSpeed);
      uniforms.uColor3.value.lerp(new THREE.Color(...target.color3), lerpSpeed);

      sphere.rotation.y = elapsed * 0.1;
      sphere.rotation.x = Math.sin(elapsed * 0.15) * 0.1;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  useEffect(() => {
    targetConfigRef.current = STATE_CONFIGS[state] || STATE_CONFIGS.idle;
  }, [state]);

  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        position: 'relative',
      }}
    />
  );
}
