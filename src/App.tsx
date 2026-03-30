import { useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { SceneTab } from "./components/scene/SceneTab";
import type { ReviewImage, ReviewSnapshot } from "./types";

function getEditorUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("editorUrl") || "";
  return fromQuery || (import.meta as any).env?.VITE_EDITOR_URL || "http://localhost:5173/";
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getApiBaseUrl() {
  return normalizeBaseUrl(String((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:4000/api"));
}

function joinUrl(baseUrl: string, path: string) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const user = params.get("user") || "1";
  
  const [projectId] = useState(params.get("projectId") || `user${user}_proj`);
  const [closetId] = useState(params.get("closetId") || `user${user}_closet`);
  const token = String((import.meta as any).env?.VITE_PDF_BUILDER_AUTH_TOKEN || "dummy_auth_token_42");
  
  const editorUrl = useMemo(() => getEditorUrl(), []);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>({ images: [], pages: [] });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // We always check the database for current images to allow roaming profiles
    fetch(joinUrl(getApiBaseUrl(), `/project/${encodeURIComponent(projectId)}/closet/${encodeURIComponent(closetId)}`), {
      cache: "no-store",
      headers: {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache"
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.images && data.images.length > 0) {
          setSnapshot({ images: data.images, pages: [] });
        }
      })
      .catch(err => console.error("Failed to load existing scene data", err))
      .finally(() => {
        setIsLoaded(true);
      });
  }, [projectId, closetId]);

  const onAddImage = (img: ReviewImage) => {
    setSnapshot((prev) => ({ ...prev, images: [...prev.images, img] }));
  };

  const onSaveToDb = async (overrideImages?: ReviewImage[]) => {
    try {
      const payloadArr = overrideImages || snapshot.images;
      if (payloadArr.length === 0) {
        toast.error("No images to save!");
        return;
      }
      
      const response = await fetch(joinUrl(getApiBaseUrl(), "/save-scene"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, closetId, images: payloadArr })
      });

      if (!response.ok) throw new Error("Failed to save to database");

      const data = await response.json();
      
      // Update local snapshot with backend paths so Editor can load them directly via URLs!
      setSnapshot(prev => ({
        ...prev,
        images: data.savedImages // newly updated array with fresh imageUrl
      }));
      
      toast.success("Saved to database!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save to DB");
    }
  };

  const goToEditor = () => {
    try {
      window.name = JSON.stringify({ pdfBuilderAuthToken: token });
    } catch {
      // ignore
    }
    window.location.href = `${editorUrl}?projectId=${encodeURIComponent(projectId)}&closetId=${encodeURIComponent(closetId)}`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1220" }}>
      <Toaster position="top-center" />
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 300, display: "flex", gap: 10 }}>
        <button
          onClick={goToEditor}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: 0,
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: "pointer"
          }}
        >
          Go To Editor →
        </button>
      </div>

      <div style={{ position: "absolute", top: 12, left: 140, zIndex: 300, display: "flex", gap: 10, color: "white", alignItems: "center", fontWeight: "bold" }}>
          Current User: {user}
      </div>

      {isLoaded && <SceneTab isActive={true} images={snapshot.images} onAddImage={onAddImage} onSaveToDb={onSaveToDb} />}
    </div>
  );
}
