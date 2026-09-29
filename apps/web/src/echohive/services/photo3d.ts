import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const MAX_TEXTURE_EDGE = 512;
const GRID_SIZE = 96;

export async function createPhotoRelief(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image to create a 3D relief.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image is too large to process safely. Choose a smaller photo.');
    const scale = Math.min(1, MAX_TEXTURE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(bitmap.width * scale));
    canvas.height = Math.max(2, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const sample = document.createElement('canvas');
    sample.width = GRID_SIZE + 1;
    sample.height = GRID_SIZE + 1;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) throw new Error('Your browser could not build the 3D surface.');
    sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;

    const aspect = canvas.width / canvas.height;
    const width = aspect >= 1 ? 2.4 : 2.4 * aspect;
    const height = aspect >= 1 ? 2.4 / aspect : 2.4;
    const geometry = new THREE.PlaneGeometry(width, height, GRID_SIZE, GRID_SIZE);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    for (let index = 0; index < positions.count; index += 1) {
      const x = Math.min(GRID_SIZE, Math.round(uvs.getX(index) * GRID_SIZE));
      const y = GRID_SIZE - Math.min(GRID_SIZE, Math.round(uvs.getY(index) * GRID_SIZE));
      const pixel = (y * sample.width + x) * 4;
      const luminance = (pixels[pixel] * 0.2126 + pixels[pixel + 1] * 0.7152 + pixels[pixel + 2] * 0.0722) / 255;
      positions.setZ(index, 0.1 + luminance * 0.22);
    }
    geometry.computeVertexNormals();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.04, side: THREE.DoubleSide });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));

    const backingMaterial = new THREE.MeshStandardMaterial({ color: '#173b34', roughness: 0.82, side: THREE.DoubleSide });
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(width, height), backingMaterial);
    backing.position.z = -0.14;
    scene.add(backing);

    const edgeVertices: number[] = [];
    const addEdge = (indices: number[]) => {
      for (let index = 0; index < indices.length - 1; index += 1) {
        const a = [positions.getX(indices[index]), positions.getY(indices[index]), positions.getZ(indices[index])];
        const b = [positions.getX(indices[index + 1]), positions.getY(indices[index + 1]), positions.getZ(indices[index + 1])];
        const c = [b[0], b[1], -0.14];
        const d = [a[0], a[1], -0.14];
        edgeVertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    };
    const rowSize = GRID_SIZE + 1;
    addEdge(Array.from({ length: rowSize }, (_, row) => row * rowSize));
    addEdge(Array.from({ length: rowSize }, (_, row) => row * rowSize + GRID_SIZE));
    addEdge(Array.from({ length: rowSize }, (_, column) => column));
    addEdge(Array.from({ length: rowSize }, (_, column) => GRID_SIZE * rowSize + column));
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
    edgeGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(edgeGeometry, backingMaterial));

    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(scene, (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('Could not export the 3D image. Please try another photo.'));
      }, reject, { binary: true });
    });
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) || 'photo';
    return new File([glb], `${baseName}-3d.glb`, { type: 'model/gltf-binary', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
