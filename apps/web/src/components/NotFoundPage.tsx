import { Link } from "@tanstack/react-router";
import { Bomb, Home, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Robot Face Component with eye tracking
function RobotFace({
  mousePos,
  ariaLabel,
}: {
  mousePos: { x: number; y: number };
  ariaLabel: string;
}) {
  const leftEyeRef = useRef<SVGCircleElement>(null);
  const rightEyeRef = useRef<SVGCircleElement>(null);
  const containerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!(containerRef.current && leftEyeRef.current && rightEyeRef.current)) {
      return;
    }

    const leftEye = leftEyeRef.current;
    const rightEye = rightEyeRef.current;

    // Calculate eye movement
    const moveEye = (eye: SVGCircleElement, eyeCx: number, eyeCy: number) => {
      const eyeRect = eye.getBoundingClientRect();
      const eyeCenterX = eyeRect.left + eyeRect.width / 2;
      const eyeCenterY = eyeRect.top + eyeRect.height / 2;

      const angle = Math.atan2(
        mousePos.y - eyeCenterY,
        mousePos.x - eyeCenterX
      );
      const distance = Math.min(
        3,
        Math.hypot(mousePos.x - eyeCenterX, mousePos.y - eyeCenterY) / 50
      );

      const offsetX = Math.cos(angle) * distance;
      const offsetY = Math.sin(angle) * distance;

      eye.setAttribute("cx", `${eyeCx + offsetX}`);
      eye.setAttribute("cy", `${eyeCy + offsetY}`);
    };

    moveEye(leftEye, 85, 100);
    moveEye(rightEye, 115, 100);
  }, [mousePos]);

  return (
    <svg
      aria-label={ariaLabel}
      className="h-44 w-48 md:h-56 md:w-64"
      ref={containerRef}
      role="img"
      viewBox="0 0 200 180"
    >
      {/* Robot Head */}
      <defs>
        <linearGradient id="robotGradient" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1e1e" />
          <stop offset="100%" stopColor="#2d2d2d" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur result="coloredBlur" stdDeviation="2" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Antenna */}
      <line stroke="#444" strokeWidth="3" x1="100" x2="100" y1="20" y2="45" />
      <circle className="animate-pulse" cx="100" cy="15" fill="#ee971c" r="8">
        <animate
          attributeName="opacity"
          dur="2s"
          repeatCount="indefinite"
          values="1;0.5;1"
        />
      </circle>

      {/* Head Shape */}
      <rect
        fill="url(#robotGradient)"
        height="100"
        rx="20"
        stroke="#444"
        strokeWidth="2"
        width="120"
        x="40"
        y="45"
      />

      {/* Screen/Crack effect */}
      <line
        opacity="0.6"
        stroke="#ff3b30"
        strokeWidth="1"
        x1="130"
        x2="145"
        y1="60"
        y2="75"
      />
      <line
        opacity="0.6"
        stroke="#ff3b30"
        strokeWidth="1"
        x1="145"
        x2="140"
        y1="75"
        y2="85"
      />

      {/* Eyes Container */}
      <ellipse
        cx="85"
        cy="100"
        fill="#0a0a0a"
        rx="22"
        ry="18"
        stroke="#333"
        strokeWidth="2"
      />
      <ellipse
        cx="115"
        cy="100"
        fill="#0a0a0a"
        rx="22"
        ry="18"
        stroke="#333"
        strokeWidth="2"
      />

      {/* Eye Glow */}
      <circle
        cx="85"
        cy="100"
        fill="#00ff88"
        filter="url(#glow)"
        r="8"
        ref={leftEyeRef}
      >
        <animate
          attributeName="fill"
          dur="3s"
          repeatCount="indefinite"
          values="#00ff88;#00cc6a;#00ff88"
        />
      </circle>
      <circle
        cx="115"
        cy="100"
        fill="#00ff88"
        filter="url(#glow)"
        r="8"
        ref={rightEyeRef}
      >
        <animate
          attributeName="fill"
          dur="3s"
          repeatCount="indefinite"
          values="#00ff88;#00cc6a;#00ff88"
        />
      </circle>

      {/* Eye Pupils */}
      <circle cx="85" cy="100" fill="#000" r="3" ref={leftEyeRef} />
      <circle cx="115" cy="100" fill="#000" r="3" ref={rightEyeRef} />

      {/* Mouth - Confused expression */}
      <path
        d="M 85 135 Q 100 140 115 130"
        fill="none"
        stroke="#666"
        strokeLinecap="round"
        strokeWidth="3"
      />

      {/* Error indicator */}
      <text
        fill="#ff3b30"
        fontFamily="monospace"
        fontSize="10"
        textAnchor="middle"
        x="100"
        y="165"
      >
        ERROR 404
      </text>
    </svg>
  );
}

// Glitchy 404 Text
function Glitch404() {
  const [displayText, setDisplayText] = useState("404");
  const [isGlitching, setIsGlitching] = useState(false);

  const triggerGlitch = useCallback(() => {
    if (isGlitching) {
      return;
    }
    setIsGlitching(true);

    const chars = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    let iterations = 0;
    const maxIterations = 10;

    const interval = setInterval(() => {
      setDisplayText(
        "404"
          .split("")
          .map((char, index) => {
            if (index < iterations / 2) {
              return char;
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("")
      );

      iterations++;
      if (iterations > maxIterations) {
        clearInterval(interval);
        setDisplayText("404");
        setIsGlitching(false);
      }
    }, 50);
  }, [isGlitching]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      triggerGlitch();
    }
  };

  return (
    <button
      className="cursor-pointer select-none bg-transparent p-0 font-black text-8xl tracking-tighter md:text-9xl"
      onClick={triggerGlitch}
      onKeyDown={handleKeyDown}
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: "transparent",
        WebkitTextStroke: "2px #00ff88",
        textShadow: isGlitching
          ? "2px 0 #ff3b30, -2px 0 #00805f"
          : "4px 4px 0 rgba(0,128,95,0.3)",
      }}
      type="button"
    >
      {displayText}
    </button>
  );
}

// Binary Rain Background
function BinaryRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const columns = Math.floor(canvas.width / 12);
    const drops: number[] = new Array(columns).fill(1);
    const chars = "01";

    let animationId: number;
    let frameCount = 0;

    const draw = () => {
      frameCount++;
      // Draw every 2nd frame for smoother animation
      if (frameCount % 2 !== 0) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      // Clear with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(0, 160, 119, 0.9)";
      ctx.font = "bold 16px monospace";

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 12, drops[i] * 14);

        if (drops[i] * 14 > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      className="pointer-events-none absolute inset-0 z-0"
      ref={canvasRef}
      style={{ opacity: 0.5 }}
    />
  );
}

// Terminal Easter Egg
function TerminalEasterEgg({
  isVisible,
  onClose,
  t,
}: {
  isVisible: boolean;
  onClose: () => void;
  t: (key: string) => string;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-[#00ff88] bg-[#0a0a0a] p-6 shadow-2xl shadow-[#00ff88]/20">
        <div className="mb-4 flex items-center justify-between border-[#333] border-b pb-2">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-[#ff3b30]" />
            <div className="h-3 w-3 rounded-full bg-[#f0c814]" />
            <div className="h-3 w-3 rounded-full bg-[#00805f]" />
          </div>
          <span className="font-mono text-[#666] text-sm">
            {t("notFound.help.terminalTitle")}
          </span>
        </div>
        <div className="space-y-2 font-mono text-[#00ff88] text-sm">
          <p>{t("notFound.help.terminalIntro")}</p>
          <p>{t("notFound.help.analyzing")}</p>
          <p className="text-white">{t("notFound.help.availableCommands")}</p>
          <ul className="ml-4 space-y-1 text-[#97c699]">
            <li>{`• "home" - ${t("notFound.help.commands.home")}`}</li>
            <li>{`• "konami" - ${t("notFound.help.commands.konami")}`}</li>
            <li>{`• "zias" - ${t("notFound.help.commands.zias")}`}</li>
            <li>{`• "retry" - ${t("notFound.help.commands.retry")}`}</li>
            <li>{`• "panic" - ${t("notFound.help.commands.panic")}`}</li>
          </ul>
          <p className="mt-4 text-[#666]">{t("notFound.help.closeHint")}</p>
        </div>
        <Button
          className="mt-6 bg-[#00ff88] font-mono text-black hover:bg-[#00cc6a]"
          onClick={onClose}
        >
          {t("notFound.help.closeButton")}
        </Button>
      </div>
    </div>
  );
}

// Confetti Component
function Confetti({ isActive }: { isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      rotation: number;
      rotationSpeed: number;
    }> = [];

    const colors = ["#00805f", "#00ff88", "#ee971c", "#97c699", "#f0c814"];

    for (let i = 0; i < 100; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20 - 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
      });
    }

    let animationId: number;
    const gravity = 0.5;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.restore();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const timeout = setTimeout(() => {
      cancelAnimationFrame(animationId);
    }, 3000);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(timeout);
    };
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <canvas
      className="pointer-events-none fixed inset-0 z-50"
      ref={canvasRef}
    />
  );
}

// Main Not Found Component
export function NotFoundComponent() {
  const { t } = useTranslation();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showTerminal, setShowTerminal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selfDestructClicks, setSelfDestructClicks] = useState(0);
  const [showSelfDestructMessage, setShowSelfDestructMessage] = useState(false);
  const [_typedKeys, setTypedKeys] = useState("");

  // Track mouse for robot eyes
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Konami code detection
  useEffect(() => {
    const konami = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ];
    let konamiIndex = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Terminal toggle with "help"
      setTypedKeys((prev) => {
        const newKeys = (prev + e.key.toLowerCase()).slice(-4);
        if (newKeys === "help") {
          setShowTerminal(true);
          return "";
        }
        return newKeys;
      });

      // Konami code
      if (e.key === konami[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konami.length) {
          setShowConfetti(true);
          konamiIndex = 0;
          setTimeout(() => setShowConfetti(false), 3000);
        }
      } else {
        konamiIndex = 0;
      }

      // Close terminal with ESC
      if (e.key === "Escape") {
        setShowTerminal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelfDestruct = () => {
    const newClicks = selfDestructClicks + 1;
    setSelfDestructClicks(newClicks);

    if (newClicks >= 3) {
      setShowSelfDestructMessage(true);
      setSelfDestructClicks(0);
      setTimeout(() => setShowSelfDestructMessage(false), 3000);
    }
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-transparent">
      <BinaryRain />
      <Confetti isActive={showConfetti} />
      <TerminalEasterEgg
        isVisible={showTerminal}
        onClose={() => setShowTerminal(false)}
        t={t}
      />

      {/* Main Content */}
      <div className="relative z-20 flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-12">
        {/* Robot */}
        <div className="relative mb-8">
          <RobotFace
            ariaLabel={t("notFound.robotAriaLabel")}
            mousePos={mousePos}
          />

          {/* Speech bubble */}
          <div className="absolute -top-4 -right-4 max-w-[200px] animate-bounce rounded-2xl rounded-bl-none bg-white p-3 text-black text-sm shadow-lg md:-right-12">
            <p className="font-medium">
              {showConfetti
                ? t("notFound.speechBubble.success")
                : t("notFound.speechBubble.normal")}
            </p>
          </div>
        </div>

        {/* 404 with glitch effect */}
        <div className="mb-6 text-center">
          <Glitch404 />
          <p className="mt-4 font-mono text-lg text-primary md:text-xl">
            {t("notFound.systemError")}
          </p>
          <p className="mt-2 font-mono text-muted-foreground text-sm">
            {t("notFound.suggestion")}
          </p>
        </div>

        {/* Error Message */}
        <div className="mb-8 max-w-md space-y-2 text-center">
          <h2 className="font-bold text-2xl text-foreground">
            {t("notFound.heading")}
          </h2>
          <p className="text-muted-foreground">{t("notFound.description")}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Link to="/">
            <Button
              className="group gap-2 bg-primary px-8 font-semibold text-white hover:bg-primary/90"
              size="lg"
            >
              <Home className="h-4 w-4 transition-transform group-hover:scale-110" />
              {t("notFound.buttons.takeMeHome")}
            </Button>
          </Link>

          <Button
            className="gap-2 border-border text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => window.location.reload()}
            size="lg"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
            {t("notFound.buttons.tryAgain")}
          </Button>
        </div>

        {/* Self Destruct Easter Egg */}
        <div className="mt-12">
          <button
            className="flex items-center gap-1 font-mono text-destructive text-xs opacity-50 transition-colors hover:opacity-100"
            onClick={handleSelfDestruct}
            type="button"
          >
            <Bomb className="h-3 w-3" />
            {selfDestructClicks > 0
              ? t("notFound.selfDestruct.labelWithCount", {
                  count: 3 - selfDestructClicks,
                })
              : t("notFound.selfDestruct.label")}
          </button>
        </div>

        {/* Self Destruct Message */}
        {showSelfDestructMessage && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90">
            <div className="p-8 text-center">
              <Sparkles className="mx-auto mb-4 h-16 w-16 animate-spin text-[#ee971c]" />
              <p className="mb-2 font-bold text-2xl text-white">
                {t("notFound.selfDestruct.sequenceTitle")}
              </p>
              <p className="font-mono text-[#666]">
                {t("notFound.selfDestruct.joke")}
              </p>
            </div>
          </div>
        )}

        {/* Footer with link to zias.be */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            <span>{t("notFound.footer.blameText")}</span>
            <a
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              href="https://zias.be"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("notFound.footer.tellZias")}
            </a>
          </div>
          <p className="mt-2 font-mono text-muted-foreground text-xs">
            {t("notFound.help.hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
