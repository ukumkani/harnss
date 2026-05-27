import { memo, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, FolderOpen } from "lucide-react";
import {
  getContinueMessage,
  getNextContinueMessageDelay,
  shouldRefreshContinueMessage,
  type ContinueMessage,
} from "@/lib/welcome-screen";

// ── Constants ─────────────────────────────────────────────────────────

const EASE_OUT: [number, number, number, number] = [0.22, 0.68, 0, 1];
const DISPLAY_FONT = "'Instrument Serif', Georgia, serif";

// ── Ambient Background ───────────────────────────────────────────────

function AmbientBackground({ accent }: { accent?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Central accent halo — slow breathe tied to the greeting's mood color */}
      <motion.div
        className="absolute top-1/2 left-1/2 h-[70%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: accent
            ? `radial-gradient(ellipse 50% 50% at 50% 50%, ${accent} 0%, transparent 70%)`
            : "radial-gradient(ellipse 50% 50% at 50% 50%, var(--foreground) 0%, transparent 70%)",
          opacity: 0.06,
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.06, 0.08, 0.06] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Drifting orb — top-right, very faint */}
      <motion.div
        className="absolute -top-[15%] -right-[10%] h-[45%] w-[40%] rounded-full opacity-[0.025] blur-[140px]"
        style={{ background: "radial-gradient(circle, var(--foreground) 0%, transparent 70%)" }}
        animate={{ x: [0, -20, 10, 0], y: [0, 15, -10, 0] }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ── Noise Grain Overlay ───────────────────────────────────────────────

function GrainOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.015] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "128px 128px",
      }}
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────

interface WelcomeScreenProps {
  hasProjects: boolean;
  onCreateProject: () => void;
}

export const WelcomeScreen = memo(function WelcomeScreen({
  hasProjects,
  onCreateProject,
}: WelcomeScreenProps) {
  const [continueMessage, setContinueMessage] = useState<ContinueMessage>(() =>
    getContinueMessage(),
  );
  const lastRefreshAtRef = useRef(new Date());

  useEffect(() => {
    if (!hasProjects) {
      return;
    }

    let refreshTimer: number | null = null;

    function refreshMessage(now: Date) {
      lastRefreshAtRef.current = now;
      setContinueMessage((previous) => getContinueMessage(previous, now));
    }

    function queueNextRefresh() {
      const delay = getNextContinueMessageDelay();
      refreshTimer = window.setTimeout(() => {
        refreshMessage(new Date());
        queueNextRefresh();
      }, delay);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        return;
      }

      const now = new Date();
      if (!shouldRefreshContinueMessage(lastRefreshAtRef.current, now)) {
        return;
      }

      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      refreshMessage(now);
      queueNextRefresh();
    }

    queueNextRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasProjects]);

  // --- No projects state ---
  if (!hasProjects) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
        <AmbientBackground />
        <GrainOverlay />

        <motion.div
          className="relative z-10 flex flex-col items-center gap-8 px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <h1
              className="text-5xl"
              style={{ fontFamily: DISPLAY_FONT, color: "oklch(0.65 0.22 25)" }}
            >
              Open a project
            </h1>
            <p className="max-w-[300px] text-center text-base leading-relaxed text-muted-foreground">
              Choose a folder to anchor your sessions, tools, and file context.
            </p>
          </motion.div>

          <motion.button
            onClick={onCreateProject}
            className="group flex items-center gap-2.5 rounded-full bg-foreground px-8 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-85"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <FolderOpen className="h-4 w-4" />
            Choose folder
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // --- Has projects, no active session ---
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Central content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          {/* Headline */}
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <motion.h1
              key={continueMessage.headline}
              className="text-5xl"
              style={{ fontFamily: DISPLAY_FONT, color: continueMessage.accent }}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              {continueMessage.headline}
            </motion.h1>
            <motion.p
              key={continueMessage.subtitle}
              className="max-w-[min(92vw,640px)] text-center text-base leading-relaxed text-muted-foreground"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT }}
            >
              {continueMessage.subtitle}
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
});
