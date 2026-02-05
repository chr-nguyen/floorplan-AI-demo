import React, { Suspense, forwardRef, useImperativeHandle, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Html } from '@react-three/drei';

export interface ModelViewerRef {
  captureScreenshot: () => string | null;
}

interface ModelViewerProps {
  modelUrl: string;
  className?: string;
}

function Model({ url }: { url: string }) {
  console.log("ModelViewer trying to load:", url);
  const gltf = useGLTF(url, true);
  return <primitive object={gltf.scene} />;
}

// Helper component to extract the screenshot from within the Canvas context
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

const ModelViewer = forwardRef<ModelViewerRef, ModelViewerProps>(({ modelUrl, className = '' }, ref) => {
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
        camera={{ position: [0, 0, 4], fov: 50 }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <Suspense fallback={<Html center>Loading 3D Model...</Html>}>
          <Stage environment="city" intensity={0.6}>
            <Model url={modelUrl} />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault />
        <ScreenshotHandler ref={screenshotRef} />
      </Canvas>
    </div>
  );
});

export default ModelViewer;
