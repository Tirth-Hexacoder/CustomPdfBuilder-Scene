import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box3, Vector3 } from "three";
import type { Camera, Group, Object3D, Scene, WebGLRenderer } from "three";
import toast from "react-hot-toast";
import { captureSceneImage } from "../../utils/sceneCapture";
import type { ReviewImage, ReviewImageMetadata } from "../../types";

function CaptureBridge({
  glRef,
  cameraRef,
  sceneRef
}: {
  glRef: MutableRefObject<WebGLRenderer | null>;
  cameraRef: MutableRefObject<Camera | null>;
  sceneRef: MutableRefObject<Scene | null>;
}) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    glRef.current = gl;
    cameraRef.current = camera;
    sceneRef.current = scene;
  }, [camera, cameraRef, gl, glRef, scene, sceneRef]);
  return null;
}

function removeCeiling(root: Object3D) {
  const toRemove: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.name && obj.name.toLowerCase().includes("ceiling")) toRemove.push(obj);
  });
  for (const obj of toRemove) obj.parent?.remove(obj);
}

function ClosetModel() {
  const { scene } = useGLTF("/closet.glb");
  const cleaned = useMemo(() => {
    const cloned = (scene as Group).clone(true);
    removeCeiling(cloned);
    return cloned;
  }, [scene]);

  return <primitive rotation={[-Math.PI / 2, 0, 0]} object={cleaned} />;
}

useGLTF.preload("/closet.glb");

function LookAtClosetCenter({
  closetRootRef,
  orbitControlsRef,
  closetCenterRef
}: {
  closetRootRef: MutableRefObject<Group | null>;
  orbitControlsRef: MutableRefObject<OrbitControlsImpl | null>;
  closetCenterRef: MutableRefObject<[number, number, number] | null>;
}) {
  const { camera } = useThree();
  const didInitRef = useRef(false);
  const centerRef = useRef<Vector3 | null>(null);

  useFrame(() => {
    if (didInitRef.current) return;

    const root = closetRootRef.current;
    if (!root || root.children.length === 0) return;

    if (!centerRef.current) {
      root.updateWorldMatrix(true, true);
      const box = new Box3().setFromObject(root);
      if (box.isEmpty()) return;

      const center = box.getCenter(new Vector3());
      centerRef.current = center;
      closetCenterRef.current = [center.x, center.y, center.z];
    }

    const center = centerRef.current;
    if (!center) return;

    const controls = orbitControlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.update();
      didInitRef.current = true;
      return;
    }

    // Controls not ready yet; keep camera oriented roughly correctly for the first frame(s)
    camera.lookAt(center);
    camera.updateMatrixWorld();
  });

  return null;
}

function buildAutoCapturePoses(camera: Camera) {
  const base = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  return [
    { id: "current", cameraObj: base },
    { id: "preset_1", cameraObj: { x: -3, y: 4, z: 6 } },
    { id: "preset_2", cameraObj: { x: 1, y: 5, z: 0 } },
    { id: "current_z_minus", cameraObj: { x: base.x + 1, y: base.y, z: base.z - 3.5 } }
  ];
}

export function SceneTab({
  isActive = true,
  images,
  onAddImage,
  onSaveToDb // New prop
}: {
  isActive?: boolean;
  images: ReviewImage[];
  onAddImage: (img: ReviewImage) => void;
  onSaveToDb?: (imagesToSave: ReviewImage[]) => Promise<void>;
}) {
  const glRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const closetRootRef = useRef<Group | null>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const closetCenterRef = useRef<[number, number, number] | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const didAutoCaptureRef = useRef(false);

  const captureCurrent = async (tag?: string) => {
    const gl = glRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const target = closetRootRef.current;
    if (!gl || !camera || !target) return;
    if (isCapturing) return;

    setIsCapturing(true);
    try {
      if (scene) gl.render(scene, camera);
      const dataUrl = captureSceneImage(gl, camera, target);
      if (!dataUrl) return;

      const isAuto = tag?.startsWith("auto");
      const autoTypes = ["2D Default", "Stretched", "Isometric", "Wall"];
      const randIdx = isAuto && tag ? parseInt(tag.split('_')[1] || "0", 10) : 0;
      const imageType = isAuto ? autoTypes[randIdx % autoTypes.length] : "3D";

      const next: ReviewImage = {
        id: crypto.randomUUID(),
        url: dataUrl,
        type: imageType,
        cameraInfo: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        info: {
          openAllDoors: false,
          propsType: "female",
          showObjects: false,
          tempVisibleIndex: [true, true, true, true],
          wall: -1
        }
      };

      onAddImage(next);
      if (tag === "manual") toast.success("Captured");
      
      return next;
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCapture = async () => {
    await captureCurrent("manual");
  };

  useEffect(() => {
    if (!isActive) return;
    if (didAutoCaptureRef.current) return;
    if (images.length > 0) return;

    const checkAndCapture = async () => {
      if (didAutoCaptureRef.current) return;

      const gl = glRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;
      const target = closetRootRef.current;

      // Wait until React Three Fiber passes down the refs AND the model has actually populated inside the target group
      if (!gl || !camera || !scene || !target || target.children.length === 0) {
        window.setTimeout(checkAndCapture, 150);
        return;
      }

      didAutoCaptureRef.current = true;
      try {
        const poses = buildAutoCapturePoses(camera);
        const generated: ReviewImage[] = [];
        for (const pose of poses) {
          if (!isActive) break; // Stop if tab becomes inactive during capture
          camera.position.set(pose.cameraObj.x, pose.cameraObj.y, pose.cameraObj.z);
          const center = closetCenterRef.current ?? [0, 1.2, 0];
          camera.lookAt(center[0], center[1], center[2]);
          (camera as any).updateProjectionMatrix?.();
          
          // Wait for render cycle to complete and model to settle
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          const img = await captureCurrent(`auto:${pose.id}`);
          if (img) generated.push(img);
          await new Promise((resolve) => window.setTimeout(resolve, 150));
        }

        if (generated.length > 0 && onSaveToDb) {
           await onSaveToDb(generated);
        }
      } catch (err) {
        console.error("Auto capture failed", err);
        didAutoCaptureRef.current = false;
      }
    };

    checkAndCapture();
  }, [images.length, isActive]);

  const previewImages = images.map((img) => ({
    ...img,
    id: img.id || crypto.randomUUID(),
    url: img.url || img.blobUrl || img.imageUrl || "",
    camera: img.cameraInfo || (img.metadata as any)?.cameraPosition
  }));

  return (
    <section className="scene-layout" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [1, 2.4, 8], fov: 50, }}
        frameloop={isActive ? "always" : "never"}
        style={{ width: "100%", height: "100%", background: "#ffffff" }}
      >
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <group ref={closetRootRef}>
          <Suspense fallback={null}>
            <ClosetModel />
          </Suspense>
        </group>
        <OrbitControls ref={orbitControlsRef} makeDefault enableDamping maxPolarAngle={Math.PI / 2} minDistance={3} maxDistance={15} />
        <LookAtClosetCenter closetRootRef={closetRootRef} orbitControlsRef={orbitControlsRef} closetCenterRef={closetCenterRef} />
        <CaptureBridge glRef={glRef} cameraRef={cameraRef} sceneRef={sceneRef} />
      </Canvas>

      <div className="floating-capture-btn-container" style={{ position: "absolute", left: 18, bottom: 18, zIndex: 200, pointerEvents: "none" }}>
        <button
          className="floating-capture-btn"
          style={{ pointerEvents: "auto", background: "#2563eb", color: "#fff", border: 0, borderRadius: 12, padding: "12px 16px", fontWeight: 800, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", cursor: "pointer" }}
          onClick={handleCapture}
          disabled={isCapturing}
        >
          Capture
        </button>
      </div>

      <aside
        style={{
          position: "absolute",
          top: 72,
          right: 18,
          bottom: 18,
          width: 220,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(15,23,42,0.12)",
          borderRadius: 12,
          overflow: "hidden",
          zIndex: 120,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ padding: "10px 12px", fontWeight: 800, fontSize: 12, letterSpacing: 1, color: "#0f172a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>CAPTURES</span>
          {onSaveToDb && (
             <button
                onClick={() => onSaveToDb(images)}
                style={{
                  background: "#10b981", color: "#fff", border: "none",
                  borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                  fontSize: 10, fontWeight: "bold"
                }}
             >
               Save to DB
             </button>
          )}
        </div>
        <div style={{ padding: 10, overflow: "auto", display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {previewImages.map((img, idx) => (
            <div key={`${img.id}-${idx}`} style={{ display: "grid", gap: 6 }}>
              <img
                src={img.url || img.blobUrl || img.imageUrl}
                alt="capture"
                style={{
                  width: "100%",
                  height: 110,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.10)"
                }}
                loading="lazy"
              />
              <div style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>
                Type: {String(img.type || img.metadata?.type || "Unknown")}
              </div>
            </div>
          ))}
          {previewImages.length === 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>No captures yet.</div> : null}
        </div>
      </aside>
    </section>
  );
}
