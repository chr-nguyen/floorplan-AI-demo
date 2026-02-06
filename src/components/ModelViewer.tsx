import React, { Suspense, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';

export interface ModelViewerRef {
  captureScreenshot: () => string | null;
}

interface ModelViewerProps {
  modelUrl?: string; // For GLTF/GLB (Legacy)
  textureUrl?: string; // For Displacement (New)
  depthUrl?: string; // For Displacement (New)
  className?: string;
}

// -----------------------------------------------------------------------------
// Legacy GLTF Model Component
// -----------------------------------------------------------------------------
function Model({ url }: { url: string }) {
  console.log("ModelViewer (GLTF) trying to load:", url);
  const gltf = useGLTF(url, true);
  return <primitive object={gltf.scene} />;
}

// -----------------------------------------------------------------------------
// New Displacement Model Component
// -----------------------------------------------------------------------------
function DisplacementModel({ textureUrl, depthUrl }: { textureUrl: string, depthUrl: string }) {
  console.log("ModelViewer (Displacement) loading:", textureUrl, depthUrl);

  const [colorMap, displacementMap] = useLoader(THREE.TextureLoader, [textureUrl, depthUrl]);

  const meshRef = useRef<THREE.Mesh>(null);

  // Configure material for displacement
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: colorMap,
      displacementMap: displacementMap,
      displacementScale: 2.5, // Adjust this to control wall height
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide // Render both sides
    });
  }, [colorMap, displacementMap]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      {/* High segment count (512x512) is CRITICAL for detailed displacement */}
      <planeGeometry args={[10, 10, 512, 512]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}


// -----------------------------------------------------------------------------
// Screenshot Handler
// -----------------------------------------------------------------------------
const ScreenshotHandler = forwardRef(({ }, ref) => {
  const { gl, scene, camera } = useThree();

  useImperativeHandle(ref, () => ({
    capture: () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    }
  }));

  return null;
});

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
const ModelViewer = forwardRef<ModelViewerRef, ModelViewerProps>(({ modelUrl, textureUrl, depthUrl, className = '' }, ref) => {
  const screenshotRef = useRef<{ capture: () => string }>(null);

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (screenshotRef.current) {
        return screenshotRef.current.capture();
      }
      return null;
    }
  }));

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: '300px', backgroundColor: '#f0f0f0', borderRadius: '8px', overflow: 'hidden', position: 'relative', zIndex: 0, pointerEvents: 'auto' }}>
      <Canvas
        shadows
        camera={{ position: [0, 5, 8], fov: 45 }} // Higher camera angle for floorplans
        gl={{ preserveDrawingBuffer: true }}
      >
        <Suspense fallback={<Html center><div className="spinner" style={{ margin: '0 auto' }}></div><p style={{ color: '#000', width: '40rem', textAlign: 'center' }}  >Loading 3D Model...</p></Html>}>
          <Stage environment="city" intensity={0.6} adjustCamera={!textureUrl}> {/* Only adjust camera automatically for GLTF objects, fixed camera is better for plane */}
            {textureUrl && depthUrl ? (
              <DisplacementModel textureUrl={textureUrl} depthUrl={depthUrl} />
            ) : modelUrl ? (
              <Model url={modelUrl} />
            ) : null}
          </Stage>
        </Suspense>
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} /> {/* Prevent going below ground */}
        <ScreenshotHandler ref={screenshotRef} />
      </Canvas >
    </div >
  );
});

export default ModelViewer;
