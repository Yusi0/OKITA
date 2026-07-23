import { useState, useRef, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TitleBar } from "./components/TitleBar";
import { ControlBar, ClipSegment } from "./components/ControlBar";
import { ExportModal, ExportOptions } from "./components/ExportModal";
import { CropOverlay } from "./components/CropOverlay";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { AnimatedGifBadge } from "./components/AnimatedGifBadge";
import { ContextMenu } from "./components/ContextMenu";
import { InfoModal } from "./components/InfoModal";
import { RatioDropdown } from "./components/RatioDropdown";
import { Video, Film, Loader2, ChevronLeft, ChevronRight, RotateCw, FlipHorizontal } from "lucide-react";
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
  const mediaContainerRef = useRef<HTMLDivElement>(null);

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

  // 시청 배속 및 음소거 상태 정의
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isEditMuted, setIsEditMuted] = useState<boolean>(false);

  // 미디어 회전 (0, 90, 180, 270) 및 반전 (flipH, flipV) 상태 정의
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleFlipH = () => setFlipH((prev) => !prev);
  const handleFlipV = () => setFlipV((prev) => !prev);

  // v0.2.0 멀티 클립 타임라인 관련 상태 및 동기식 useRef 히스토리 스택 정의
  const [clips, setClips] = useState<ClipSegment[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  
  const historyRef = useRef<ClipSegment[][]>([]);
  const historyIndexRef = useRef<number>(-1);
  const dropInsertIndexRef = useRef<number | null>(null);
  dropInsertIndexRef.current = dropInsertIndex;

  const isEditModeRef = useRef<boolean>(isEditMode);
  isEditModeRef.current = isEditMode;

  const clipsRef = useRef<ClipSegment[]>(clips);
  clipsRef.current = clips;

  // 듀얼 A/B 비디오 플레이어 및 순차 재생 상태 관리 Refs
  const [activePlayer, setActivePlayer] = useState<"A" | "B">("A");
  const activePlayerRef = useRef<"A" | "B">("A");
  activePlayerRef.current = activePlayer;

  // 커스텀 우클릭 컨텍스트 메뉴 및 정보 모달 상태
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number }>({ isOpen: false, x: 0, y: 0 });
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<"keybinds" | "about">("keybinds");

  const handleOpenInfoModal = (tab: "keybinds" | "about") => {
    setInfoModalTab(tab);
    setIsInfoModalOpen(true);
  };

  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);

  const lastValidDropIndexRef = useRef<number | null>(null);
  const currentClipIndexRef = useRef<number>(0);
  const lastDropTimeRef = useRef<number>(0);

  const getActiveVideo = (): HTMLVideoElement | null => {
    return activePlayerRef.current === "A" ? videoRefA.current : videoRefB.current;
  };

  const getStandbyVideo = (): HTMLVideoElement | null => {
    return activePlayerRef.current === "A" ? videoRefB.current : videoRefA.current;
  };

  // 장기 누름 2배속 모드(Space 및 영상 꾹 누르기) 관련 상태 및 참조 정의
  const [is2xActive, setIs2xActive] = useState<boolean>(false);
  const is2xActiveRef = useRef<boolean>(false);
  is2xActiveRef.current = is2xActive;

  const originalSpeedRef = useRef<number>(1.0);
  const spaceTimeoutRef = useRef<number | null>(null);
  const videoPressTimeoutRef = useRef<number | null>(null);
  const isSpaceLongPressRef = useRef<boolean>(false);
  const isVideoLongPressRef = useRef<boolean>(false);
  const wasVideoLongPressRef = useRef<boolean>(false);

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  const activate2xRef = useRef<() => void>(() => {});
  const deactivate2xRef = useRef<() => void>(() => {});

  const activate2xSpeed = () => {
    if (!isPlayingRef.current) return;
    setIs2xActive(true);
    originalSpeedRef.current = playbackSpeed;
    const active = getActiveVideo();
    if (active) {
      active.playbackRate = 2.0;
    }
  };

  const deactivate2xSpeed = () => {
    setIs2xActive(false);
    const active = getActiveVideo();
    if (active) {
      active.playbackRate = originalSpeedRef.current;
    }
  };

  activate2xRef.current = activate2xSpeed;
  deactivate2xRef.current = deactivate2xSpeed;

  // 연속 클립 점프 중 중복 시크 루프 방지용 락 가드
  const isJumpingRef = useRef<boolean>(false);

  // 외부 미디어 에셋 로드 시 재생 시간(duration)을 비동기로 측정하는 헬퍼
  const getAssetDuration = (path: string): Promise<number> => {
    return new Promise((resolve) => {
      const isImg = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(path);
      if (isImg) {
        resolve(5.0);
        return;
      }
      const tempVideo = document.createElement("video");
      tempVideo.src = convertFileSrc(path);
      tempVideo.onloadedmetadata = () => {
        resolve(tempVideo.duration || 5.0);
      };
      tempVideo.onerror = () => {
        resolve(5.0);
      };
    });
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    const active = getActiveVideo();
    if (active) {
      active.playbackRate = speed;
    }
  };

  const handleToggleEditMute = () => {
    setIsEditMuted((prev) => {
      const next = !prev;
      const active = getActiveVideo();
      if (active) {
        active.muted = next || isMuted;
      }
      return next;
    });
  };

  const imageRef = useRef<HTMLImageElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  // 플레이리스트 (같은 폴더 미디어 목록) 관련 상태
  const [siblingFiles, setSiblingFiles] = useState<string[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);

  // 업데이트 체크 관련 상태
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; notes?: string } | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // 현재 파일 포맷 타입 판별 헬퍼
  const isAudio = filePath ? /\.(mp3|m4a|wav|flac|aac|ogg|opus|wma)$/i.test(filePath) : false;
  const isImage = filePath ? /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(filePath) : false;
  const isAnimatedGif = filePath ? /\.(gif|webp)$/i.test(filePath) : false;

  // 실제 렌더링된 미디어 사각형 영역 계산 (회전/반전/상단 툴바 마진, 레터박스/필러박스 정밀 대응)
  const calculateMediaRenderRect = () => {
    if (!mediaContainerRef.current) return null;
    const container = mediaContainerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    if (containerW === 0 || containerH === 0) return null;

    let rawW = 0;
    let rawH = 0;

    if (isImage) {
      if (!imageRef.current || imageRef.current.naturalWidth === 0) return null;
      rawW = imageRef.current.naturalWidth;
      rawH = imageRef.current.naturalHeight;
    } else {
      const video = getActiveVideo();
      if (!video || video.videoWidth === 0) return null;
      rawW = video.videoWidth;
      rawH = video.videoHeight;
    }

    const isRotated90 = rotation === 90 || rotation === 270;
    const mediaW = isRotated90 ? rawH : rawW;
    const mediaH = isRotated90 ? rawW : rawH;
    const aspect = mediaW / mediaH;
    const containerAspect = containerW / containerH;

    let renderW = containerW;
    let renderH = containerH;
    let renderLeft = 0;
    let renderTop = 0;

    if (containerAspect > aspect) {
      renderW = containerH * aspect;
      renderLeft = (containerW - renderW) / 2;
    } else {
      renderH = containerW / aspect;
      renderTop = (containerH - renderH) / 2;
    }

    const containerRect = container.getBoundingClientRect();

    return {
      x: renderLeft,
      y: renderTop,
      left: containerRect.left + renderLeft,
      top: containerRect.top + renderTop,
      width: renderW,
      height: renderH,
    } as DOMRect;
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
    
    const targetElement = isImage ? imageRef.current : getActiveVideo();
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

  // 바탕화면 및 탐색기 드래그 앤 드롭 파일 수신 로직 (편집 모드 시 프리미어 프로 스타일 타임라인 삽입)
  useEffect(() => {
    let active = true;
    let unsubOver: (() => void) | null = null;
    let unsubLeave: (() => void) | null = null;
    let unsubDrop: (() => void) | null = null;
    
    const setupDragDrop = async () => {
      try {
        const unlistenOver = await listen<{ position?: { x: number; y: number } }>("tauri://drag-over", (event) => {
          if (!active) return;
          setIsDragOver(true);
          if (isEditModeRef.current && clipsRef.current.length > 0) {
            const pos = event.payload?.position;
            const mouseX = pos ? pos.x : window.innerWidth / 2;
            const windowWidth = window.innerWidth;
            const timelineWidth = Math.min(windowWidth * 0.9, 896);
            const timelineLeft = (windowWidth - timelineWidth) / 2;
            const mouseRatio = Math.max(0, Math.min(1, (mouseX - timelineLeft) / timelineWidth));

            const currentClips = clipsRef.current;
            const totalEditedDuration = currentClips.reduce((acc, c) => acc + (c.end - c.start), 0);

            if (totalEditedDuration > 0) {
              let accum = 0;
              const boundaries = [0];
              for (const c of currentClips) {
                accum += (c.end - c.start);
                boundaries.push(accum / totalEditedDuration);
              }

              let closestIdx = 0;
              let minDiff = Infinity;
              for (let i = 0; i < boundaries.length; i++) {
                const diff = Math.abs(boundaries[i] - mouseRatio);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = i;
                }
              }
              setDropInsertIndex(closestIdx);
              lastValidDropIndexRef.current = closestIdx;
            }
          }
        });
        if (!active) {
          unlistenOver();
          return;
        }
        unsubOver = unlistenOver;

        const unlistenLeave = await listen("tauri://drag-leave", () => {
          if (!active) return;
          setIsDragOver(false);
          setDropInsertIndex(null);
        });
        if (!active) {
          unlistenLeave();
          return;
        }
        unsubLeave = unlistenLeave;

        const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
          if (!active) return;
          setIsDragOver(false);

          // 중복 드롭 방지 (500ms 가드타임)
          const now = Date.now();
          if (now - lastDropTimeRef.current < 500) {
            return;
          }
          lastDropTimeRef.current = now;

          const payload = event.payload;
          if (payload && payload.paths && payload.paths.length > 0) {
            const droppedPath = payload.paths[0];
            const isSupported = /\.(mp4|webm|mkv|avi|mov|ogv|3gp|png|jpg|jpeg|webp|gif|bmp|mp3|m4a|wav|flac|aac|ogg|opus|wma)$/i.test(droppedPath);
            if (!isSupported) return;

            if (isEditModeRef.current && clipsRef.current.length > 0) {
              // 타깃 위치 인덱스를 비동기 await 실행 전에 미리 동기식으로 취득 및 리셋하여 중복 실행 원천 봉쇄
              const targetIdx =
                lastValidDropIndexRef.current !== null
                  ? lastValidDropIndexRef.current
                  : dropInsertIndexRef.current !== null
                  ? dropInsertIndexRef.current
                  : clipsRef.current.length;
              lastValidDropIndexRef.current = null;
              setDropInsertIndex(null);

              // 편집 모드: 프리미어 프로 스타일 가상 타임라인 클립 리플 삽입
              const dur = await getAssetDuration(droppedPath);
              const name = droppedPath.split(/[/\\]/).pop() || "asset";
              const newClip: ClipSegment = {
                id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                filePath: droppedPath,
                start: 0,
                end: dur,
                title: name,
              };

              const nextClips = [...clipsRef.current];
              nextClips.splice(targetIdx, 0, newClip);

              pushHistory(nextClips);
              setSelectedClipId(newClip.id);

              // 새로 삽입된 에셋 위치로 타임라인 마스터 시계 및 플레이헤드 즉시 이동
              let insertedTimelineStart = 0;
              for (let i = 0; i < targetIdx; i++) {
                insertedTimelineStart += (nextClips[i].end - nextClips[i].start);
              }
              currentClipIndexRef.current = targetIdx;
              setSmoothTime(insertedTimelineStart);
              setCurrentTime(insertedTimelineStart);
              smoothTimeRef.current = insertedTimelineStart;
            } else {
              // 일반 감상 모드: 신규 미디어 로드
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
              setRotation(0);
              setFlipH(false);
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
                  const v = getActiveVideo();
                  if (v) {
                    v.load();
                    v.play().then(() => {
                      setIsPlaying(true);
                    }).catch((e: unknown) => console.warn("Auto-play failed:", e));
                  }
                }, 50);
              }
            }
          }
        });
        if (!active) {
          unlistenDrop();
          return;
        }
        unsubDrop = unlistenDrop;
      } catch (err) {
        console.error("드래그 앤 드롭 이벤트 등록 실패:", err);
      }
    };

    setupDragDrop();

    return () => {
      active = false;
      if (unsubOver) unsubOver();
      if (unsubLeave) unsubLeave();
      if (unsubDrop) unsubDrop();
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

  // isPlaying 상태 및 볼륨/음소거와 실제 미디어 엘리먼트 재생 상태 동기화
  useEffect(() => {
    const active = getActiveVideo();
    if (!active || !videoSrc) return;

    active.volume = volume;
    active.muted = isMuted || isEditMuted;

    if (isPlaying) {
      if (active.paused) {
        active.play().catch((err: unknown) => {
          console.warn("Autoplay in useEffect was blocked or failed:", err);
          setIsPlaying(false);
        });
      }
    } else {
      if (!active.paused) {
        active.pause();
      }
    }
  }, [isPlaying, videoSrc, activePlayer, volume, isMuted, isEditMuted]);

  // 마우스 이동 시 컨트롤 바 표시 및 자동 숨김 타이머 설정
  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    // 미디어가 로드된 상태이고, 편집 모드가 아닐 때 자동 숨김 (사진/움짤: 1초, 비디오: 2.5초)
    if (videoSrc && !isEditMode) {
      const hideDelay = isImage ? 1000 : 2500;
      controlsTimeoutRef.current = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, hideDelay);
    }
  };

  // 마우스가 윈도우 밖으로 나가면 컨트롤 바 즉시 숨김
  const handleMouseLeave = () => {
    if (videoSrc && !isEditMode) {
      if (isImage || isPlaying) {
        if (controlsTimeoutRef.current) {
          window.clearTimeout(controlsTimeoutRef.current);
        }
        setIsControlsVisible(false);
      }
    }
  };

  useEffect(() => {
    // 재생 상태가 변할 때마다 컨트롤바 표시 및 자동 숨김 타이머 작동
    handleMouseMove();
  }, [isPlaying, videoSrc]);

  // 크롭 모드 및 회전/반전/비율 변경 시 미디어 레터박스 영역 비동기 재계산
  useEffect(() => {
    if (isCropMode) {
      const timer = setTimeout(updateVideoRect, 60);
      return () => clearTimeout(timer);
    }
  }, [isCropMode, rotation, flipH, cropAspectRatio]);

  const smoothTimeRef = useRef<number>(0);

  // 외부 파일 경로 에셋 URL 얻기 헬퍼
  const getClipSrc = (clip: ClipSegment): string => {
    if (clip.filePath && clip.filePath.trim().length > 0) {
      return convertFileSrc(clip.filePath);
    }
    return videoSrc || "";
  };

  // 마스터 타임라인 시간 -> 해당 클립 및 내부 미디어 타임스탬프 계산 헬퍼
  const getClipAtTimelineTime = (timelineT: number, currentClips: ClipSegment[]) => {
    if (!currentClips || currentClips.length === 0) return null;
    let accum = 0;
    for (let i = 0; i < currentClips.length; i++) {
      const c = currentClips[i];
      const dur = c.end - c.start;
      if (timelineT >= accum && (timelineT <= accum + dur || i === currentClips.length - 1)) {
        const offset = Math.max(0, Math.min(dur, timelineT - accum));
        return {
          clipIndex: i,
          clip: c,
          clipTimelineStart: accum,
          clipTimelineEnd: accum + dur,
          internalTime: c.start + offset,
        };
      }
      accum += dur;
    }
    return null;
  };

  // 편집 모드 시 멀티 클립 실시간 자동 범위 및 듀얼 플레이어 0ms 갭 스왑 60fps 검사
  const checkClipBoundsAndJump = (timelineT: number) => {
    if (!isEditMode || !isPlaying || clips.length === 0 || isJumpingRef.current) return;

    const totalEditedDuration = clips.reduce((acc, c) => acc + (c.end - c.start), 0);
    const activeVideo = getActiveVideo();
    const standbyVideo = getStandbyVideo();
    if (!activeVideo) return;

    // 전체 타임라인 종점 도달 ➔ 정지 및 첫 클립 복귀
    if (timelineT >= totalEditedDuration - 0.04) {
      activeVideo.pause();
      if (standbyVideo) standbyVideo.pause();
      setIsPlaying(false);

      currentClipIndexRef.current = 0;
      const firstClip = clips[0];
      const firstSrc = getClipSrc(firstClip);
      if (activeVideo.src !== firstSrc) activeVideo.src = firstSrc;
      activeVideo.currentTime = firstClip.start;

      setSmoothTime(0);
      setCurrentTime(0);
      smoothTimeRef.current = 0;
      return;
    }

    const clipIndex = currentClipIndexRef.current;
    if (clipIndex < 0 || clipIndex >= clips.length) return;

    let clipTimelineStart = 0;
    for (let k = 0; k < clipIndex; k++) {
      clipTimelineStart += (clips[k].end - clips[k].start);
    }
    const curClip = clips[clipIndex];
    const clipTimelineEnd = clipTimelineStart + (curClip.end - curClip.start);

    // 다음 클립이 존재하는 경우
    if (clipIndex < clips.length - 1) {
      const nextClip = clips[clipIndex + 1];
      const nextSrc = getClipSrc(nextClip);

      // 1. 현재 클립 재생 중 대기 플레이어(Standby Video) 사전 대기 (Pre-seek)
      if (standbyVideo) {
        if (timelineT >= clipTimelineStart && timelineT < clipTimelineEnd - 0.15) {
          if (standbyVideo.src !== nextSrc) {
            standbyVideo.src = nextSrc;
          }
          if (Math.abs(standbyVideo.currentTime - nextClip.start) > 0.08) {
            standbyVideo.currentTime = nextClip.start;
          }
        }
      }

      // 2. 현재 클립 종점(0.04초 전) 도달 시 0ms 듀얼 스왑 핫재생
      if (timelineT >= clipTimelineEnd - 0.04) {
        isJumpingRef.current = true;
        currentClipIndexRef.current = clipIndex + 1;

        if (standbyVideo) {
          if (standbyVideo.src !== nextSrc) {
            standbyVideo.src = nextSrc;
          }
          standbyVideo.playbackRate = playbackSpeed;
          standbyVideo.muted = isMuted || isEditMuted;
          standbyVideo.volume = volume;
          if (Math.abs(standbyVideo.currentTime - nextClip.start) > 0.08) {
            standbyVideo.currentTime = nextClip.start;
          }

          standbyVideo.play().then(() => {
            activeVideo.pause();
            const nextActive = activePlayerRef.current === "A" ? "B" : "A";
            activePlayerRef.current = nextActive;
            setActivePlayer(nextActive);

            setSmoothTime(clipTimelineEnd);
            setCurrentTime(clipTimelineEnd);
            smoothTimeRef.current = clipTimelineEnd;
            isJumpingRef.current = false;
          }).catch((err) => {
            console.warn("Standby video play error, falling back to direct seek:", err);
            activeVideo.src = nextSrc;
            activeVideo.currentTime = nextClip.start;
            isJumpingRef.current = false;
          });
        } else {
          activeVideo.src = nextSrc;
          activeVideo.currentTime = nextClip.start;
          isJumpingRef.current = false;
        }
      }
    }
  };

  // requestAnimationFrame을 활용해 프로그레스바 이동을 60fps로 매끄럽게 처리
  useEffect(() => {
    let animationFrameId: number;

    const updateSmoothTime = () => {
      const active = getActiveVideo();
      if (active && !active.paused) {
        if (isEditMode && clips.length > 0) {
          const idx = currentClipIndexRef.current;
          if (idx >= 0 && idx < clips.length) {
            const curClip = clips[idx];
            let clipTimelineStart = 0;
            for (let k = 0; k < idx; k++) {
              clipTimelineStart += (clips[k].end - clips[k].start);
            }
            const curInternal = active.currentTime;
            const currentTimelineT = clipTimelineStart + Math.max(0, curInternal - curClip.start);

            setSmoothTime(currentTimelineT);
            setCurrentTime(currentTimelineT);
            smoothTimeRef.current = currentTimelineT;

            checkClipBoundsAndJump(currentTimelineT);
          }
        } else {
          const cur = active.currentTime;
          setSmoothTime(cur);
          setCurrentTime(cur);
        }
        animationFrameId = requestAnimationFrame(updateSmoothTime);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateSmoothTime);
    } else {
      const active = getActiveVideo();
      if (active) {
        if (isEditMode && clips.length > 0) {
          // 일시 정지 상태 유지
        } else {
          setSmoothTime(active.currentTime);
          setCurrentTime(active.currentTime);
        }
      }
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, currentTime, clips, isEditMode, activePlayer]);

  // 재생 시간 변경 시 호출
  const handleTimeUpdate = () => {
    const active = getActiveVideo();
    if (active && !isEditMode) {
      const cur = active.currentTime;
      setCurrentTime(cur);
      setSmoothTime(cur);

      const videoDuration = active.duration;
      if (videoDuration) {
        setDuration((prev) => (prev !== videoDuration ? videoDuration : prev));
      }
    }
  };

  const handleLoadedMetadata = () => {
    const active = getActiveVideo();
    if (active) {
      active.volume = volume;
      active.muted = isMuted || isEditMuted;
      active.playbackRate = playbackSpeed;
      if (active.duration) {
        const dur = active.duration;
        setDuration(dur);
        if (clipsRef.current.length === 0) {
          setTrimStart(0);
          setTrimEnd(dur);
          const initClips: ClipSegment[] = [{ id: "clip-1", filePath: filePath || "", start: 0, end: dur, title: fileName || undefined }];
          setClips(initClips);
          setSelectedClipId("clip-1");
          historyRef.current = [initClips];
          historyIndexRef.current = 0;
        }

        if (isPlaying) {
          active.play().catch((err) => {
            console.warn("Autoplay in handleLoadedMetadata was blocked or failed:", err);
            setIsPlaying(false);
          });
        }
      }
    }
  };

  const handleDurationChange = () => {
    const active = getActiveVideo();
    if (active && active.duration) {
      const dur = active.duration;
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
    if (wasVideoLongPressRef.current) {
      wasVideoLongPressRef.current = false;
      return;
    }
    const active = getActiveVideo();
    if (!active) return;

    if (isPlaying) {
      active.pause();
      const standby = getStandbyVideo();
      if (standby && !standby.paused) standby.pause();
      setIsPlaying(false);
    } else {
      active.play().then(() => {
        setIsPlaying(true);
      }).catch(err => console.error("Error playing video:", err));
    }
  };

  // 재생 시점 이동 (편집 모드 시 timelineT 파라미터 수신)
  const handleSeek = (timelineT: number) => {
    const active = getActiveVideo();
    if (!active) return;

    if (isEditMode && clips.length > 0) {
      const activeInfo = getClipAtTimelineTime(timelineT, clips);
      if (activeInfo) {
        currentClipIndexRef.current = activeInfo.clipIndex;
        const targetSrc = getClipSrc(activeInfo.clip);
        if (active.src !== targetSrc) {
          active.src = targetSrc;
        }
        active.currentTime = activeInfo.internalTime;
      }
      setSmoothTime(timelineT);
      setCurrentTime(timelineT);
      smoothTimeRef.current = timelineT;
    } else {
      active.currentTime = timelineT;
      setCurrentTime(timelineT);
      setSmoothTime(timelineT);
      smoothTimeRef.current = timelineT;
    }
  };

  // 음량 조절
  const handleVolumeChange = (vol: number) => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;
    if (vA) vA.volume = vol;
    if (vB) vB.volume = vol;
    setVolume(vol);
    if (vol > 0 && isMuted) {
      if (vA) vA.muted = false;
      if (vB) vB.muted = false;
      setIsMuted(false);
    }
  };

  // 음소거 토글
  const toggleMute = () => {
    const vA = videoRefA.current;
    const vB = videoRefB.current;
    const nextMuted = !isMuted;
    if (vA) vA.muted = nextMuted;
    if (vB) vB.muted = nextMuted;
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
            extensions: ["mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp", "png", "jpg", "jpeg", "webp", "gif", "bmp", "mp3", "m4a", "wav", "flac", "aac", "ogg", "opus", "wma"],
          },
          {
            name: "Video",
            extensions: ["mp4", "webm", "mkv", "avi", "mov", "ogv", "3gp"],
          },
          {
            name: "Image / GIF",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
          {
            name: "Audio",
            extensions: ["mp3", "m4a", "wav", "flac", "aac", "ogg", "opus", "wma"],
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
        setRotation(0);
        setFlipH(false);
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
            const active = getActiveVideo();
            if (active) {
              active.volume = volume;
              active.muted = isMuted || isEditMuted;
              active.load();
              active.play().then(() => {
                setIsPlaying(true);
              }).catch((e: unknown) => console.error("Auto-play blocked or failed:", e));
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
    setRotation(0);
    setFlipH(false);
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
        const active = getActiveVideo();
        if (active) {
          active.volume = volume;
          active.muted = isMuted || isEditMuted;
          active.load();
          active.play().then(() => {
            setIsPlaying(true);
          }).catch((e: unknown) => console.warn("Auto-play failed:", e));
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
          if (e.repeat) return;
          isSpaceLongPressRef.current = false;
          if (spaceTimeoutRef.current) window.clearTimeout(spaceTimeoutRef.current);
          spaceTimeoutRef.current = window.setTimeout(() => {
            isSpaceLongPressRef.current = true;
            if (!isPlayingRef.current) {
              togglePlayPause();
            }
            activate2xRef.current();
          }, 300);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(Math.max(0, currentTime - (1 / 30)));
          } else if (e.ctrlKey || e.metaKey) {
            handleSeek(Math.max(0, currentTime - 1));
          } else {
            handleSeek(Math.max(0, currentTime - 5));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(Math.min(duration, currentTime + (1 / 30)));
          } else if (e.ctrlKey || e.metaKey) {
            handleSeek(Math.min(duration, currentTime + 1));
          } else {
            handleSeek(Math.min(duration, currentTime + 5));
          }
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
        case "KeyC":
          e.preventDefault();
          handleSplitClip();
          break;
        case "KeyR":
          e.preventDefault();
          handleRotate();
          break;
        case "KeyH":
          e.preventDefault();
          handleFlipH();
          break;
        case "KeyZ":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case "KeyY":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
        case "Backspace":
        case "Delete":
          if (isEditMode && selectedClipId && clips.length > 1) {
            e.preventDefault();
            handleDeleteClip();
          }
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

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const activeEl = document.activeElement as HTMLElement;
        if (
          activeEl?.tagName === "TEXTAREA" ||
          (activeEl?.tagName === "INPUT" && (activeEl as HTMLInputElement).type !== "range")
        ) {
          return;
        }
        if (!videoSrc) return;

        e.preventDefault();
        if (spaceTimeoutRef.current) {
          window.clearTimeout(spaceTimeoutRef.current);
          spaceTimeoutRef.current = null;
        }

        if (isSpaceLongPressRef.current) {
          isSpaceLongPressRef.current = false;
          deactivate2xRef.current();
        } else {
          togglePlayPause();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [videoSrc, isPlaying, currentTime, duration, volume, isMuted, isFullscreen, isEditMode, selectedClipId, clips]);

  // 클립 상태 동기식 히스토리 저장 (Undo/Redo 지원)
  const pushHistory = (newClips: ClipSegment[]) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(newClips);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setClips(newClips);
  };

  // 실행 취소 (Ctrl + Z)
  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prevClips = historyRef.current[historyIndexRef.current];
      setClips(prevClips);
      setSelectedClipId(prevClips[0]?.id || null);
    }
  };

  // 다시 실행 (Ctrl + Y / Ctrl + Shift + Z)
  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const nextClips = historyRef.current[historyIndexRef.current];
      setClips(nextClips);
      setSelectedClipId(nextClips[0]?.id || null);
    }
  };

  // 'C' 키로 현재 시간 위치에서 클립 분할 (Razor Cut)
  const handleSplitClip = () => {
    if (!isEditMode || duration === 0 || !videoSrc || clips.length === 0) return;
    const cur = currentTime;

    const activeInfo = getClipAtTimelineTime(cur, clips);
    if (!activeInfo) return;

    const { clipIndex, clip, internalTime } = activeInfo;
    // 최소 길이 가드 (분할할 클립의 남은 앞뒤 길이가 최소 0.15초 이상이어야 함)
    if (internalTime - clip.start < 0.15 || clip.end - internalTime < 0.15) {
      return;
    }

    const clipA: ClipSegment = { id: `clip-${Date.now()}-1`, filePath: clip.filePath, start: clip.start, end: internalTime, title: clip.title };
    const clipB: ClipSegment = { id: `clip-${Date.now()}-2`, filePath: clip.filePath, start: internalTime, end: clip.end, title: clip.title };

    const nextClips = [...clips];
    nextClips.splice(clipIndex, 1, clipA, clipB);
    pushHistory(nextClips);
    setSelectedClipId(clipB.id);
  };

  // 'Backspace' / 'Delete' 키로 선택한 클립 리플 삭제 (Ripple Cut)
  const handleDeleteClip = (targetIdParam?: string) => {
    if (!isEditMode || clips.length <= 1) return;
    const targetId = targetIdParam || selectedClipId;
    if (!targetId) return;

    const nextClips = clips.filter((c) => c.id !== targetId);
    if (nextClips.length === 0) return;

    pushHistory(nextClips);
    setSelectedClipId(nextClips[0].id);
  };

  // 현재 프레임을 이미지 파일로 캡처하여 저장 (바이너리 Vec<u8> 전달)
  const handleCaptureFrame = async () => {
    const video = getActiveVideo();
    if (!video || !videoSrc) return;

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
      const isRotated90 = rotation === 90 || rotation === 270;
      const canvasW = isRotated90 ? video.videoHeight : video.videoWidth;
      const canvasH = isRotated90 ? video.videoWidth : video.videoHeight;
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context를 생성할 수 없습니다.");

      ctx.save();
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, -video.videoWidth / 2, -video.videoHeight / 2, video.videoWidth, video.videoHeight);
      ctx.restore();

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

  // 비디오/움짤/오디오 편집 완료 후 인코딩/추출 프로세스 진행
  const handleExport = async (options: ExportOptions) => {
    if (!filePath || duration === 0) return;

    const {
      exportType,
      fps,
      useCopy,
      crf,
      exportSpeed,
      gifFps,
      gifQuality,
      gifFormat,
      audioBitrate,
      audioFormat
    } = options;

    const dotIndex = fileName ? fileName.lastIndexOf(".") : -1;
    const baseName = dotIndex !== -1 ? fileName!.substring(0, dotIndex) : "edited_media";

    let defaultExt = "mp4";
    let filterName = "Video";
    let filterExtensions = ["mp4", "webm", "mkv", "mov"];

    if (exportType === "gif") {
      defaultExt = gifFormat;
      filterName = gifFormat === "gif" ? "Animated GIF" : "Animated WebP";
      filterExtensions = [gifFormat];
    } else if (exportType === "audio") {
      defaultExt = audioFormat;
      filterName = "Audio";
      filterExtensions = [audioFormat];
    } else {
      const srcExt = dotIndex !== -1 ? fileName!.substring(dotIndex + 1).toLowerCase() : "mp4";
      if (["mp4", "webm", "mkv", "mov", "avi"].includes(srcExt)) {
        defaultExt = srcExt;
      }
    }

    const defaultSaveName = `${baseName}_edited.${defaultExt}`;

    try {
      const savePath = await save({
        title:
          exportType === "gif"
            ? "움짤 저장 경로 선택"
            : exportType === "audio"
            ? "오디오 저장 경로 선택"
            : "편집 비디오 저장 경로 선택",
        defaultPath: defaultSaveName,
        filters: [
          {
            name: filterName,
            extensions: filterExtensions,
          },
        ],
      });

      if (!savePath) return;

      setIsExportModalOpen(false);
      setIsExporting(true);

      let cropX: number | null = null;
      let cropY: number | null = null;
      let cropW: number | null = null;
      let cropH: number | null = null;

      const video = getActiveVideo();
      if (isCropMode && video) {
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
        exportSpeed,
        isMuted: isEditMuted,
        rotation,
        flipH,
        flipV,
        exportType,
        gifFps,
        gifQuality,
        gifFormat,
        audioBitrate,
        audioFormat,
        segments: clips.map((c) => ({
          id: c.id,
          filePath: c.filePath || filePath || "",
          file_path: c.filePath || filePath || "",
          start: c.start,
          end: c.end,
        })),
      });

      const successMessage =
        exportType === "gif"
          ? "움짤 추출 및 저장이 성공적으로 완료되었습니다!"
          : exportType === "audio"
          ? "오디오 추출 및 저장이 성공적으로 완료되었습니다!"
          : "비디오 추출 및 저장이 성공적으로 완료되었습니다!";

      setToastMessage({
        text: successMessage,
        type: "success"
      });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Export failed:", err);
      setToastMessage({
        text: `추출에 실패했습니다: ${err}`,
        type: "error"
      });
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  // 편집 모드 토글 (모드 전환 시 배속, 구간, 클립, 크롭, 음소거 등 편집 내역 전면 초기화)
  const handleToggleEdit = () => {
    // 배속 및 음소거 초기화
    setPlaybackSpeed(1.0);
    setIsEditMuted(false);
    const active = getActiveVideo();
    if (active) {
      active.playbackRate = 1.0;
      active.muted = isMuted;
    }
    // 클립 상태 및 히스토리 초기화
    const initClips: ClipSegment[] = [{ id: "clip-1", filePath: filePath || "", start: 0, end: duration, title: fileName || undefined }];
    setClips(initClips);
    setSelectedClipId("clip-1");
    historyRef.current = [initClips];
    historyIndexRef.current = 0;
    setTrimStart(0);
    setTrimEnd(duration);
    setIsCropMode(false);
    setCropArea({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    setCropAspectRatio("free");

    setIsEditMode((prev) => {
      const next = !prev;
      if (next) {
        const currentActive = getActiveVideo();
        if (isPlaying && currentActive) {
          currentActive.pause();
          setIsPlaying(false);
        }
        // 이미지일 경우 크롭 모드(크롭 오버레이)를 자동으로 즉시 활성화
        if (isImage) {
          setIsCropMode(true);
          setTimeout(updateVideoRect, 50);
        }
      }
      return next;
    });
  };

  const handleVideoMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isImage) return;
    if (!isPlayingRef.current) return;

    isVideoLongPressRef.current = false;
    if (videoPressTimeoutRef.current) window.clearTimeout(videoPressTimeoutRef.current);
    videoPressTimeoutRef.current = window.setTimeout(() => {
      isVideoLongPressRef.current = true;
      activate2xSpeed();
    }, 300);
  };

  const handleVideoMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0 || isImage) return;
    if (videoPressTimeoutRef.current) {
      window.clearTimeout(videoPressTimeoutRef.current);
      videoPressTimeoutRef.current = null;
    }

    if (isVideoLongPressRef.current) {
      isVideoLongPressRef.current = false;
      wasVideoLongPressRef.current = true;
      deactivate2xSpeed();
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleVideoMouseLeave = () => {
    if (videoPressTimeoutRef.current) {
      window.clearTimeout(videoPressTimeoutRef.current);
      videoPressTimeoutRef.current = null;
    }
    if (isVideoLongPressRef.current) {
      isVideoLongPressRef.current = false;
      deactivate2xSpeed();
    }
  };

  const handleVideoTouchStart = () => {
    if (isImage) return;
    if (!isPlayingRef.current) return;

    isVideoLongPressRef.current = false;
    if (videoPressTimeoutRef.current) window.clearTimeout(videoPressTimeoutRef.current);
    videoPressTimeoutRef.current = window.setTimeout(() => {
      isVideoLongPressRef.current = true;
      activate2xSpeed();
    }, 300);
  };

  const handleVideoTouchEnd = (e: React.TouchEvent) => {
    if (isImage) return;
    if (videoPressTimeoutRef.current) {
      window.clearTimeout(videoPressTimeoutRef.current);
      videoPressTimeoutRef.current = null;
    }
    if (isVideoLongPressRef.current) {
      isVideoLongPressRef.current = false;
      wasVideoLongPressRef.current = true;
      deactivate2xSpeed();
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleVideoTouchCancel = () => {
    if (isImage) return;
    if (videoPressTimeoutRef.current) {
      window.clearTimeout(videoPressTimeoutRef.current);
      videoPressTimeoutRef.current = null;
    }
    if (isVideoLongPressRef.current) {
      isVideoLongPressRef.current = false;
      deactivate2xSpeed();
    }
  };

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
      if (spaceTimeoutRef.current) {
        window.clearTimeout(spaceTimeoutRef.current);
      }
      if (videoPressTimeoutRef.current) {
        window.clearTimeout(videoPressTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY });
      }}
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

      {/* 메인 콘텐츠 영역 (크롭 모드 시 상단 마진 pt-[52px], 편집 모드 시 하단 pb-[130px]) */}
      <div
        ref={mediaContainerRef}
        className={`relative flex-1 flex items-center justify-center overflow-hidden z-10 transition-all duration-300 ${
          isCropMode ? "pt-[52px]" : ""
        } ${isEditMode ? "pb-[130px]" : ""}`}
      >
        {videoSrc ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black/10">
            {/* 크롭 모드 전용 우상단 플로팅 툴바 (아이콘 단독 & 커스텀 비율 드롭다운) */}
            {isCropMode && (
              <div className="absolute top-3 right-4 z-50 flex items-center gap-1.5 p-1.5 px-2 rounded-2xl bg-neutral-900/90 border border-white/10 shadow-2xl backdrop-blur-2xl text-xs text-white/90 animate-[fadeIn_0.2s_ease-out]">
                {/* 90도 회전 (아이콘 단독) */}
                <button
                  type="button"
                  onClick={() => {
                    handleRotate();
                    setTimeout(updateVideoRect, 50);
                  }}
                  title="90도 시계방향 회전 (R)"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 active:bg-white/10 transition-all cursor-pointer"
                >
                  <RotateCw className="w-4 h-4 text-indigo-400" />
                </button>

                {/* 좌우 반전 (아이콘 단독) */}
                <button
                  type="button"
                  onClick={() => {
                    handleFlipH();
                    setTimeout(updateVideoRect, 50);
                  }}
                  title="좌우 거울 반전 (H)"
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    flipH
                      ? "bg-indigo-600/80 text-white font-semibold shadow-md shadow-indigo-600/30"
                      : "bg-white/5 hover:bg-white/15 active:bg-white/10 text-white/90"
                  }`}
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>

                <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

                {/* 비율 선택 커스텀 드롭다운 */}
                <RatioDropdown
                  aspectRatio={cropAspectRatio}
                  onChange={(ratio) => {
                    setCropAspectRatio(ratio);
                    setTimeout(updateVideoRect, 50);
                  }}
                />

                <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

                {/* 완료 버튼 */}
                <button
                  type="button"
                  onClick={() => setIsCropMode(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  완료
                </button>
              </div>
            )}

            {/* 움짤 배지 */}
            <AnimatedGifBadge isAnimatedGif={isAnimatedGif} filePath={filePath} />

            {/* 오디오 비주얼라이저 오버레이 */}
            <AudioVisualizer
              isAudio={isAudio}
              isPlaying={isPlaying}
              filePath={filePath}
              fileName={fileName || ""}
            />
            {/* 미디어 렌더러 (비디오 vs 이미지 분기 & 회전/반전 정밀 스타일) */}
            {isImage ? (
              <img
                ref={imageRef}
                src={videoSrc}
                onLoad={() => {
                  if (isCropMode) updateVideoRect();
                }}
                style={{
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                  transition: "transform 0.15s ease-out",
                  ...((rotation === 90 || rotation === 270) && videoRect
                    ? {
                        width: `${videoRect.height}px`,
                        height: `${videoRect.width}px`,
                        maxWidth: "none",
                        maxHeight: "none",
                      }
                    : {
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }),
                }}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div
                className="relative w-full h-full flex items-center justify-center cursor-default"
                style={{
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                  transition: "transform 0.15s ease-out",
                  ...((rotation === 90 || rotation === 270) && videoRect
                    ? {
                        width: `${videoRect.height}px`,
                        height: `${videoRect.width}px`,
                        maxWidth: "none",
                        maxHeight: "none",
                      }
                    : {
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }),
                }}
                onMouseDown={handleVideoMouseDown}
                onMouseUp={handleVideoMouseUp}
                onMouseLeave={handleVideoMouseLeave}
                onTouchStart={handleVideoTouchStart}
                onTouchEnd={handleVideoTouchEnd}
                onTouchCancel={handleVideoTouchCancel}
              >
                <video
                  ref={videoRefA}
                  src={videoSrc}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onDurationChange={handleDurationChange}
                  onEnded={handleVideoEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => {
                    if (!isJumpingRef.current && activePlayer === "A") {
                      setIsPlaying(false);
                    }
                  }}
                  className={`w-full h-full object-contain absolute inset-0 transition-opacity duration-75 ${
                    activePlayer === "A" ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
                  }`}
                />
                <video
                  ref={videoRefB}
                  src={videoSrc}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onDurationChange={handleDurationChange}
                  onEnded={handleVideoEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => {
                    if (!isJumpingRef.current && activePlayer === "B") {
                      setIsPlaying(false);
                    }
                  }}
                  className={`w-full h-full object-contain absolute inset-0 transition-opacity duration-75 ${
                    activePlayer === "B" ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
                  }`}
                />
              </div>
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
                onRotate={handleRotate}
                onFlipH={handleFlipH}
                flipH={flipH}
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
        trimDuration={
          isEditMode && clips.length > 0
            ? clips.reduce((acc, c) => acc + (c.end - c.start), 0)
            : trimEnd - trimStart
        }
        videoDuration={duration}
        onExport={handleExport}
        isExporting={isExporting}
        isCropMode={isCropMode}
        cropAreaRatio={isCropMode ? cropArea.w * cropArea.h : 1.0}
        initialExportSpeed={playbackSpeed}
        videoSrc={videoSrc}
        filePath={filePath}
        trimStart={trimStart}
        trimEnd={trimEnd}
        initialTab={isAnimatedGif ? "gif" : isAudio ? "audio" : "video"}
        isAudioOnly={isAudio}
        cropArea={cropArea}
        clips={clips}
        rotation={rotation}
        flipH={flipH}
        flipV={flipV}
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
        isVisible={isControlsVisible && !is2xActive}
        hasVideo={!!videoSrc}
        isEditMode={isEditMode}
        onToggleEdit={handleToggleEdit}
        trimStart={trimStart}
        trimEnd={trimEnd}
        onTrimChange={() => {}}
        onSaveClick={handleSaveClick}
        isCropMode={isCropMode}
        onToggleCrop={() => {
          setIsCropMode((prev) => !prev);
          // 크롭 켤 때 크기 다시 구함
          setTimeout(updateVideoRect, 50);
        }}
        onCaptureFrame={handleCaptureFrame}
        isImage={isImage}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={handlePlaybackSpeedChange}
        videoSrc={videoSrc}
        isEditMuted={isEditMuted}
        onToggleEditMute={handleToggleEditMute}
        clips={clips}
        selectedClipId={selectedClipId}
        onSelectClip={(id) => setSelectedClipId(id)}
        dropInsertIndex={dropInsertIndex}
        isDraggingAsset={isDragOver}
        rotation={rotation}
        flipH={flipH}
        flipV={flipV}
        onRotate={handleRotate}
        onFlipH={handleFlipH}
        onFlipV={handleFlipV}
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

      {/* 커스텀 우클릭 컨텍스트 메뉴 */}
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        isOpen={contextMenu.isOpen}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        playbackSpeed={playbackSpeed}
        onCaptureFrame={handleCaptureFrame}
        onPlaybackSpeedChange={handlePlaybackSpeedChange}
        onOpenInfoModal={handleOpenInfoModal}
        onRotate={handleRotate}
        onFlipH={handleFlipH}
        flipH={flipH}
      />

      {/* 단축키 목록 및 제작자(Yusi0) / 깃허브 정보 모달 */}
      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        initialTab={infoModalTab}
      />
    </div>
  );
}

export default App;
