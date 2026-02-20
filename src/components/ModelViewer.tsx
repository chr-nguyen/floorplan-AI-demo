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
// Error Boundary for Model Loading
// -----------------------------------------------------------------------------
class ModelErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ModelViewer Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Html center>
          <div style={{ color: 'red', textAlign: 'center', background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '4px' }}>
            <p><strong>Error loading model</strong></p>
            <p style={{ fontSize: '0.8em' }}>{this.state.error?.message}</p>
          </div>
        </Html>
      );
    }

    return this.props.children;
  }
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
  const controlsRef = useRef<any>(null); // OrbitControls ref

  useImperativeHandle(ref, () => ({
    captureScreenshot: () => {
      if (screenshotRef.current) {
        return screenshotRef.current.capture();
      }
      return null;
    }
  }));

  const handleControl = (action: string) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const camera = controls.object; // Camera is attached to controls
    if (!camera) return;

    const angleStep = Math.PI / 16; // 18 degrees
    const panStep = 0.10;
    const zoomFactor = 0.1;

    switch (action) {
      case 'rotate-left':
        controls.setAzimuthalAngle(controls.getAzimuthalAngle() + angleStep);
        break;
      case 'rotate-right':
        controls.setAzimuthalAngle(controls.getAzimuthalAngle() - angleStep);
        break;
      case 'tilt-up':
        controls.setPolarAngle(controls.getPolarAngle() - angleStep);
        break;
      case 'tilt-down':
        controls.setPolarAngle(controls.getPolarAngle() + angleStep);
        break;
      case 'zoom-in':
        if (camera.isPerspectiveCamera) {
          const direction = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
          camera.position.addScaledVector(direction, zoomFactor);
        }
        break;
      case 'zoom-out':
        if (camera.isPerspectiveCamera) {
          const direction = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
          camera.position.addScaledVector(direction, -zoomFactor);
        }
        break;
      case 'pan-left':
        const rightL = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        rightL.y = 0; rightL.normalize();
        camera.position.addScaledVector(rightL, -panStep);
        controls.target.addScaledVector(rightL, -panStep);
        break;
      case 'pan-right':
        const rightR = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        rightR.y = 0; rightR.normalize();
        camera.position.addScaledVector(rightR, panStep);
        controls.target.addScaledVector(rightR, panStep);
        break;
      case 'pan-up':
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        up.y = 0; up.normalize();
        camera.position.addScaledVector(up, panStep);
        controls.target.addScaledVector(up, panStep);
        break;
      case 'pan-down':
        const down = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        down.y = 0; down.normalize();
        camera.position.addScaledVector(down, -panStep);
        controls.target.addScaledVector(down, -panStep);
        break;
    }
    controls.update();
  };

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: '300px', display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>

      {/* 3D Canvas Area */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#f0f0f0' }}>
        <Canvas
          shadows
          camera={{ position: [0, 5, 8], fov: 60 }}
          gl={{ preserveDrawingBuffer: true }}
        >
          <Suspense fallback={<Html center><div className="spinner" style={{ margin: '0 auto' }}></div></Html>}>
            <Stage environment="city" intensity={0.6} adjustCamera={!textureUrl}>
              <ModelErrorBoundary>
                {textureUrl && depthUrl ? (
                  <DisplacementModel textureUrl={textureUrl} depthUrl={depthUrl} />
                ) : modelUrl ? (
                  <Model url={modelUrl} />
                ) : null}
              </ModelErrorBoundary>
            </Stage>
          </Suspense>
          <OrbitControls ref={controlsRef} makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.2} />
          <ScreenshotHandler ref={screenshotRef} />
        </Canvas >
      </div>

      {/* External Camera Controls */}
      <div style={{ backgroundColor: '#fff', padding: '8px 12px', borderTop: '1px solid #eee', display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center' }}>

        {/* Rotate */}
        <div style={groupStyle}>
          <span style={labelStyle}>Rotate</span>
          <button onClick={() => handleControl('rotate-left')} style={btnStyle} title="Rotate Left">⟲</button>
          <button onClick={() => handleControl('rotate-right')} style={btnStyle} title="Rotate Right">⟳</button>
        </div>

        <div style={separatorStyle}></div>

        {/* Tilt */}
        <div style={groupStyle}>
          <span style={labelStyle}>Tilt</span>
          <button onClick={() => handleControl('tilt-up')} style={btnStyle} title="Tilt Up">↑</button>
          <button onClick={() => handleControl('tilt-down')} style={btnStyle} title="Tilt Down">↓</button>
        </div>

        <div style={separatorStyle}></div>

        {/* Pan */}
        <div style={groupStyle}>
          <span style={labelStyle}>Pan</span>
          <button onClick={() => handleControl('pan-left')} style={btnStyle} title="Pan Left">⬅</button>
          <button onClick={() => handleControl('pan-right')} style={btnStyle} title="Pan Right"><span style={{ transform: 'rotate(180deg)' }}>⬅</span></button>
          <button onClick={() => handleControl('pan-up')} style={btnStyle} title="Pan Up">⬆</button>
          <button onClick={() => handleControl('pan-down')} style={btnStyle} title="Pan Down">⬇</button>
        </div>

        <div style={separatorStyle}></div>

        {/* Zoom */}
        <div style={groupStyle}>
          <span style={labelStyle}>Zoom</span>
          <button onClick={() => handleControl('zoom-in')} style={btnStyle} title="Zoom In">＋</button>
          <button onClick={() => handleControl('zoom-out')} style={btnStyle} title="Zoom Out">－</button>
        </div>
      </div>

    </div >
  );
});

const groupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const labelStyle = {
  fontSize: '0.75rem',
  color: '#888',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
  marginRight: '4px'
};

const btnStyle = {
  width: '32px',
  height: '32px',
  fontSize: '16px',
  cursor: 'pointer',
  background: '#f8f9fa',
  border: '1px solid #ddd',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.1s'
};

const separatorStyle = {
  width: '1px',
  height: '24px',
  background: '#eee'
};

export default ModelViewer;
