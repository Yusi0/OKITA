import { useState, useRef, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TitleBar } from "./components/TitleBar";
import { ControlBar } from "./components/ControlBar";
import { ExportModal } from "./components/ExportModal";
import { CropOverlay } from "./components/CropOverlay";
import { Video, Film, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import "./App.css";

const isNewerVersion = (current: string, latest: string) => {
  const currParts = current.split(".").map(Number);
  const latParts = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const c = currParts[i] || 0;
    const l = latParts[i] || 0;
    if (l > c) return true;
    if (c > l) return false;
  }
  return false;
};

function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null); // 원본 절대 경로 저장
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [smoothTime, setSmoothTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);

  // 편집 모드 관련 상태 정의
  const [isEditMode, setIsEditMode] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // 크롭(Crop) 및 캡처 관련 상태 정의
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropArea, setCropArea] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [cropAspectRatio, setCropAspectRatio] = useState<string>("free");
  const [videoRect, setVideoRect] = useState<DOMRect | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  // 플레이리스트 (같은 폴더 미디어 목록) 관련 상태
  const [siblingFiles, setSiblingFiles] = useState<string[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);

  // 업데이트 체크 관련 상태
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; notes?: string } | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // 현재 파일이 이미지 포맷인지 여부 판별 헬퍼
  const isImage = filePath ? /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(filePath) : false;

  // 실제 렌더링된 미디어 사각형 영역 계산 (레터박스/필러박스 제외, 비디오 및 이미지 통합 지원)
  const calculateMediaRenderRect = () => {
    if (isImage) {
      if (!imageRef.current) return null;
      const img = imageRef.current;
      const rect = img.getBoundingClientRect();
      if (img.naturalWidth === 0) return null;
      
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const elementRatio = rect.width / rect.height;
      
      let renderWidth = rect.width;
      let renderHeight = rect.height;
      let renderLeft = rect.left;
      let renderTop = rect.top;
      
      if (elementRatio > imgRatio) {
        renderWidth = rect.height * imgRatio;
        renderLeft = rect.left + (rect.width - renderWidth) / 2;
      } else {
        renderHeight = rect.width / imgRatio;
        renderTop = rect.top + (rect.height - renderHeight) / 2;
      }
      
      return {
        x: renderLeft - rect.left,
        y: renderTop - rect.top,
        left: renderLeft,
        top: renderTop,
        width: renderWidth,
        height: renderHeight
      } as DOMRect;
    } else {
      if (!videoRef.current) return null;
      const video = videoRef.current;
      const rect = video.getBoundingClientRect();
      if (video.videoWidth === 0) return null;
      
      const videoRatio = video.videoWidth / video.videoHeight;
      const elementRatio = rect.width / rect.height;
      
      let renderWidth = rect.width;
      let renderHeight = rect.height;
      let renderLeft = rect.left;
      let renderTop = rect.top;
      
      if (elementRatio > videoRatio) {
        // Pillarbox (가로 검은 여백)
        renderWidth = rect.height * videoRatio;
        renderLeft = rect.left + (rect.width - renderWidth) / 2;
      } else {
        // Letterbox (세로 검은 여백)
        renderHeight = rect.width / videoRatio;
        renderTop = rect.top + (rect.height - renderHeight) / 2;
      }
      
      return {
        x: renderLeft - rect.left,
        y: renderTop - rect.top,
        left: renderLeft,
        top: renderTop,
        width: renderWidth,
        height: renderHeight
      } as DOMRect;
    }
  };

  const updateVideoRect = () => {
    const rect = calculateMediaRenderRect();
    setVideoRect(rect);
  };

  // 현재 활성화된 파일의 부모 디렉터리에서 형제 미디어 목록을 불러오는 효과
  useEffect(() => {
    const loadSiblingFiles = async () => {
      if (!filePath) {
        setSiblingFiles([]);
        setCurrentFileIndex(-1);
        return;
      }
      try {
        const files = await invoke<string[]>("get_neighbor_files", { currentPath: filePath });
        setSiblingFiles(files);
        const index = files.indexOf(filePath);
        setCurrentFileIndex(index);
      } catch (err) {
        console.error("이웃 미디어 로드 실패:", err);
      }
    };
    loadSiblingFiles();
  }, [filePath]);

  // 크롭 모드 활성화 시 미디어 요소의 크기 변화 감지 (CSS 트랜지션 및 창 크기 변동 대응)
  useEffect(() => {
    if (!isCropMode || !videoSrc) return;
    
    const targetElement = isImage ? imageRef.current : videoRef.current;
    if (!targetElement) return;

    // 초기 계산 실행
    updateVideoRect();

    // ResizeObserver를 통해 미디어 엘리먼트의 렌더 사이즈 변경을 매 프레임 실시간 감지
    const resizeObserver = new ResizeObserver(() => {
      updateVideoRect();
    });

    resizeObserver.observe(targetElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isCropMode, isImage, videoSrc]);

  // 편집 모드 시 컨트롤 바 상시 고정화 처리
  useEffect(() => {
    if (isEditMode) {
      setIsControlsVisible(true);
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    }
  }, [isEditMode]);

  // 바탕화면 및 탐색기 드래그 앤 드롭 파일 수신 로직
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    
    const setupDragDrop = async () => {
      try {
        const unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
          const payload = event.payload;
          if (payload && payload.paths && payload.paths.length > 0) {
            const droppedPath = payload.paths[0];
            
            const isSupported = /\.(mp4|webm|mkv|avi|mov|ogv|3gp|png|jpg|jpeg|webp|gif|bmp)$/i.test(droppedPath);
            if (isSupported) {
              const fileUrl = convertFileSrc(droppedPath);
              const parts = droppedPath.split(/[/\\]/);
              const name = parts[parts.length - 1];

              setFilePath(droppedPath);
              setVideoSrc(fileUrl);
              setFileName(name);
              setIsPlaying(false);
              setCurrentTime(0);
              setSmoothTime(0);
              setDuration(0);
              setIsEditMode(false);
              setIsCropMode(false);
              setCropArea({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
              setCropAspectRatio("free");

              invoke<number>("get_file_size", { path: droppedPath })
                .then(setOriginalFileSize)
                .catch(console.error);

              const isDroppedImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(droppedPath);
              if (!isDroppedImage) {
                setTimeout(() => {
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().then(() => {
                      setIsPlaying(true);
                    }).catch(e => console.warn("Auto-play failed:", e));
                  }
                }, 50);
              }
            }
          }
        });
        unlistenFn = unlisten;
      } catch (err) {
        console.error("드래그 앤 드롭 이벤트 등록 실패:", err);
      }
    };

    setupDragDrop();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // 앱 기동 시 원격 최신 버전 체크 및 업데이트 알림
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const currentVersion = await getVersion();
        
        // 깃허브 raw version.json 파일 주소 (체커)
        const response = await fetch("https://raw.githubusercontent.com/choez/OKITA-Canvas/main/version.json");
        if (!response.ok) return;

        const data = await response.json();
        if (data && data.version && data.url) {
          const hasNew = isNewerVersion(currentVersion, data.version);
          if (hasNew) {
            setUpdateInfo({
              version: data.version,
              url: data.url,
              notes: data.notes
            });
            setIsUpdateModalOpen(true);
          }
        }
      } catch (err) {
        // 네트워크 미연결 등은 무시
        console.log("업데이트 검사 스킵:", err);
      }
    };
    checkUpdates();
  }, []);

  // 앱 기동 시 Windows 파일 연결(더블클릭)로 연 비디오 파일이 있는지 확인 및 자동 재생
  useEffect(() => {
    const checkStartupFile = async () => {
      try {
        const startupPath = await invoke<string | null>("get_startup_file");
        if (startupPath) {
          const fileUrl = convertFileSrc(startupPath);
          const parts = startupPath.split(/[/\\]/);
          const name = parts[parts.length - 1];

          setFilePath(startupPath);
          setVideoSrc(fileUrl);
          setFileName(name);
          setIsPlaying(true); // 자동 재생 활성화

          // 파일 원래 크기 조회
          try {
            const size = await invoke<number>("get_file_size", { path: startupPath });
            setOriginalFileSize(size);
          } catch (err) {
            console.error("Failed to query file size:", err);
          }
        }
      } catch (err) {
        console.error("Failed to check startup file:", err);
      }
    };
    checkStartupFile();
  }, []);

  // isPlaying 상태와 실제 비디오 엘리먼트 재생 상태 동기화
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;

    if (isPlaying) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch((err) => {
          console.warn("Autoplay in useEffect was blocked or failed:", err);
          setIsPlaying(false);
        });
      }
    } else {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoSrc]);

  // 마우스 이동 시 컨트롤 바 표시 및 자동 숨김 타이머 설정
  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    // 비디오가 로드된 상태이고, 편집 모드가 아닐 때만 2.5초 후 숨김
    if (videoSrc && !isEditMode) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, 2500);
    }
  };

  // 마우스가 윈도우 밖으로 나가면 컨트롤 바 숨김
  const handleMouseLeave = () => {
    if (videoSrc && isPlaying && !isEditMode) {
      setIsControlsVisible(false);
    }
  };

  useEffect(() => {
    // 재생 상태가 변할 때마다 컨트롤바 표시 및 자동 숨김 타이머 작동
    handleMouseMove();
  }, [isPlaying, videoSrc]);

  // requestAnimationFrame을 활용해 프로그레스바 이동을 60fps로 매끄럽게 처리
  useEffect(() => {
    let animationFrameId: number;

    const updateSmoothTime = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setSmoothTime(videoRef.current.currentTime);
        animationFrameId = requestAnimationFrame(updateSmoothTime);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateSmoothTime);
    } else {
      if (videoRef.current) {
        setSmoothTime(videoRef.current.currentTime);
      }
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, currentTime]);

  // 비디오 시간 및 기간 업데이트
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const curTime = videoRef.current.currentTime;
      setCurrentTime(curTime);
      // 재생 중에도 duration이 0이거나 실제 값과 다르면 실시간 동기화
      const videoDuration = videoRef.current.duration;
      if (videoDuration) {
        setDuration((prev) => (prev !== videoDuration ? videoDuration : prev));
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);

      // 자동 재생이 설정되어 있다면 메타데이터가 로딩되자마자 재생 실행
      if (isPlaying) {
        videoRef.current.play().catch((err) => {
          console.warn("Autoplay in handleLoadedMetadata was blocked or failed:", err);
          setIsPlaying(false);
        });
      }
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current && videoRef.current.duration) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  // 재생 / 일시정지 토글
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => console.error("Error playing video:", err));
    }
  };

  // 재생 시점 이동
  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // 음량 조절
  const handleVolumeChange = (vol: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = vol;
    setVolume(vol);
    if (vol > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  // 음소거 토글
  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  // 전체화면 토글
  const toggleFullscreen = async () => {
    try {
      const appWindow = getCurrentWindow();
      const nextFullscreen = !isFullscreen;
      await appWindow.setFullscreen(nextFullscreen);
      setIsFullscreen(nextFullscreen);
    } catch (e) {
      console.error("Failed to toggle fullscreen:", e);
    }
  };

  // 로컬 파일 열기
  const openFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "All Media Files",
            extensions: ["mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp", "png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
          {
            name: "Video",
            extensions: ["mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp"],
          },
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          }
        ],
      });

      if (selected && typeof selected === "string") {
        const fileUrl = convertFileSrc(selected);
        
        // 경로에서 파일명 추출 (Windows 경로 분리)
        const parts = selected.split(/[/\\]/);
        const name = parts[parts.length - 1];

        // 원본 절대 경로 저장
        setFilePath(selected);
        setVideoSrc(fileUrl);
        setFileName(name);
        setIsPlaying(false);
        setCurrentTime(0);
        setSmoothTime(0);
        setDuration(0);
        setIsEditMode(false); // 편집 모드 초기화
        setIsCropMode(false); // 크롭 모드 초기화
        setCropArea({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
        setCropAspectRatio("free");

        // 백엔드에서 파일 크기(용량) 정보 조회
        try {
          const size = await invoke<number>("get_file_size", { path: selected });
          setOriginalFileSize(size);
        } catch (err) {
          console.error("Failed to query file size:", err);
          setOriginalFileSize(null);
        }
        
        // 새 비디오 로드 (이미지가 아닐 때만 실행)
        const isSelectedImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(selected);
        if (!isSelectedImage) {
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.load();
              videoRef.current.play().then(() => {
                setIsPlaying(true);
              }).catch(e => console.error("Auto-play blocked or failed:", e));
            }
          }, 50);
        }
      }
    } catch (e) {
      console.error("Error opening file:", e);
    }
  };

  // 이웃 형제 미디어 로드 처리
  const handleLoadSiblingFile = (index: number) => {
    if (index < 0 || index >= siblingFiles.length) return;
    const targetPath = siblingFiles[index];
    const fileUrl = convertFileSrc(targetPath);
    const parts = targetPath.split(/[/\\]/);
    const name = parts[parts.length - 1];

    setFilePath(targetPath);
    setVideoSrc(fileUrl);
    setFileName(name);
    setIsPlaying(false);
    setCurrentTime(0);
    setSmoothTime(0);
    setDuration(0);
    setIsEditMode(false);
    setIsCropMode(false);
    setCropArea({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    setCropAspectRatio("free");

    invoke<number>("get_file_size", { path: targetPath })
      .then(setOriginalFileSize)
      .catch((err) => {
        console.error(err);
        setOriginalFileSize(null);
      });

    const isTargetImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(targetPath);
    if (!isTargetImage) {
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(e => console.warn("Auto-play failed:", e));
        }
      }, 50);
    }
  };

  // 이미지 저장 처리 (인코딩 모달 없이 다이렉트 저장)
  const handleExportImage = async () => {
    if (!filePath || !fileName) return;
    const defaultName = `cropped_${fileName}`;
    try {
      const savePath = await save({
        title: "이미지 저장 경로 선택",
        defaultPath: defaultName,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
        ],
      });

      if (!savePath) return;

      setIsExporting(true);

      let cropX: number | null = null;
      let cropY: number | null = null;
      let cropW: number | null = null;
      let cropH: number | null = null;

      if (isCropMode && imageRef.current) {
        const img = imageRef.current;
        cropX = Math.round(cropArea.x * img.naturalWidth);
        cropY = Math.round(cropArea.y * img.naturalHeight);
        cropW = Math.round(cropArea.w * img.naturalWidth);
        cropH = Math.round(cropArea.h * img.naturalHeight);
      }

      await invoke("export_image", {
        inputPath: filePath,
        outputPath: savePath,
        cropX,
        cropY,
        cropW,
        cropH,
      });

      setToastMessage({
        text: "이미지 크롭 저장이 성공적으로 완료되었습니다!",
        type: "success"
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Image export failed:", err);
      setToastMessage({
        text: `이미지 저장 실패: ${err}`,
        type: "error"
      });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveClick = () => {
    if (isImage) {
      handleExportImage();
    } else {
      setIsExportModalOpen(true);
    }
  };

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 텍스트 입력창에 포커스가 있는 경우에만 단축키 무시 (range input 등은 단축키 허용)
      const activeEl = document.activeElement as HTMLElement;
      if (
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl?.tagName === "INPUT" && (activeEl as HTMLInputElement).type !== "range")
      ) {
        return;
      }

      if (!videoSrc) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSeek(Math.max(0, currentTime - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSeek(Math.min(duration, currentTime + 5));
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.05));
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
        case "Escape":
          if (isFullscreen) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [videoSrc, isPlaying, currentTime, duration, volume, isMuted, isFullscreen]);

  // 비디오 구간 조절 핸들러
  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  // 현재 프레임을 이미지 파일로 캡처하여 저장 (바이너리 Vec<u8> 전달)
  const handleCaptureFrame = async () => {
    if (!videoRef.current || !videoSrc) return;
    const video = videoRef.current;

    const defaultName = `capture_${Math.floor(Date.now() / 1000)}.png`;
    try {
      const savePath = await save({
        title: "캡처 이미지 저장 경로 선택",
        defaultPath: defaultName,
        filters: [
          {
            name: "Image",
            extensions: ["png", "jpg", "jpeg"],
          },
        ],
      });

      if (!savePath) return;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context를 생성할 수 없습니다.");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setToastMessage({ text: "이미지 변환에 실패했습니다.", type: "error" });
          setTimeout(() => setToastMessage(null), 3000);
          return;
        }

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = Array.from(new Uint8Array(arrayBuffer));

          await invoke("save_frame", { outputPath: savePath, bytes });

          setToastMessage({ text: "프레임 캡처 및 저장이 성공적으로 완료되었습니다!", type: "success" });
          setTimeout(() => setToastMessage(null), 3000);
        } catch (err) {
          console.error("Save frame failed:", err);
          setToastMessage({ text: `이미지 저장 실패: ${err}`, type: "error" });
          setTimeout(() => setToastMessage(null), 4000);
        }
      }, "image/png");
    } catch (err) {
      console.error("Capture frame dialog failed:", err);
      setToastMessage({ text: `캡처 저장 실패: ${err}`, type: "error" });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // 비디오 편집 완료 후 인코딩/추출 프로세스 진행
  const handleExport = async (fps: string, useCopy: boolean, crf: number) => {
    if (!filePath || duration === 0) return;

    // 기본 파일 이름 제안 (예: video_edited.mp4)
    const dotIndex = fileName ? fileName.lastIndexOf(".") : -1;
    const baseName = dotIndex !== -1 ? fileName!.substring(0, dotIndex) : "edited_video";
    const ext = dotIndex !== -1 ? fileName!.substring(dotIndex + 1) : "mp4";
    const defaultSaveName = `${baseName}_edited.${ext}`;

    try {
      // Tauri 저장 다이얼로그 호출 (추출 위치 및 확장자 지정 가능)
      const savePath = await save({
        title: "편집 비디오 저장 경로 선택",
        defaultPath: defaultSaveName,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "webm", "mkv", "mov"],
          },
        ],
      });

      if (!savePath) return; // 사용자 취소 시 취소 처리

      // 인코딩 시작 즉시 모달 닫기
      setIsExportModalOpen(false);
      setIsExporting(true);

      // 백엔드 인코딩 호출 (용량 압축 수준 및 복제 여부 전달)
      let cropX: number | null = null;
      let cropY: number | null = null;
      let cropW: number | null = null;
      let cropH: number | null = null;

      if (isCropMode && videoRef.current) {
        const video = videoRef.current;
        cropX = Math.round(cropArea.x * video.videoWidth);
        cropY = Math.round(cropArea.y * video.videoHeight);
        cropW = Math.round(cropArea.w * video.videoWidth);
        cropH = Math.round(cropArea.h * video.videoHeight);
      }

      await invoke("export_video", {
        inputPath: filePath,
        outputPath: savePath,
        startTime: trimStart,
        endTime: trimEnd,
        fps: fps,
        useCopy: useCopy,
        crf: crf,
        cropX,
        cropY,
        cropW,
        cropH,
      });

      // 인앱 커스텀 토스트 알림 작동
      setToastMessage({
        text: "비디오 추출 및 저장이 성공적으로 완료되었습니다!",
        type: "success"
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Video export failed:", err);
      // 인앱 커스텀 에러 토스트 알림 작동
      setToastMessage({
        text: `비디오 추출에 실패했습니다: ${err}`,
        type: "error"
      });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  // 편집 모드 토글 (진입 시 비디오 정지 처리)
  const handleToggleEdit = () => {
    setIsEditMode((prev) => {
      const next = !prev;
      if (next) {
        if (isPlaying && videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
        // 이미지일 경우 크롭 모드(크롭 오버레이)를 자동으로 즉시 활성화
        if (isImage) {
          setIsCropMode(true);
          setTimeout(updateVideoRect, 50);
        }
      } else {
        // 편집 모드 해제 시 크롭 모드도 함께 비활성화
        if (isImage) {
          setIsCropMode(false);
        }
      }
      return next;
    });
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative flex flex-col w-screen h-screen overflow-hidden text-white bg-neutral-950/70 backdrop-blur-3xl select-none"
    >
      {/* 윈도우 투명 효과 배경 (블러 및 디테일 제어) */}
      <div className="absolute inset-0 bg-black/25 pointer-events-none z-0"></div>

      {/* 커스텀 타이틀바 (전체화면일 때는 숨김) */}
      {!isFullscreen && (
        <div className="relative z-50">
          <TitleBar fileName={fileName} />
        </div>
      )}

      {/* 인앱 커스텀 토스트 알림 메시지 */}
      {toastMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-neutral-900/90 border border-white/10 shadow-2xl text-xs text-white flex items-center gap-2.5 animate-fade-in z-50">
          {toastMessage.type === "success" ? (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/20"></span>
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-md shadow-rose-500/20"></span>
          )}
          <span className="font-medium tracking-wide">{toastMessage.text}</span>
        </div>
      )}

      {/* 메인 콘텐츠 영역 (편집 모드 시 비디오가 컨트롤 바 위로 축소되도록 바인딩) */}
      <div className={`relative flex-1 flex items-center justify-center overflow-hidden z-10 transition-all duration-300 ${
        isEditMode ? "pb-[130px]" : ""
      }`}>
        {videoSrc ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black/10">
            {/* 미디어 렌더러 (비디오 vs 이미지 분기) */}
            {isImage ? (
              <img
                ref={imageRef}
                src={videoSrc}
                onLoad={() => {
                  if (isCropMode) updateVideoRect();
                }}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <video
                ref={videoRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={handleDurationChange}
                onEnded={handleVideoEnded}
                onClick={togglePlayPause}
                className="w-full h-full object-contain cursor-pointer"
              />
            )}

            {/* 왼쪽 이동 화살표 (Hover Chevron) */}
            {currentFileIndex > 0 && (
              <div
                onClick={() => handleLoadSiblingFile(currentFileIndex - 1)}
                className="absolute left-0 top-0 bottom-0 w-24 flex items-center justify-start pl-6 group cursor-pointer z-30 select-none animate-[fadeIn_0.3s_ease-out]"
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center bg-neutral-900/60 border border-white/10 text-white/70 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-xl hover:bg-neutral-950/80 hover:text-white hover:scale-105 active:scale-95">
                  <ChevronLeft className="w-5 h-5" />
                </div>
              </div>
            )}

            {/* 오른쪽 이동 화살표 (Hover Chevron) */}
            {currentFileIndex !== -1 && currentFileIndex < siblingFiles.length - 1 && (
              <div
                onClick={() => handleLoadSiblingFile(currentFileIndex + 1)}
                className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-end pr-6 group cursor-pointer z-30 select-none animate-[fadeIn_0.3s_ease-out]"
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center bg-neutral-900/60 border border-white/10 text-white/70 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-xl hover:bg-neutral-950/80 hover:text-white hover:scale-105 active:scale-95">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            )}

            {/* 크롭 조절 박스 레이어 */}
            {isCropMode && (
              <CropOverlay
                videoRect={videoRect}
                cropArea={cropArea}
                onChange={setCropArea}
                aspectRatio={cropAspectRatio}
                onAspectRatioChange={setCropAspectRatio}
              />
            )}
          </div>
        ) : (
          /* 미디어가 없을 때의 세련된 대기 화면 (Mica 테마) */
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full animate-[fadeIn_0.5s_ease-out] relative z-20">
            {/* 오라 효과 백그라운드 */}
            <div className="absolute -inset-4 rounded-3xl bg-indigo-500/10 blur-2xl -z-10 animate-pulse"></div>

            <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-lg mb-6">
              <Film className="w-10 h-10 text-indigo-400" />
            </div>

            <h2 className="text-xl font-bold tracking-tight text-white mb-6">
              OKITA Canvas
            </h2>

            <button
              onClick={openFile}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-sm font-semibold tracking-wide text-white shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              파일 선택하기
            </button>
          </div>
        )}
      </div>

      {/* 비디오 저장 설정 모달 팝업 */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        originalFileSize={originalFileSize}
        trimDuration={trimEnd - trimStart}
        videoDuration={duration}
        onExport={handleExport}
        isExporting={isExporting}
        isCropMode={isCropMode}
        cropAreaRatio={isCropMode ? cropArea.w * cropArea.h : 1.0}
      />

      {/* 플로팅 컨트롤 바 */}
      <ControlBar
        isPlaying={isPlaying}
        onPlayPause={togglePlayPause}
        currentTime={smoothTime}
        duration={duration}
        onSeek={handleSeek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenFile={openFile}
        isVisible={isControlsVisible}
        hasVideo={!!videoSrc}
        isEditMode={isEditMode}
        onToggleEdit={handleToggleEdit}
        trimStart={trimStart}
        trimEnd={trimEnd}
        onTrimChange={handleTrimChange}
        onSaveClick={handleSaveClick}
        isCropMode={isCropMode}
        onToggleCrop={() => {
          setIsCropMode((prev) => !prev);
          // 크롭 켤 때 크기 다시 구함
          setTimeout(updateVideoRect, 50);
        }}
        onCaptureFrame={handleCaptureFrame}
        isImage={isImage}
      />

      {/* 추출 진행 중 모달 오버레이 */}
      {isExporting && (
        <div className="absolute inset-0 bg-black/75 z-50 flex flex-col items-center justify-center text-white">
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-black/40 border border-white/10 shadow-2xl max-w-sm text-center">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <h3 className="text-sm font-semibold">
              {isImage ? "이미지 크롭 및 저장 중" : "비디오 추출 및 내보내기 중"}
            </h3>
            <p className="text-xs text-white/60 leading-relaxed">
              {isImage
                ? "설정하신 구역으로 이미지를 크롭하여 저장하고 있습니다. 잠시만 기다려 주세요."
                : "설정하신 옵션으로 동영상을 변환하여 저장하고 있습니다. 시스템 및 동영상 길이에 따라 약간의 시간이 소요될 수 있으니 기다려 주세요."}
            </p>
          </div>
        </div>
      )}

      {/* 새 버전 업데이트 발견 팝업 모달 */}
      {isUpdateModalOpen && updateInfo && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center animate-[fadeIn_0.2s_ease-out] backdrop-blur-sm">
          <div className="flex flex-col gap-4 p-6 rounded-2xl bg-neutral-900/90 border border-white/10 shadow-2xl max-w-sm w-full text-center relative animate-[scaleIn_0.2s_ease-out] z-50">
            {/* 구름 다운로드 아이콘 */}
            <div className="mx-auto w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-1">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-semibold text-white">새로운 업데이트 발견!</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                OKITA Canvas의 새 버전이 출시되었습니다.<br />
                현재 버전: <span className="font-mono text-indigo-400">v0.1.2</span> ➔ 최신 버전: <span className="font-mono text-emerald-400">v{updateInfo.version}</span>
              </p>
            </div>

            {updateInfo.notes && (
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-[11px] text-left text-white/70 max-h-24 overflow-y-auto font-sans leading-relaxed">
                <span className="font-semibold block text-[10px] text-white/40 mb-1">업데이트 정보:</span>
                {updateInfo.notes}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setIsUpdateModalOpen(false)}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/5 border border-white/5 text-xs font-semibold text-white/70 transition-all duration-150 cursor-pointer"
              >
                나중에
              </button>
              <button
                onClick={async () => {
                  try {
                    await openUrl(updateInfo.url);
                  } catch (err) {
                    console.error(err);
                  }
                  setIsUpdateModalOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 cursor-pointer"
              >
                업데이트 받기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
