import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Props {
  modelUrl?: string | null;
  className?: string;
  autoRotate?: boolean;
}

const ModelViewer: React.FC<Props> = ({ modelUrl, className = '', autoRotate = false }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setLoadError(false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#12201f');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.05, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xdcece4, 0x243b37, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffe2b5, 3.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x4ac8a2, 24, 15);
    rimLight.position.set(-3, 1.5, -2);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5, 72),
      new THREE.MeshStandardMaterial({ color: '#142422', roughness: 0.88, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.2;
    controls.maxDistance = 9;
    controls.target.set(0, 0, 0);

    let currentModel: THREE.Object3D | null = null;
    if (modelUrl) {
      new GLTFLoader().load(modelUrl, (gltf) => {
        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const largestDimension = Math.max(size.x, size.y, size.z) || 1;
        model.scale.setScalar(2.15 / largestDimension);
        model.position.sub(center.multiplyScalar(2.15 / largestDimension));
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(model);
        currentModel = model;
        controls.target.set(0, 0, 0);
      }, undefined, () => setLoadError(true));
    } else {
      const material = new THREE.MeshPhysicalMaterial({
        color: '#58c7a1',
        metalness: 0.58,
        roughness: 0.2,
        clearcoat: 0.85,
        clearcoatRoughness: 0.15,
      });
      const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(0.92, 0.29, 220, 32, 2, 5), material);
      sculpture.castShadow = true;
      sculpture.receiveShadow = true;
      scene.add(sculpture);
      currentModel = sculpture;
    }

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if ((!modelUrl || autoRotate) && currentModel) currentModel.rotation.y += 0.0032;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, autoRotate]);

  return (
    <div className={`model-viewer ${className}`} ref={hostRef} aria-label="Interactive 3D model viewer">
      {loadError && <div className="model-viewer-error" role="alert">This model could not be loaded. Try another GLB file.</div>}
    </div>
  );
};

export default ModelViewer;
