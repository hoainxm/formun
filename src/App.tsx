import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileDown,
  Grid3X3,
  HelpCircle,
  Move,
  Moon,
  Play,
  Plus,
  Save,
  Share2,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Choreography, Dancer, DancerPosition, DragState, Formation, StageProp } from "./types/choreography";
import { clamp, createId, detectTrafficConflicts, formatTimestamp, getDefaultPosition, getPreviousFormation, getSortedDancers, getSortedFormations, snap } from "./lib/geometry";
import { createDemoChoreography, dancerColors, hasMigratedToFirebase, loadStoredChoreographies, markMigratedToFirebase, touchChoreography } from "./lib/storage";
import { exportChoreographyPdf, type ExportPdfOptions } from "./lib/choreographyPdf";
import { deleteCloudProject, loadCloudProjects, saveCloudProject } from "./lib/choreographyCloud";
import { auth, authPersistenceReady, firebaseEnabled } from "./lib/firebaseClient";

const shapeOptions = ["circle", "square", "triangle"] as const;
const propShapeOptions = ["rectangle", "circle"] as const;

const Button = ({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) => {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "border border-border bg-card text-foreground hover:bg-muted",
    ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  };
  return (
    <button
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="grid gap-1 text-xs font-semibold">
    <span>{label}</span>
    {children}
  </label>
);

const inputClass = "min-h-8 min-w-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const panelClass = "min-w-0 rounded-xl border border-border bg-card p-3 shadow-panel";
const groupClass = "flex shrink-0 flex-nowrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1 lg:flex-wrap";

const nowIso = () => new Date().toISOString();
const SHARE_PREFIX = "#share=";
const BUILD_SESSION_KEY = "formun.lastBuildId.v1";

const encodeShareData = (choreography: Choreography) => {
  const bytes = new TextEncoder().encode(JSON.stringify(choreography));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const decodeShareData = (payload: string): Choreography | null => {
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Choreography;
  } catch {
    return null;
  }
};

const loadSharedChoreography = () => {
  if (!window.location.hash.startsWith(SHARE_PREFIX)) return null;
  return decodeShareData(window.location.hash.slice(SHARE_PREFIX.length));
};

const getDancerPath = (from: DancerPosition, to: DancerPosition) => {
  const path = to.path;
  if (path?.type === "curve") {
    const controlX = path.controlX ?? (from.x + to.x) / 2;
    const controlY = path.controlY ?? Math.min(from.y, to.y) - 10;
    return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
  }
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
};

const getAnimatedPosition = (
  from: { x: number; y: number },
  to: DancerPosition,
  progress: number,
) => {
  const t = clamp(progress, 0, 1);
  if (to.path?.type === "curve") {
    const controlX = to.path.controlX ?? (from.x + to.x) / 2;
    const controlY = to.path.controlY ?? Math.min(from.y, to.y) - 10;
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT * oneMinusT * from.x + 2 * oneMinusT * t * controlX + t * t * to.x,
      y: oneMinusT * oneMinusT * from.y + 2 * oneMinusT * t * controlY + t * t * to.y,
    };
  }
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
};

const copy = {
  en: {
    brand: "For Mun",
    createFirst: "Create your first project",
    saveName: "Save",
    duplicate: "Duplicate",
    import: "Import",
    exportPdf: "Export PDF",
    share: "Share",
    shareCopied: "Share link copied.",
    shareCopyFailed: "Could not copy link. Copy URL from address bar.",
    shareTooLarge: "Share link is long. It still works, but JSON export is safer for big projects.",
    cancel: "Cancel",
    confirm: "Confirm",
    ok: "OK",
    language: "Language",
    present: "Present",
    light: "Light",
    dark: "Dark",
    guide: "Guide",
    projects: "Projects",
    searchProjects: "Search projects",
    localSaveNote: "Progress saves automatically on this device.",
    cloudSave: "Cloud save",
    accountHint: "Admin provides your account.",
    email: "Email",
    password: "Password",
    login: "Login",
    logout: "Logout",
    saving: "Saving...",
    saved: "Saved",
    saveFailed: "Save failed",
    firebaseMissing: "Firebase is not configured. Add Vercel env variables.",
    loginFailed: "Login failed",
    loadingProjects: "Loading projects...",
    importLocalTitle: "Import local projects?",
    importLocalMessage: "Local projects were found on this device. Import them to your account now?",
    importLocal: "Import local",
    skipImport: "Skip",
    formations: "formations",
    dancers: "dancers",
    stage: "Stage",
    width: "Width",
    height: "Height",
    grid: "Grid",
    snap: "Snap",
    paths: "Paths",
    music: "Music",
    transitionSeconds: "Transition seconds",
    formation: "Formation",
    name: "Name",
    time: "Time",
    duration: "Duration",
    comments: "Comments",
    props: "Props",
    shape: "Shape",
    color: "Color",
    locked: "Locked",
    deleteProp: "Delete prop",
    selectProp: "Select a prop on stage.",
    selection: "Selection",
    label: "Label",
    createPath: "Create path",
    recreatePath: "Recreate path",
    straight: "Straight",
    pathHint: "Select dancer, press Create path, then drag round point on stage to shape curve.",
    pathScope: "Path belongs to selected dancer in current formation. It controls movement from previous formation to current formation only.",
    pathSteps: "Workflow: duplicate formation, move dancer to new position, select dancer, press Create path, drag round point to avoid crossings.",
    pathControlHint: "Round point on stage controls path. Drag it so dancer moves around other dancers.",
    pathUnavailable: "Path starts from second formation onward. Duplicate or choose next formation, move dancer, then press Create path.",
    deleteDancer: "Delete dancer",
    selectDancer: "Select a dancer on stage or list.",
    includePaths: "Include paths",
    includeComments: "Include comments",
    labels: "Labels",
    savePdf: "Save PDF",
    deleteProject: "Delete project",
    timeline: "Timeline",
    addFormation: "Formation",
    pathConflicts: "path conflicts",
    prev: "Prev",
    next: "Next",
    exit: "Exit",
    replay: "Replay",
    comment: "Comment",
    noNotes: "No notes for this formation.",
  },
  vi: {
    brand: "For Mun",
    createFirst: "Tạo project đầu tiên",
    saveName: "Lưu",
    duplicate: "Nhân bản",
    import: "Nhập",
    exportPdf: "Xuất PDF",
    share: "Chia sẻ",
    shareCopied: "Đã copy link chia sẻ.",
    shareCopyFailed: "Không copy được link. Hãy copy URL trên thanh địa chỉ.",
    shareTooLarge: "Link chia sẻ khá dài. Vẫn dùng được, nhưng JSON export an toàn hơn cho project lớn.",
    cancel: "Hủy",
    confirm: "Xác nhận",
    ok: "OK",
    language: "Ngôn ngữ",
    present: "Trình chiếu",
    light: "Sáng",
    dark: "Tối",
    guide: "Hướng dẫn",
    projects: "Dự án",
    searchProjects: "Tìm project",
    localSaveNote: "Tiến độ tự lưu trên thiết bị này.",
    cloudSave: "Lưu cloud",
    accountHint: "Admin cung cấp tài khoản cho bạn.",
    email: "Email",
    password: "Mật khẩu",
    login: "Đăng nhập",
    logout: "Đăng xuất",
    saving: "Đang lưu...",
    saved: "Đã lưu",
    saveFailed: "Lưu lỗi",
    firebaseMissing: "Chưa cấu hình Firebase. Hãy thêm biến môi trường trên Vercel.",
    loginFailed: "Đăng nhập thất bại",
    loadingProjects: "Đang tải project...",
    importLocalTitle: "Nhập project local?",
    importLocalMessage: "Tìm thấy project local trên thiết bị này. Nhập lên tài khoản của bạn ngay?",
    importLocal: "Nhập local",
    skipImport: "Bỏ qua",
    formations: "đội hình",
    dancers: "dancer",
    stage: "Sân khấu",
    width: "Rộng",
    height: "Cao",
    grid: "Lưới",
    snap: "Bám lưới",
    paths: "Đường đi",
    music: "Nhạc",
    transitionSeconds: "Thời gian chuyển",
    formation: "Đội hình",
    name: "Tên",
    time: "Thời điểm",
    duration: "Thời lượng",
    comments: "Ghi chú",
    props: "Đạo cụ",
    shape: "Hình",
    color: "Màu",
    locked: "Khóa",
    deleteProp: "Xóa prop",
    selectProp: "Chọn prop trên stage.",
    selection: "Đang chọn",
    label: "Nhãn",
    createPath: "Tạo path",
    recreatePath: "Tạo lại path",
    straight: "Đường thẳng",
    pathHint: "Chọn dancer, bấm Tạo path, rồi kéo chấm tròn trên stage để chỉnh đường cong.",
    pathScope: "Path thuộc dancer đang chọn trong formation hiện tại. Nó chỉ điều khiển đường đi từ formation trước sang formation hiện tại.",
    pathSteps: "Cách làm: duplicate formation, kéo dancer tới vị trí mới, chọn dancer, bấm Tạo path, kéo chấm tròn để tránh giao nhau.",
    pathControlHint: "Chấm tròn trên stage là điểm điều khiển path. Kéo chấm để dancer đi vòng, tránh va chạm với dancer khác.",
    pathUnavailable: "Path được tạo từ formation thứ hai trở đi. Hãy Duplicate hoặc chọn formation tiếp theo, di chuyển dancer, rồi bấm Tạo path.",
    deleteDancer: "Xóa dancer",
    selectDancer: "Chọn dancer trên stage hoặc trong danh sách.",
    includePaths: "Bao gồm paths",
    includeComments: "Bao gồm ghi chú",
    labels: "Nhãn",
    savePdf: "Lưu PDF",
    deleteProject: "Xóa project",
    timeline: "Timeline",
    addFormation: "Đội hình",
    pathConflicts: "xung đột path",
    prev: "Trước",
    next: "Tiếp",
    exit: "Thoát",
    replay: "Phát lại",
    comment: "Ghi chú",
    noNotes: "Formation này chưa có ghi chú.",
  },
} as const;

const createBlankChoreography = (): Choreography => {
  const id = createId();
  const formationId = createId();
  return {
    id,
    name: "Untitled choreography",
    description: "",
    tags: [],
    stage: {
      width: 80,
      height: 60,
      gridSize: 5,
      backgroundOpacity: 0.35,
    },
    music: {
      name: "",
    },
    dancers: [],
    formations: [
      {
        id: formationId,
        name: "Formation 1",
        timestampSeconds: 0,
        durationSeconds: 16,
        comments: "",
        positions: {},
        sortOrder: 0,
      },
    ],
    props: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
};

const App = () => {
  const [sharedChoreography] = useState(() => loadSharedChoreography());
  const sharedMode = Boolean(sharedChoreography);
  const [items, setItems] = useState<Choreography[]>(() => {
    return sharedChoreography ? [sharedChoreography] : [];
  });
  const [activeId, setActiveId] = useState(() => {
    return sharedChoreography?.id || "";
  });
  const [activeFormationId, setActiveFormationId] = useState("");
  const [selectedDancerId, setSelectedDancerId] = useState("");
  const [selectedPropId, setSelectedPropId] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [presentMode, setPresentMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [language, setLanguage] = useState<"en" | "vi">("en");
  const [draftProjectName, setDraftProjectName] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!sharedMode);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [cloudLoaded, setCloudLoaded] = useState(sharedMode);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">(sharedMode ? "idle" : "saved");
  const [migrationItems, setMigrationItems] = useState<Choreography[] | null>(null);
  const [transitionSeconds, setTransitionSeconds] = useState(6);
  const [transitionSecondsText, setTransitionSecondsText] = useState("6");
  const [animationProgress, setAnimationProgress] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel?: string; onConfirm: () => void } | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [pdfOptions, setPdfOptions] = useState<ExportPdfOptions>({
    includePaths: true,
    includeComments: true,
    labelMode: "label",
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const animationRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = copy[language].brand;
  }, [language]);

  useEffect(() => {
    if (sharedMode) return;
    const firebaseAuth = auth;
    if (!firebaseEnabled || !firebaseAuth) {
      setAuthLoading(false);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    authPersistenceReady.then(async () => {
      const previousBuildId = localStorage.getItem(BUILD_SESSION_KEY);
      if (previousBuildId !== __FORMUN_BUILD_ID__) {
        localStorage.setItem(BUILD_SESSION_KEY, __FORMUN_BUILD_ID__);
        await signOut(firebaseAuth).catch(() => undefined);
      }
      unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        setAuthUser(user);
        setAuthLoading(false);
        if (!user) {
          setItems([]);
          setActiveId("");
          setActiveFormationId("");
          setCloudLoaded(false);
          setSaveStatus("idle");
        }
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, [sharedMode]);

  useEffect(() => {
    if (sharedMode || !authUser) return;
    let cancelled = false;
    setAuthLoading(true);
    setCloudLoaded(false);
    loadCloudProjects(authUser.uid)
      .then(async (projects) => {
        if (cancelled) return;
        if (projects.length > 0) {
          setItems(projects);
          setActiveId(projects[0]?.id || "");
          setActiveFormationId(projects[0]?.formations[0]?.id || "");
        } else {
          const localItems = hasMigratedToFirebase() ? [] : loadStoredChoreographies();
          if (localItems.length > 0) {
            setMigrationItems(localItems);
          } else {
            const demo = createDemoChoreography();
            await saveCloudProject(authUser.uid, demo);
            if (cancelled) return;
            setItems([demo]);
            setActiveId(demo.id);
            setActiveFormationId(demo.formations[0]?.id || "");
          }
        }
        setCloudLoaded(true);
        setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("failed"))
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sharedMode, authUser]);

  useEffect(() => {
    if (sharedMode || !authUser || !cloudLoaded || items.length === 0) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = window.setTimeout(() => {
      Promise.all(items.map((item) => saveCloudProject(authUser.uid, item)))
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("failed"));
    }, 1000);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [sharedMode, authUser, cloudLoaded, items]);

  const active = useMemo(
    () => items.find((item) => item.id === activeId) || items[0],
    [activeId, items],
  );

  useEffect(() => {
    setDraftProjectName(active?.name || "");
  }, [active?.id]);

  const sortedFormations = useMemo(() => (active ? getSortedFormations(active) : []), [active]);
  const activeFormation = useMemo(
    () => sortedFormations.find((formation) => formation.id === activeFormationId) || sortedFormations[0],
    [activeFormationId, sortedFormations],
  );

  useEffect(() => {
    const seconds = Math.max(0.1, activeFormation?.durationSeconds || 6);
    setTransitionSeconds(seconds);
    setTransitionSecondsText(String(seconds));
  }, [activeFormation?.id, activeFormation?.durationSeconds]);
  const previousFormation = useMemo(
    () => (active && activeFormation ? getPreviousFormation(sortedFormations, activeFormation.id) : undefined),
    [active, activeFormation, sortedFormations],
  );
  const sortedDancers = useMemo(() => (active ? getSortedDancers(active) : []), [active]);
  const selectedDancer = sortedDancers.find((dancer) => dancer.id === selectedDancerId);
  const visibleProps = useMemo(
    () => active?.props.filter((prop) => !prop.formationId || prop.formationId === activeFormation?.id) || [],
    [active, activeFormation],
  );
  const selectedProp = visibleProps.find((prop) => prop.id === selectedPropId);
  const conflicts = useMemo(
    () => (activeFormation ? detectTrafficConflicts(activeFormation, previousFormation) : []),
    [activeFormation, previousFormation],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const term = query.trim().toLowerCase();
        if (!term) return true;
        return item.name.toLowerCase().includes(term) || item.tags.some((tag) => tag.toLowerCase().includes(term));
      }),
    [items, query],
  );
  const activeFormationIndex = sortedFormations.findIndex((formation) => formation.id === activeFormation?.id);
  const t = copy[language];
  const saveStatusLabel = saveStatus === "saving" ? t.saving : saveStatus === "failed" ? t.saveFailed : saveStatus === "saved" ? t.saved : "";
  const activeTransitionSeconds = Math.max(0.1, activeFormation?.durationSeconds || transitionSeconds || 6);
  const updateTransitionSeconds = (value: string) => {
    const normalized = value.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(normalized)) return;
    setTransitionSecondsText(value);
    if (!normalized || normalized === ".") return;
    const seconds = Number(normalized);
    if (!Number.isFinite(seconds)) return;
    const next = Math.max(0.1, seconds);
    setTransitionSeconds(next);
    updateFormation(activeFormation.id, (formation) => ({ ...formation, durationSeconds: next }));
  };
  const requestConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel: string = t.confirm) => {
    setConfirmDialog({ title, message, onConfirm, confirmLabel });
  };
  const showNotice = (title: string, message: string) => {
    setNoticeDialog({ title, message });
  };
  const handleLogin = async () => {
    if (!auth) return;
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginPassword("");
    } catch (error) {
      showNotice(t.loginFailed, error instanceof Error ? error.message : t.loginFailed);
    } finally {
      setAuthLoading(false);
    }
  };
  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
  };
  const importLocalProjects = async () => {
    if (!authUser || !migrationItems) return;
    setAuthLoading(true);
    try {
      await Promise.all(migrationItems.map((item) => saveCloudProject(authUser.uid, item)));
      markMigratedToFirebase();
      setItems(migrationItems);
      setActiveId(migrationItems[0]?.id || "");
      setActiveFormationId(migrationItems[0]?.formations[0]?.id || "");
      setMigrationItems(null);
      setCloudLoaded(true);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    } finally {
      setAuthLoading(false);
    }
  };
  const skipLocalImport = async () => {
    if (!authUser) return;
    const demo = createDemoChoreography();
    setAuthLoading(true);
    try {
      await saveCloudProject(authUser.uid, demo);
      markMigratedToFirebase();
      setItems([demo]);
      setActiveId(demo.id);
      setActiveFormationId(demo.formations[0]?.id || "");
      setMigrationItems(null);
      setCloudLoaded(true);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    } finally {
      setAuthLoading(false);
    }
  };
  const goToFormation = (index: number) => {
    if (sortedFormations.length === 0) return;
    const nextIndex = clamp(index, 0, sortedFormations.length - 1);
    setActiveFormationId(sortedFormations[nextIndex].id);
    setAnimationProgress(nextIndex > 0 ? 0 : 1);
    setIsAnimating(nextIndex > 0);
  };
  const startTransitionPlayback = () => {
    if (!previousFormation || !activeFormation || !isAnimating) return;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    const startedAt = performance.now();
    const duration = activeTransitionSeconds * 1000;
    const tick = (timestamp: number) => {
      const progress = clamp((timestamp - startedAt) / duration, 0, 1);
      setAnimationProgress(progress);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        setIsAnimating(false);
      }
    };
    animationRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (!active && items.length > 0) setActiveId(items[0].id);
    if (active && !activeFormationId && active.formations[0]) setActiveFormationId(active.formations[0].id);
  }, [active, activeFormationId, items]);

  useEffect(() => {
    if (!presentMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goToFormation(activeFormationIndex + 1);
      if (event.key === "ArrowLeft") goToFormation(activeFormationIndex - 1);
      if (event.key === " ") {
        event.preventDefault();
        setAnimationProgress(0);
        setIsAnimating(true);
      }
      if (event.key === "Escape") setPresentMode(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentMode, activeFormationIndex, sortedFormations, previousFormation, activeFormation]);

  useEffect(() => {
    startTransitionPlayback();
  }, [activeFormation?.id, isAnimating, activeTransitionSeconds]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  if (!sharedMode && !firebaseEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <section className={`${panelClass} w-full max-w-md`}>
          <h1 className="text-xl font-semibold">{t.cloudSave}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.firebaseMissing}</p>
        </section>
      </main>
    );
  }

  if (!sharedMode && !authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <section className={`${panelClass} w-full max-w-md`}>
          <h1 className="text-xl font-semibold">{t.cloudSave}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.accountHint}</p>
          <div className="mt-4 grid gap-3">
            <input className={inputClass} type="email" placeholder={t.email} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            <input className={inputClass} type="password" placeholder={t.password} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") handleLogin();
            }} />
            <Button onClick={handleLogin} disabled={authLoading || !loginEmail.trim() || !loginPassword}>{authLoading ? t.loadingProjects : t.login}</Button>
          </div>
        </section>
      </main>
    );
  }

  if (!sharedMode && migrationItems) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <section className={`${panelClass} w-full max-w-md`}>
          <h1 className="text-xl font-semibold">{t.importLocalTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.importLocalMessage}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={skipLocalImport} disabled={authLoading}>{t.skipImport}</Button>
            <Button onClick={importLocalProjects} disabled={authLoading}>{t.importLocal}</Button>
          </div>
        </section>
      </main>
    );
  }

  if (!sharedMode && authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <section className={`${panelClass} w-full max-w-sm text-center text-sm text-muted-foreground`}>{t.loadingProjects}</section>
      </main>
    );
  }

  if (!active || !activeFormation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <Button onClick={() => {
          const demo = createDemoChoreography();
          setItems([demo]);
          setActiveId(demo.id);
          setActiveFormationId(demo.formations[0]?.id || "");
        }}>
          <Plus className="h-4 w-4" />
          {t.createFirst}
        </Button>
      </main>
    );
  }

  if (presentMode) {
    return (
      <main className="flex h-screen overflow-hidden bg-background p-3 text-foreground">
        <section className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_96px] gap-3">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-primary-foreground/70">{active.name}</p>
              <h1 className="truncate text-2xl font-semibold">{activeFormation.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => goToFormation(activeFormationIndex - 1)} disabled={activeFormationIndex <= 0}>
                <ChevronLeft className="h-4 w-4" />
                {t.prev}
              </Button>
            <Button variant="secondary" onClick={() => goToFormation(activeFormationIndex + 1)} disabled={activeFormationIndex >= sortedFormations.length - 1}>
                {t.next}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" onClick={() => {
                setAnimationProgress(0);
                setIsAnimating(activeFormationIndex > 0);
              }} disabled={activeFormationIndex <= 0}>
                <Play className="h-4 w-4" />
                {t.replay}
              </Button>
              <Button variant="secondary" onClick={() => setPresentMode(false)}>
                <X className="h-4 w-4" />
                {t.exit}
              </Button>
            </div>
          </header>
          <div className="grid min-h-0 min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-2">
              <div className="pb-2 text-center text-xs font-semibold tracking-wide text-primary-foreground/70">BACKSTAGE</div>
              <div
                className={`relative max-h-full w-full overflow-hidden rounded-xl border border-primary-foreground/20 bg-stage ${showGrid ? "stage-grid" : ""}`}
                style={{
                  aspectRatio: `${active.stage.width} / ${active.stage.height}`,
                  backgroundSize: `${(active.stage.gridSize / active.stage.width) * 100}% ${(active.stage.gridSize / active.stage.height) * 100}%`,
                }}
              >
                {showPaths && previousFormation && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${active.stage.width} ${active.stage.height}`}>
                    {sortedDancers.map((dancer) => {
                      const from = previousFormation?.positions[dancer.id];
                      const to = activeFormation.positions[dancer.id];
                      if (!from || !to) return null;
                      return <path key={dancer.id} d={getDancerPath(from, to)} className="fill-none stroke-primary" strokeWidth="0.4" strokeDasharray="1 1" />;
                    })}
                  </svg>
                )}
                {visibleProps.map((prop) => (
                  <div
                    key={prop.id}
                    className={`absolute border border-foreground/20 ${prop.color} ${prop.shape === "circle" ? "rounded-full" : "rounded-md"}`}
                    style={{
                      left: `${(prop.x / active.stage.width) * 100}%`,
                      top: `${(prop.y / active.stage.height) * 100}%`,
                      width: `${(prop.width / active.stage.width) * 100}%`,
                      height: `${(prop.height / active.stage.height) * 100}%`,
                      opacity: prop.opacity,
                      transform: `rotate(${prop.rotation}deg)`,
                    }}
                  />
                ))}
                {sortedDancers.map((dancer) => {
                  const position = activeFormation.positions[dancer.id];
                  if (!position) return null;
                  const previousPosition = previousFormation?.positions[dancer.id];
                  const displayPosition = previousPosition && animationProgress < 1 ? getAnimatedPosition(previousPosition, position, animationProgress) : position;
                  return (
                    <div
                      key={dancer.id}
                      className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-sm font-semibold text-primary-foreground shadow-md ${dancer.color} ${dancer.shape === "circle" ? "rounded-full" : dancer.shape === "square" ? "rounded-lg" : "rounded-full rotate-45"}`}
                      style={{
                        left: `${(displayPosition.x / active.stage.width) * 100}%`,
                        top: `${(displayPosition.y / active.stage.height) * 100}%`,
                      }}
                    >
                      <span className={dancer.shape === "triangle" ? "-rotate-45" : ""}>{dancer.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 text-center text-xs font-semibold tracking-wide text-primary-foreground/70">AUDIENCE</div>
            </div>
            <aside className="hidden min-h-0 min-w-0 overflow-hidden rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-3 lg:grid lg:grid-rows-[auto_auto_minmax(0,1fr)]">
              <div className="text-sm text-primary-foreground/70">{formatTimestamp(activeFormation.timestampSeconds)} · {activeTransitionSeconds}s · {conflicts.length} path conflicts</div>
              <div className="my-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/10 p-3 text-sm leading-6">
                <div className="mb-1 text-xs font-semibold uppercase text-primary-foreground/60">{t.comment}</div>
                <p className="max-h-32 overflow-hidden whitespace-pre-wrap">{activeFormation.comments || t.noNotes}</p>
              </div>
              <div className="grid min-h-0 gap-2 overflow-y-auto pr-1">
                {sortedFormations.map((formation, index) => (
                  <button
                    key={formation.id}
                    className={`rounded-lg border p-2 text-left text-sm ${formation.id === activeFormation.id ? "border-primary bg-primary text-primary-foreground" : "border-primary-foreground/15 bg-primary-foreground/10 hover:bg-primary-foreground/20"}`}
                    onClick={() => goToFormation(index)}
                  >
                    <div className="truncate font-semibold">{formation.name}</div>
                    <div className="whitespace-nowrap text-xs text-primary-foreground/70">{formatTimestamp(formation.timestampSeconds)} · {formation.durationSeconds || transitionSeconds}s</div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
          <footer
            className="flex min-w-0 gap-2 overflow-x-auto rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-2"
            onWheel={(event) => {
              if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                event.currentTarget.scrollLeft += event.deltaY;
                event.preventDefault();
              }
            }}
          >
            {sortedFormations.map((formation, index) => (
              <button
                key={formation.id}
                className={`grid min-w-36 content-between rounded-lg border p-2 text-left text-xs ${formation.id === activeFormation.id ? "border-primary bg-primary text-primary-foreground" : "border-primary-foreground/15 bg-primary-foreground/10 hover:bg-primary-foreground/20"}`}
                onClick={() => goToFormation(index)}
              >
                <span className="truncate font-semibold">{formation.name}</span>
                <span className="mt-2 whitespace-nowrap text-primary-foreground/70">{formatTimestamp(formation.timestampSeconds)} · {formation.durationSeconds || transitionSeconds}s</span>
              </button>
            ))}
          </footer>
        </section>
        <aside className="hidden">
          <div className="text-sm text-primary-foreground/70">{formatTimestamp(activeFormation.timestampSeconds)} · {conflicts.length} path conflicts</div>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7">{activeFormation.comments || "No notes for this formation."}</p>
        </aside>
      </main>
    );
  }

  if (false && presentMode) {
    return (
      <main className="hidden">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-primary-foreground/70">{active.name}</p>
            <h1 className="truncate text-2xl font-semibold">{activeFormation.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortedFormations.map((formation) => (
              <button
                key={formation.id}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${formation.id === activeFormation.id ? "bg-primary text-primary-foreground" : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"}`}
                onClick={() => setActiveFormationId(formation.id)}
              >
                {formation.name}
              </button>
            ))}
            <Button variant="secondary" onClick={() => setPresentMode(false)}>
              <X className="h-4 w-4" />
              Exit
            </Button>
          </div>
        </header>
        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={`relative min-h-0 overflow-hidden rounded-xl border border-primary-foreground/20 bg-stage ${showGrid ? "stage-grid" : ""}`}
            style={{
              aspectRatio: `${active.stage.width} / ${active.stage.height}`,
              backgroundSize: `${(active.stage.gridSize / active.stage.width) * 100}% ${(active.stage.gridSize / active.stage.height) * 100}%`,
            }}
          >
            {showPaths && previousFormation && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${active.stage.width} ${active.stage.height}`}>
                {sortedDancers.map((dancer) => {
                  const from = previousFormation?.positions[dancer.id];
                  const to = activeFormation.positions[dancer.id];
                  if (!from || !to) return null;
                  return <line key={dancer.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="stroke-primary" strokeWidth="0.4" strokeDasharray="1 1" />;
                })}
              </svg>
            )}
            {visibleProps.map((prop) => (
              <div
                key={prop.id}
                className={`absolute border border-foreground/20 ${prop.color} ${prop.shape === "circle" ? "rounded-full" : "rounded-md"}`}
                style={{
                  left: `${(prop.x / active.stage.width) * 100}%`,
                  top: `${(prop.y / active.stage.height) * 100}%`,
                  width: `${(prop.width / active.stage.width) * 100}%`,
                  height: `${(prop.height / active.stage.height) * 100}%`,
                  opacity: prop.opacity,
                  transform: `rotate(${prop.rotation}deg)`,
                }}
              />
            ))}
            {sortedDancers.map((dancer) => {
              const position = activeFormation.positions[dancer.id];
              if (!position) return null;
              return (
                <div
                  key={dancer.id}
                  className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-sm font-semibold text-primary-foreground shadow-md ${dancer.color} ${dancer.shape === "circle" ? "rounded-full" : dancer.shape === "square" ? "rounded-lg" : "rounded-full rotate-45"}`}
                  style={{
                    left: `${(position.x / active.stage.width) * 100}%`,
                    top: `${(position.y / active.stage.height) * 100}%`,
                  }}
                >
                  <span className={dancer.shape === "triangle" ? "-rotate-45" : ""}>{dancer.label}</span>
                </div>
              );
            })}
          </div>
          <aside className="min-w-0 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 p-4">
            <div className="text-sm text-primary-foreground/70">{formatTimestamp(activeFormation.timestampSeconds)} · {conflicts.length} path conflicts</div>
            <p className="mt-4 whitespace-pre-wrap text-base leading-7">{activeFormation.comments || "No notes for this formation."}</p>
          </aside>
        </section>
      </main>
    );
  }

  const updateActive = (updater: (current: Choreography) => Choreography) => {
    setItems((current) =>
      current.map((item) => (item.id === active.id ? touchChoreography(updater(item)) : item)),
    );
  };

  const updateFormation = (formationId: string, updater: (formation: Formation) => Formation) => {
    updateActive((current) => ({
      ...current,
      formations: current.formations.map((formation) => (formation.id === formationId ? updater(formation) : formation)),
    }));
  };

  const addChoreography = () => {
    const next = createBlankChoreography();
    setItems((current) => [next, ...current]);
    setActiveId(next.id);
    setActiveFormationId(next.formations[0].id);
  };

  const deleteChoreography = () => {
    requestConfirm(
      t.deleteProject,
      `Delete project "${active.name}"? This cannot be undone.`,
      async () => {
        if (!sharedMode && authUser) {
          try {
            await deleteCloudProject(authUser.uid, active.id);
          } catch {
            setSaveStatus("failed");
          }
        }
        const remaining = items.filter((item) => item.id !== active.id);
        setItems(remaining);
        setActiveId(remaining[0]?.id || "");
      },
      t.deleteProject,
    );
  };

  const addDancers = (count: number) => {
    updateActive((current) => {
      const start = current.dancers.length;
      const newDancers: Dancer[] = Array.from({ length: count }, (_, index) => {
        const order = start + index;
        return {
          id: createId(),
          name: `Dancer ${order + 1}`,
          label: String(order + 1),
          color: dancerColors[order % dancerColors.length],
          shape: "circle",
          sortOrder: order,
        };
      });
      const dancers = [...current.dancers, ...newDancers];
      const formations = current.formations.map((formation) => {
        const positions = { ...formation.positions };
        newDancers.forEach((dancer, index) => {
          positions[dancer.id] = getDefaultPosition(start + index, dancers.length, current.stage.width, current.stage.height);
        });
        return { ...formation, positions };
      });
      return { ...current, dancers, formations };
    });
  };

  const removeDancer = (dancerId: string) => {
    const dancer = active.dancers.find((item) => item.id === dancerId);
    requestConfirm(
      t.deleteDancer,
      `Delete dancer "${dancer?.name || "this dancer"}"?`,
      () => {
        updateActive((current) => ({
          ...current,
          dancers: current.dancers.filter((dancer) => dancer.id !== dancerId),
          formations: current.formations.map((formation) => {
            const positions = { ...formation.positions };
            delete positions[dancerId];
            return { ...formation, positions };
          }),
        }));
        setSelectedDancerId("");
      },
      t.deleteDancer,
    );
  };

  const updateDancer = (dancerId: string, patch: Partial<Dancer>) => {
    updateActive((current) => ({
      ...current,
      dancers: current.dancers.map((dancer) => (dancer.id === dancerId ? { ...dancer, ...patch } : dancer)),
    }));
  };

  const updateDancerPath = (dancerId: string, patch: Partial<NonNullable<DancerPosition["path"]>>) => {
    updateFormation(activeFormation.id, (formation) => {
      const position = formation.positions[dancerId];
      if (!position) return formation;
      return {
        ...formation,
        positions: {
          ...formation.positions,
          [dancerId]: {
            ...position,
            path: {
              type: position.path?.type || "straight",
              ...position.path,
              ...patch,
            },
          },
        },
      };
    });
  };

  const createDancerCurvePath = (dancerId: string) => {
    const from = previousFormation?.positions[dancerId];
    const to = activeFormation.positions[dancerId];
    if (!from || !to) return;
    setShowPaths(true);
    updateDancerPath(dancerId, {
      type: "curve",
      controlX: clamp(Math.round((from.x + to.x) / 2), 0, active.stage.width),
      controlY: clamp(Math.round(Math.min(from.y, to.y) - active.stage.gridSize * 2), 0, active.stage.height),
    });
  };

  const addFormation = () => {
    const source = sortedFormations[sortedFormations.length - 1];
    const next: Formation = {
      id: createId(),
      name: `Formation ${sortedFormations.length + 1}`,
      timestampSeconds: source ? source.timestampSeconds + (source.durationSeconds || 16) : 0,
      durationSeconds: 16,
      comments: "",
      positions: source ? { ...source.positions } : {},
      sortOrder: sortedFormations.length,
    };
    updateActive((current) => ({ ...current, formations: [...current.formations, next] }));
    setActiveFormationId(next.id);
  };

  const duplicateFormation = () => {
    const next: Formation = {
      ...activeFormation,
      id: createId(),
      name: `${activeFormation.name} copy`,
      sortOrder: sortedFormations.length,
      positions: { ...activeFormation.positions },
    };
    updateActive((current) => ({ ...current, formations: [...current.formations, next] }));
    setActiveFormationId(next.id);
  };

  const removeFormation = (formationId: string) => {
    if (active.formations.length <= 1) return;
    const formationToDelete = active.formations.find((formation) => formation.id === formationId);
    requestConfirm(
      "Delete formation",
      `Delete formation "${formationToDelete?.name || "this formation"}"?`,
      () => {
        const remaining = sortedFormations.filter((formation) => formation.id !== formationId);
        updateActive((current) => ({
          ...current,
          formations: remaining.map((formation, index) => ({ ...formation, sortOrder: index })),
        }));
        setActiveFormationId(remaining[0]?.id || "");
      },
      "Delete",
    );
  };

  const addProp = () => {
    const prop: StageProp = {
      id: createId(),
      formationId: activeFormation.id,
      name: `Prop ${visibleProps.length + 1}`,
      shape: "rectangle",
      x: active.stage.width / 2 - 6,
      y: active.stage.height / 2 - 3,
      width: 12,
      height: 6,
      rotation: 0,
      color: "bg-muted",
      opacity: 0.7,
      locked: false,
    };
    updateActive((current) => ({ ...current, props: [...current.props, prop] }));
    setSelectedPropId(prop.id);
  };

  const updateProp = (propId: string, patch: Partial<StageProp>) => {
    updateActive((current) => ({
      ...current,
      props: current.props.map((prop) => (prop.id === propId ? { ...prop, ...patch } : prop)),
    }));
  };

  const removeProp = (propId: string) => {
    const prop = active.props.find((item) => item.id === propId);
    requestConfirm(
      t.deleteProp,
      `Delete prop "${prop?.name || "this prop"}"?`,
      () => {
        updateActive((current) => ({
          ...current,
          props: current.props.filter((prop) => prop.id !== propId),
        }));
        setSelectedPropId("");
      },
      t.deleteProp,
    );
  };

  const getStagePoint = (event: PointerEvent<HTMLElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = ((event.clientX - rect.left) / rect.width) * active.stage.width;
    const y = ((event.clientY - rect.top) / rect.height) * active.stage.height;
    return {
      x: clamp(x, 0, active.stage.width),
      y: clamp(y, 0, active.stage.height),
    };
  };

  const startDancerDrag = (event: PointerEvent<HTMLButtonElement>, dancerId: string) => {
    const position = activeFormation.positions[dancerId];
    if (!position) return;
    const point = getStagePoint(event);
    dragRef.current = { type: "dancer", id: dancerId, startX: point.x, startY: point.y, originX: position.x, originY: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedDancerId(dancerId);
    setSelectedPropId("");
  };

  const startPropDrag = (event: PointerEvent<HTMLButtonElement>, propId: string) => {
    const prop = visibleProps.find((item) => item.id === propId);
    if (!prop || prop.locked) return;
    const point = getStagePoint(event);
    dragRef.current = { type: "prop", id: propId, startX: point.x, startY: point.y, originX: prop.x, originY: prop.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedPropId(propId);
    setSelectedDancerId("");
  };

  const startPathControlDrag = (event: PointerEvent<HTMLButtonElement>, dancerId: string) => {
    const position = activeFormation.positions[dancerId];
    const previousPosition = previousFormation?.positions[dancerId];
    if (!position || !previousPosition) return;
    const controlX = position.path?.controlX ?? (previousPosition.x + position.x) / 2;
    const controlY = position.path?.controlY ?? Math.min(previousPosition.y, position.y) - 10;
    const point = getStagePoint(event);
    dragRef.current = { type: "path-control", id: dancerId, startX: point.x, startY: point.y, originX: controlX, originY: controlY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedDancerId(dancerId);
    setSelectedPropId("");
  };

  const handleDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = getStagePoint(event);
    const gridSize = snapToGrid ? active.stage.gridSize : 0;
    const x = clamp(snap(drag.originX + point.x - drag.startX, gridSize), 0, active.stage.width);
    const y = clamp(snap(drag.originY + point.y - drag.startY, gridSize), 0, active.stage.height);
    if (drag.type === "dancer") {
      updateFormation(activeFormation.id, (formation) => ({
        ...formation,
        positions: {
          ...formation.positions,
          [drag.id]: {
            ...(formation.positions[drag.id] || { rotation: 0 }),
            x,
            y,
          },
        },
      }));
    } else if (drag.type === "prop") {
      updateProp(drag.id, { x, y });
    } else {
      updateDancerPath(drag.id, { type: "curve", controlX: x, controlY: y });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${active.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${SHARE_PREFIX}${encodeShareData(active)}`;
    window.history.replaceState(null, "", url);
    if (url.length > 1800) showNotice(t.share, t.shareTooLarge);
    try {
      await navigator.clipboard.writeText(url);
      showNotice(t.share, t.shareCopied);
    } catch {
      showNotice(t.share, t.shareCopyFailed);
    }
  };

  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as Choreography;
    const next = { ...parsed, id: createId(), createdAt: nowIso(), updatedAt: nowIso() };
    setItems((current) => [next, ...current]);
    setActiveId(next.id);
    setActiveFormationId(next.formations[0]?.id || "");
    event.target.value = "";
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-background px-0 py-1 text-foreground lg:h-screen lg:overflow-hidden">
      <div className="mx-auto grid h-full max-w-none min-w-0 gap-1.5 lg:grid-rows-[auto_minmax(0,1fr)]">
        <header className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-panel lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none md:text-2xl"
              value={draftProjectName}
              onChange={(event) => setDraftProjectName(event.target.value)}
              aria-label="Choreography name"
            />
            <Button
              variant="secondary"
              onClick={() => updateActive((current) => ({ ...current, name: draftProjectName.trim() || current.name }))}
              disabled={draftProjectName.trim() === active.name}
            >
              {t.saveName}
            </Button>
          </div>
          <div className="flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
            <div className={groupClass}>
              <Button variant="secondary" onClick={handleExportJson}>
                <Download className="h-4 w-4" />
                JSON
              </Button>
              <label className="inline-flex min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                <Upload className="h-4 w-4" />
                {t.import}
                <input className="hidden" type="file" accept="application/json" onChange={handleImportJson} />
              </label>
              <Button onClick={() => exportChoreographyPdf(active, pdfOptions)}>
                <FileDown className="h-4 w-4" />
                {t.exportPdf}
              </Button>
              <Button variant="secondary" onClick={handleShareLink}>
                <Share2 className="h-4 w-4" />
                {t.share}
              </Button>
            </div>
            <div className={groupClass}>
              <Button variant="secondary" onClick={() => {
                setPresentMode(true);
                setAnimationProgress(activeFormationIndex > 0 ? 0 : 1);
                setIsAnimating(activeFormationIndex > 0);
              }}>
              <Play className="h-4 w-4" />
              {t.present}
            </Button>
              <Button variant="secondary" onClick={() => setDarkMode((value) => !value)} aria-label="Toggle dark mode">
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {darkMode ? t.light : t.dark}
              </Button>
              <Button variant="secondary" onClick={() => setShowHelp(true)}>
                <HelpCircle className="h-4 w-4" />
                {t.guide}
              </Button>
            </div>
            <div className={groupClass} aria-label={t.language}>
              <button className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-semibold transition ${language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card"}`} onClick={() => setLanguage("en")}>EN</button>
              <button className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-semibold transition ${language === "vi" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card"}`} onClick={() => setLanguage("vi")}>VI</button>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 min-w-0 gap-1.5 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside className="order-2 grid min-h-0 min-w-0 gap-2 overflow-y-visible xl:order-1 xl:overflow-y-auto xl:pr-1">
            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t.projects}</h2>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={addChoreography} aria-label="Add project">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <input className={`${inputClass} mb-2 w-full`} placeholder={t.searchProjects} value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="mb-2 rounded-lg border border-border bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{t.cloudSave}</span>
                  <span className={`text-[11px] ${saveStatus === "failed" ? "text-danger" : "text-muted-foreground"}`}>{sharedMode ? t.localSaveNote : saveStatusLabel}</span>
                </div>
                {!sharedMode && (
                  <div className="mt-2 grid gap-2">
                    <p className="truncate text-xs text-muted-foreground">{authUser?.email}</p>
                    <Button variant="secondary" onClick={handleLogout}>{t.logout}</Button>
                  </div>
                )}
              </div>
              <div className="grid max-h-56 gap-2 overflow-auto pr-1 xl:max-h-72">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    className={`rounded-lg border p-3 text-left text-sm transition ${item.id === active.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
                    onClick={() => {
                      setActiveId(item.id);
                      setActiveFormationId(item.formations[0]?.id || "");
                    }}
                  >
                    <div className="font-semibold">{item.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.formations.length} {t.formations} · {item.dancers.length} {t.dancers}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t.dancers}</h2>
                <div className="flex gap-1">
                  <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => addDancers(1)} aria-label="Add dancer">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid max-h-64 gap-2 overflow-auto pr-1 xl:max-h-96">
                {sortedDancers.map((dancer) => (
                  <button
                    key={dancer.id}
                    className={`flex items-center gap-3 rounded-lg border p-2 text-left text-sm ${selectedDancerId === dancer.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                    onClick={() => {
                      setSelectedDancerId(dancer.id);
                      setSelectedPropId("");
                    }}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground ${dancer.color}`}>{dancer.label}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{dancer.name}</span>
                      <span className="block text-xs text-muted-foreground">{dancer.shape}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="order-1 grid h-[82svh] min-h-[560px] min-w-0 grid-rows-[minmax(0,1fr)_118px] gap-1.5 overflow-hidden xl:order-2 xl:h-auto xl:min-h-0">
            <div className={`${panelClass} grid min-h-0 grid-rows-[auto_minmax(0,1fr)]`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{activeFormation.name}</h2>
                  <p className="text-xs text-muted-foreground">{formatTimestamp(activeFormation.timestampSeconds)} · {conflicts.length} {t.pathConflicts}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant={showGrid ? "primary" : "secondary"} onClick={() => setShowGrid((value) => !value)}>
                    <Grid3X3 className="h-4 w-4" />
                    {t.grid}
                  </Button>
                  <Button variant={snapToGrid ? "primary" : "secondary"} onClick={() => setSnapToGrid((value) => !value)}>
                    <Move className="h-4 w-4" />
                    {t.snap}
                  </Button>
                  <Button variant={showPaths ? "primary" : "secondary"} onClick={() => setShowPaths((value) => !value)}>
                    <ArrowLeftRight className="h-4 w-4" />
                    {t.paths}
                  </Button>
                </div>
              </div>
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
                <div className="pb-1 text-center text-xs font-semibold tracking-wide text-muted-foreground">BACKSTAGE</div>
                <div
                  ref={stageRef}
                  className={`stage-touch relative mx-auto h-full min-h-[320px] max-h-full max-w-full overflow-hidden rounded-xl border border-border bg-stage ${showGrid ? "stage-grid" : ""}`}
                  style={{
                    aspectRatio: `${active.stage.width} / ${active.stage.height}`,
                    backgroundSize: `${(active.stage.gridSize / active.stage.width) * 100}% ${(active.stage.gridSize / active.stage.height) * 100}%`,
                  }}
                  onPointerMove={handleDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                {active.stage.backgroundDataUrl && (
                  <img
                    className="absolute inset-0 h-full w-full object-cover"
                    src={active.stage.backgroundDataUrl}
                    alt=""
                    style={{ opacity: active.stage.backgroundOpacity }}
                  />
                )}
                {showPaths && previousFormation && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${active.stage.width} ${active.stage.height}`}>
                    {sortedDancers.map((dancer) => {
                      const from = previousFormation?.positions[dancer.id];
                      const to = activeFormation.positions[dancer.id];
                      if (!from || !to) return null;
                      return (
                        <path
                          key={dancer.id}
                          d={getDancerPath(from, to)}
                          className="fill-none stroke-primary"
                          strokeWidth="0.35"
                          strokeDasharray="1 1"
                        />
                      );
                    })}
                  </svg>
                )}
                {visibleProps.map((prop) => (
                  <button
                    key={prop.id}
                    className={`absolute border border-foreground/20 ${prop.color} ${prop.shape === "circle" ? "rounded-full" : "rounded-md"} ${selectedPropId === prop.id ? "ring-2 ring-primary" : ""}`}
                    style={{
                      left: `${(prop.x / active.stage.width) * 100}%`,
                      top: `${(prop.y / active.stage.height) * 100}%`,
                      width: `${(prop.width / active.stage.width) * 100}%`,
                      height: `${(prop.height / active.stage.height) * 100}%`,
                      opacity: prop.opacity,
                      transform: `rotate(${prop.rotation}deg)`,
                    }}
                    onPointerDown={(event) => startPropDrag(event, prop.id)}
                    aria-label={prop.name || "Stage prop"}
                  />
                ))}
                {selectedDancer && previousFormation?.positions[selectedDancer.id] && activeFormation.positions[selectedDancer.id]?.path?.type === "curve" && (() => {
                  const selectedPosition = activeFormation.positions[selectedDancer.id];
                  const previousPosition = previousFormation?.positions[selectedDancer.id];
                  if (!previousPosition) return null;
                  const controlX = selectedPosition.path?.controlX ?? (previousPosition.x + selectedPosition.x) / 2;
                  const controlY = selectedPosition.path?.controlY ?? Math.min(previousPosition.y, selectedPosition.y) - 10;
                  return (
                    <button
                      className="absolute z-20 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-md ring-2 ring-primary/30"
                      style={{
                        left: `${(controlX / active.stage.width) * 100}%`,
                        top: `${(controlY / active.stage.height) * 100}%`,
                      }}
                      onPointerDown={(event) => startPathControlDrag(event, selectedDancer.id)}
                      aria-label="Drag path control point"
                    />
                  );
                })()}
                {sortedDancers.map((dancer) => {
                  const position = activeFormation.positions[dancer.id];
                  if (!position) return null;
                  const previousPosition = previousFormation?.positions[dancer.id];
                  const displayPosition = previousPosition && animationProgress < 1 ? getAnimatedPosition(previousPosition, position, animationProgress) : position;
                  return (
                    <button
                      key={dancer.id}
                      className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-xs font-semibold text-primary-foreground shadow-md transition ${dancer.color} ${dancer.shape === "circle" ? "rounded-full" : dancer.shape === "square" ? "rounded-lg" : "rounded-full rotate-45"} ${selectedDancerId === dancer.id ? "ring-4 ring-primary/30" : ""}`}
                      style={{
                        left: `${(displayPosition.x / active.stage.width) * 100}%`,
                        top: `${(displayPosition.y / active.stage.height) * 100}%`,
                      }}
                      onPointerDown={(event) => startDancerDrag(event, dancer.id)}
                      aria-label={dancer.name}
                    >
                      <span className={dancer.shape === "triangle" ? "-rotate-45" : ""}>{dancer.label}</span>
                    </button>
                  );
                })}
                </div>
                <div className="pt-1 text-center text-xs font-semibold tracking-wide text-muted-foreground">AUDIENCE</div>
              </div>
            </div>

            <div className={`${panelClass} grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden`}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                <h2 className="text-sm font-semibold">{t.timeline}</h2>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" onClick={duplicateFormation}>
                    <Copy className="h-4 w-4" />
                    {t.duplicate}
                  </Button>
                  <Button onClick={addFormation}>
                    <Plus className="h-4 w-4" />
                    {t.addFormation}
                  </Button>
                </div>
              </div>
              <div
                className="flex min-h-0 gap-1.5 overflow-x-auto pb-1"
                onWheel={(event) => {
                  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                    event.currentTarget.scrollLeft += event.deltaY;
                    event.preventDefault();
                  }
                }}
              >
                {sortedFormations.map((formation, index) => (
                  <button
                    key={formation.id}
                    className={`grid min-w-44 gap-1 rounded-lg border p-2 text-left text-xs ${formation.id === activeFormation.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
                    onClick={() => goToFormation(index)}
                  >
                    <div className="truncate font-semibold">{formation.name}</div>
                    <div className="whitespace-nowrap text-xs text-muted-foreground">{formatTimestamp(formation.timestampSeconds)} · {formation.durationSeconds || transitionSeconds}s</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="order-3 grid min-h-0 min-w-0 content-start gap-2 overflow-y-visible xl:overflow-y-auto xl:pr-1">
            <div className={panelClass}>
              <h2 className="mb-2 text-sm font-semibold">{t.stage}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label={t.width}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={active.stage.width}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isNaN(value)) return;
                      updateActive((current) => ({ ...current, stage: { ...current.stage, width: Math.max(0.1, value) } }));
                    }}
                  />
                </Field>
                <Field label={t.height}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={active.stage.height}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isNaN(value)) return;
                      updateActive((current) => ({ ...current, stage: { ...current.stage, height: Math.max(0.1, value) } }));
                    }}
                  />
                </Field>
                <Field label={t.grid}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={active.stage.gridSize}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isNaN(value)) return;
                      updateActive((current) => ({ ...current, stage: { ...current.stage, gridSize: Math.max(0.1, value) } }));
                    }}
                  />
                </Field>
                <Field label={t.music}>
                  <input className={inputClass} value={active.music?.name || ""} onChange={(event) => updateActive((current) => ({ ...current, music: { ...current.music, name: event.target.value } }))} />
                </Field>
                <Field label={t.transitionSeconds}>
                  <input
                    className={inputClass}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={transitionSecondsText}
                    onChange={(event) => updateTransitionSeconds(event.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t.formation}</h2>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => removeFormation(activeFormation.id)} disabled={active.formations.length <= 1} aria-label="Delete formation">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3">
                <Field label={t.name}>
                  <input className={inputClass} value={activeFormation.name} onChange={(event) => updateFormation(activeFormation.id, (formation) => ({ ...formation, name: event.target.value }))} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Field label={t.time}>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="0.1"
                      value={activeFormation.timestampSeconds}
                      onChange={(event) => {
                        const seconds = event.currentTarget.valueAsNumber;
                        if (Number.isNaN(seconds)) return;
                        updateFormation(activeFormation.id, (formation) => ({ ...formation, timestampSeconds: Math.max(0, seconds) }));
                      }}
                    />
                  </Field>
                  <Field label={t.duration}>
                    <input
                      className={inputClass}
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={transitionSecondsText}
                      onChange={(event) => updateTransitionSeconds(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label={t.comments}>
                  <textarea className={`${inputClass} min-h-24`} value={activeFormation.comments || ""} onChange={(event) => updateFormation(activeFormation.id, (formation) => ({ ...formation, comments: event.target.value }))} />
                </Field>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t.props}</h2>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={addProp} aria-label="Add prop">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedProp ? (
                <div className="grid gap-3">
                  <Field label={t.name}>
                    <input className={inputClass} value={selectedProp.name || ""} onChange={(event) => updateProp(selectedProp.id, { name: event.target.value })} />
                  </Field>
                  <Field label={t.shape}>
                    <select className={inputClass} value={selectedProp.shape} onChange={(event) => updateProp(selectedProp.id, { shape: event.target.value as StageProp["shape"] })}>
                      {propShapeOptions.map((shape) => <option key={shape}>{shape}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Field label={t.width}>
                      <input
                        className={inputClass}
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedProp.width}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          if (Number.isNaN(value)) return;
                          updateProp(selectedProp.id, { width: Math.max(0.1, value) });
                        }}
                      />
                    </Field>
                    <Field label={t.height}>
                      <input
                        className={inputClass}
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedProp.height}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          if (Number.isNaN(value)) return;
                          updateProp(selectedProp.id, { height: Math.max(0.1, value) });
                        }}
                      />
                    </Field>
                  </div>
                  <Field label={t.color}>
                    <div className="grid grid-cols-6 gap-2">
                      {dancerColors.map((color) => (
                        <button
                          key={color}
                          className={`h-9 rounded-lg border ${color} ${selectedProp.color === color ? "border-foreground ring-2 ring-primary" : "border-border"}`}
                          onClick={() => updateProp(selectedProp.id, { color })}
                          aria-label={`Choose ${color}`}
                        />
                      ))}
                    </div>
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedProp.locked} onChange={(event) => updateProp(selectedProp.id, { locked: event.target.checked })} />
                    {t.locked}
                  </label>
                  <Button variant="secondary" onClick={() => removeProp(selectedProp.id)}>
                    <Trash2 className="h-4 w-4" />
                    {t.deleteProp}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.selectProp}</p>
              )}
            </div>

            <div className={panelClass}>
              <h2 className="mb-2 text-sm font-semibold">{t.selection}</h2>
              {selectedDancer ? (
                <div className="grid gap-3">
                  <Field label={t.name}>
                    <input className={inputClass} value={selectedDancer.name} onChange={(event) => updateDancer(selectedDancer.id, { name: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Field label={t.label}>
                      <input className={inputClass} value={selectedDancer.label} onChange={(event) => updateDancer(selectedDancer.id, { label: event.target.value })} />
                    </Field>
                    <Field label={t.shape}>
                      <select className={inputClass} value={selectedDancer.shape} onChange={(event) => updateDancer(selectedDancer.id, { shape: event.target.value as Dancer["shape"] })}>
                        {shapeOptions.map((shape) => <option key={shape}>{shape}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label={t.color}>
                    <div className="grid grid-cols-6 gap-2">
                      {dancerColors.map((color) => (
                        <button
                          key={color}
                          className={`h-9 rounded-lg border ${color} ${selectedDancer.color === color ? "border-foreground ring-2 ring-primary" : "border-border"}`}
                          onClick={() => updateDancer(selectedDancer.id, { color })}
                          aria-label={`Choose ${color}`}
                        />
                      ))}
                    </div>
                  </Field>
                  {previousFormation?.positions[selectedDancer.id] && activeFormation.positions[selectedDancer.id] && (
                    <div className="grid gap-3 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">Path</div>
                          <p className="text-xs text-muted-foreground">{t.pathHint}</p>
                        </div>
                        <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{(activeFormation.positions[selectedDancer.id].path?.type || "straight") === "curve" ? "Curve" : "Straight"}</span>
                      </div>
                      <div className="grid gap-1 rounded-lg border border-border p-2 text-xs text-muted-foreground">
                        <p>{t.pathScope}</p>
                        <p>{t.pathSteps}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <Button onClick={() => createDancerCurvePath(selectedDancer.id)}>
                          <ArrowLeftRight className="h-4 w-4" />
                          {(activeFormation.positions[selectedDancer.id].path?.type || "straight") === "curve" ? t.recreatePath : t.createPath}
                        </Button>
                        <Button variant="secondary" onClick={() => updateDancerPath(selectedDancer.id, { type: "straight" })}>
                          {t.straight}
                        </Button>
                      </div>
                      {(activeFormation.positions[selectedDancer.id].path?.type || "straight") === "curve" && (
                        <div className="grid gap-3">
                          <p className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-xs text-muted-foreground">{t.pathControlHint}</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <Field label="Control X">
                              <input
                                className={inputClass}
                                type="number"
                                step="0.1"
                                value={activeFormation.positions[selectedDancer.id].path?.controlX ?? Math.round(((previousFormation?.positions[selectedDancer.id]?.x || activeFormation.positions[selectedDancer.id].x) + activeFormation.positions[selectedDancer.id].x) / 2)}
                                onChange={(event) => {
                                  const value = event.currentTarget.valueAsNumber;
                                  if (Number.isNaN(value)) return;
                                  updateDancerPath(selectedDancer.id, { controlX: value });
                                }}
                              />
                            </Field>
                            <Field label="Control Y">
                              <input
                                className={inputClass}
                                type="number"
                                step="0.1"
                                value={activeFormation.positions[selectedDancer.id].path?.controlY ?? Math.round(Math.min(previousFormation?.positions[selectedDancer.id]?.y || activeFormation.positions[selectedDancer.id].y, activeFormation.positions[selectedDancer.id].y) - 10)}
                                onChange={(event) => {
                                  const value = event.currentTarget.valueAsNumber;
                                  if (Number.isNaN(value)) return;
                                  updateDancerPath(selectedDancer.id, { controlY: value });
                                }}
                              />
                            </Field>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!previousFormation?.positions[selectedDancer.id] && (
                    <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">{t.pathUnavailable}</p>
                  )}
                  <Button variant="secondary" onClick={() => removeDancer(selectedDancer.id)}>
                    <Trash2 className="h-4 w-4" />
                    {t.deleteDancer}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.selectDancer}</p>
              )}
            </div>

            <div className={panelClass}>
              <h2 className="mb-2 text-sm font-semibold">PDF</h2>
              <div className="grid gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={pdfOptions.includePaths} onChange={(event) => setPdfOptions((current) => ({ ...current, includePaths: event.target.checked }))} />
                  {t.includePaths}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={pdfOptions.includeComments} onChange={(event) => setPdfOptions((current) => ({ ...current, includeComments: event.target.checked }))} />
                  {t.includeComments}
                </label>
                <Field label={t.labels}>
                  <select className={inputClass} value={pdfOptions.labelMode} onChange={(event) => setPdfOptions((current) => ({ ...current, labelMode: event.target.value as ExportPdfOptions["labelMode"] }))}>
                    <option value="label">Label</option>
                    <option value="name">Name</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
                <Button onClick={() => exportChoreographyPdf(active, pdfOptions)}>
                  <Save className="h-4 w-4" />
                  {t.savePdf}
                </Button>
              </div>
            </div>

            <Button variant="secondary" onClick={deleteChoreography}>
              <Trash2 className="h-4 w-4" />
              {t.deleteProject}
            </Button>
          </aside>
        </section>
        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-foreground shadow-panel">
              <h2 className="text-base font-semibold">{confirmDialog.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{confirmDialog.message}</p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirmDialog(null)}>{t.cancel}</Button>
                <Button
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                >
                  {confirmDialog.confirmLabel || t.confirm}
                </Button>
              </div>
            </div>
          </div>
        )}
        {noticeDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-foreground shadow-panel">
              <h2 className="text-base font-semibold">{noticeDialog.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{noticeDialog.message}</p>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setNoticeDialog(null)}>{t.ok}</Button>
              </div>
            </div>
          </div>
        )}
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card p-5 text-foreground shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">{t.brand}</p>
                  <h2 className="text-xl font-semibold">{language === "vi" ? "Hướng dẫn sử dụng" : "User guide"}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <div className={groupClass} aria-label={t.language}>
                    <button className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-semibold transition ${language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card"}`} onClick={() => setLanguage("en")}>EN</button>
                    <button className={`min-h-8 rounded-md px-2.5 py-1 text-xs font-semibold transition ${language === "vi" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card"}`} onClick={() => setLanguage("vi")}>VI</button>
                  </div>
                  <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowHelp(false)} aria-label="Close guide">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {language === "vi" ? (
                <>
                  <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm leading-6">
                    <p className="font-semibold">Quy trình nhanh:</p>
                    <p>1. Tạo hoặc chọn project. 2. Bấm + trong Dancers để thêm dancer. 3. Kéo dancer trên stage vào formation đầu. 4. Bấm Duplicate trong Timeline để tạo formation tiếp theo. 5. Kéo dancer sang vị trí mới. 6. Nếu đường đi giao nhau, chọn dancer, bấm Tạo path, rồi kéo chấm điều khiển trên stage để chỉnh đường cong. 7. Duration/Thời gian chuyển quyết định tốc độ trong editor và Present. 8. Dùng Present để tập và PDF để xuất file.</p>
                    <p className="mt-2">Present: phím trái/phải để chuyển formation, Space để phát lại transition hiện tại, Esc để thoát.</p>
                  </div>
                  <div className="grid gap-4 text-sm leading-6 md:grid-cols-2">
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Projects</h3><p>Đổi tên project bằng ô tiêu đề và bấm Lưu. Dữ liệu lưu theo tài khoản Firebase do admin cấp. JSON chỉ dùng để backup hoặc chuyển dữ liệu thủ công. Delete project sẽ hỏi xác nhận.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Stage</h3><p>Width/Height/Grid cấu hình sân khấu. BACKSTAGE nằm phía trên, AUDIENCE nằm phía dưới và nằm ngoài stage. Grid hiện lưới, Snap bám dancer vào lưới.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Dancers</h3><p>Nút + thêm từng dancer. Chọn dancer để sửa tên, label, shape, màu. Kéo dancer trên stage để đặt vị trí cho formation hiện tại.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Timeline</h3><p>Bấm Formation để thêm formation mới. Bấm Duplicate để copy formation hiện tại. Lăn chuột trên timeline để scroll ngang khi có nhiều formation.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Path</h3><p>Path không phải thuộc toàn bộ formation. Path thuộc từng dancer trong formation hiện tại, và mô tả dancer đó đi từ formation trước sang formation hiện tại như thế nào. Ví dụ: ở Formation 2, chọn Dancer 3, bấm Tạo path, kéo chấm tròn để Dancer 3 đi vòng. Dancer khác không bị ảnh hưởng. Bấm Đường thẳng để reset path của dancer đang chọn.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Share / PDF</h3><p>Share tạo link chứa dữ liệu project hiện tại để người khác mở web và xem bản copy. Dữ liệu gốc vẫn lưu theo tài khoản của bạn trên Firebase. PDF xuất stage, path, dancer list và notes.</p></section>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm leading-6">
                    <p className="font-semibold">Quick workflow:</p>
                    <p>1. Create or select a project. 2. Press + in Dancers to add dancers. 3. Drag dancers on the stage for the first formation. 4. Press Duplicate in Timeline to create the next formation. 5. Move dancers to new positions. 6. If paths cross, select a dancer, press Create path, then drag the control point on stage. 7. Duration/Transition seconds controls speed in editor and Present. 8. Use Present for rehearsal and PDF for export.</p>
                    <p className="mt-2">Present keys: Left/Right to change formation, Space to replay current transition, Esc to exit.</p>
                  </div>
                  <div className="grid gap-4 text-sm leading-6 md:grid-cols-2">
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Projects</h3><p>Rename with title field and Save. Data saves to the Firebase account provided by admin. JSON is only for manual backup/import. Delete project asks for confirmation.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Stage</h3><p>Width, Height, and Grid configure the stage. BACKSTAGE is above, AUDIENCE is below, outside the stage. Grid shows guides, Snap locks dancers to grid points.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Dancers</h3><p>The + button adds one dancer. Select a dancer to edit name, label, shape, and color. Drag a dancer on stage to set its position for the active formation.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Timeline</h3><p>Formation adds a new formation. Duplicate copies the active formation. Use the mouse wheel over the timeline to scroll horizontally when there are many formations.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Path</h3><p>Path is not global for whole formation. Path belongs to one dancer in current formation, and describes how that dancer moves from previous formation to current formation. Example: in Formation 2, select Dancer 3, press Create path, drag round point so Dancer 3 moves around traffic. Other dancers stay unchanged. Use Straight to reset selected dancer path.</p></section>
                    <section className="rounded-lg border border-border p-4"><h3 className="mb-2 font-semibold">Share / PDF</h3><p>Share creates link containing current project data so another person can open web app and view copy. Original data saves to your Firebase account. PDF exports stage, paths, dancer list, and notes.</p></section>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {false && showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card p-5 text-foreground shadow-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">For Mun</p>
                  <h2 className="text-xl font-semibold">Hướng dẫn sử dụng</h2>
                </div>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowHelp(false)} aria-label="Đóng hướng dẫn">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm leading-6">
                <p className="font-semibold">Quy trinh nhanh cho nguoi moi:</p>
                <p>1. Tao project hoac chon demo. 2. Them dancers. 3. Keo dancer vao formation dau tien. 4. Bam Duplicate de tao formation tiep theo. 5. Keo dancer sang vi tri moi, he thong tu hien path va tu animate khi chuyen formation. 6. Neu duong di bi cat nhau, chon dancer va doi Path sang Curve, chinh Control X/Y. 7. Dung Present de tap, dung PDF de in/chia se.</p>
                <p className="mt-2">Phim tat trong Present: mui ten trai/phai de chuyen formation, Space de phat lai transition hien tai, Esc de thoat.</p>
              </div>
              <div className="grid gap-4 text-sm leading-6 md:grid-cols-2">
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Projects</h3>
                  <p>Tạo, chọn, nhân bản, xóa dự án. JSON dùng để sao lưu hoặc chuyển dữ liệu giữa máy.</p>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Stage</h3>
                  <p>Chỉnh Width, Height, Grid. BACKSTAGE là phía sau sân khấu, AUDIENCE là phía khán giả. Grid và Snap giúp đặt dancer đều hơn.</p>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Dancers</h3>
                  <p>Thêm từng dancer hoặc thêm nhanh 8 dancer. Bấm dancer để sửa tên, label, hình, màu và path.</p>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Formation</h3>
                  <p>Mỗi formation là một vị trí đội hình. Duplicate để copy đội hình trước, sau đó kéo dancer sang vị trí mới.</p>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Transition & path</h3>
                  <p>Paths hiển thị đường đi từ formation trước tới formation hiện tại. Chọn dancer để đổi Straight/Curve và chỉnh Control X/Y. Transition seconds chỉnh tốc độ di chuyển theo nhịp tập.</p>
                </section>
                <section className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">Present & PDF</h3>
                  <p>Present dùng để trình chiếu full-screen, chuyển bằng nút hoặc phím trái/phải, Space để animate, Esc để thoát. PDF xuất formation packet có stage, paths, legend và comment.</p>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default App;
