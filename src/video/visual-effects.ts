export type VisualStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";

export type MotionFrame = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

/**
 * Gives still photos a deliberate Ken Burns move instead of a static crop.
 * The pattern is deterministic, so rendering does not need random/timer state.
 */
export function getPhotoMotion(
  progress: number,
  cutIndex: number,
  style: VisualStyle,
  width: number,
  height: number
): MotionFrame {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  const amplitude = style === "velocity" ? 0.105 : style === "anime" ? 0.075 : style === "story" ? 0.035 : 0.065;
  const panX = width * (style === "velocity" ? 0.035 : 0.022);
  const panY = height * (style === "velocity" ? 0.026 : 0.018);
  const move = cutIndex % 6;

  switch (move) {
    case 0:
      return { zoom: 1.025 + eased * amplitude, offsetX: 0, offsetY: 0 };
    case 1:
      return { zoom: 1.025 + (1 - eased) * amplitude, offsetX: 0, offsetY: 0 };
    case 2:
      return { zoom: 1.045, offsetX: (0.5 - eased) * panX, offsetY: 0 };
    case 3:
      return { zoom: 1.045, offsetX: (eased - 0.5) * panX, offsetY: 0 };
    case 4:
      return { zoom: 1.045, offsetX: 0, offsetY: (0.5 - eased) * panY };
    default:
      return { zoom: 1.035 + Math.sin(p * Math.PI) * amplitude * 0.72, offsetX: (eased - 0.5) * panX * 0.55, offsetY: (0.5 - eased) * panY * 0.55 };
  }
}

/**
 * Adds restrained, style-aware overlays without loading a heavy rendering
 * library. These effects are drawn directly on the canvas and work offline.
 */
export function drawVisualOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  cutProgress: number,
  cutIndex: number,
  style: VisualStyle,
  isStillImage: boolean
): void {
  const p = Math.max(0, Math.min(1, progress));

  if (style === "cinematic" && cutIndex % 3 === 1) {
    const sweepX = (p * 1.6 - 0.3) * width;
    const sweep = context.createLinearGradient(sweepX - width * 0.18, 0, sweepX + width * 0.18, height * 0.25);
    sweep.addColorStop(0, "rgba(255,190,115,0)");
    sweep.addColorStop(0.5, "rgba(255,210,155,0.075)");
    sweep.addColorStop(1, "rgba(255,190,115,0)");
    context.fillStyle = sweep;
    context.fillRect(0, 0, width, height);
  }

  if (style === "velocity" && !isStillImage && cutProgress >= 0 && cutProgress < 0.11) {
    const strength = (1 - cutProgress / 0.11) * 0.12;
    context.save();
    context.globalAlpha = strength;
    context.lineWidth = Math.max(2, width * 0.003);
    context.strokeStyle = "#eaf7ff";
    for (let line = 0; line < 5; line += 1) {
      const y = height * (0.2 + line * 0.14);
      context.beginPath();
      context.moveTo(width * 0.54, y);
      context.lineTo(width * (0.8 + line * 0.025), y - height * 0.025);
      context.stroke();
    }
    context.restore();
  }

  if (style === "anime" && isStillImage && cutIndex % 2 === 0) {
    const glow = context.createRadialGradient(width * 0.78, height * 0.18, 0, width * 0.78, height * 0.18, width * 0.58);
    glow.addColorStop(0, "rgba(125,205,255,0.12)");
    glow.addColorStop(1, "rgba(125,205,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  if (style === "glitch" && cutProgress >= 0 && cutProgress < 0.08) {
    const alpha = (1 - cutProgress / 0.08) * 0.08;
    context.fillStyle = `rgba(20,220,255,${alpha})`;
    context.fillRect(0, Math.round(height * 0.38), width, Math.max(2, Math.round(height * 0.008)));
    context.fillStyle = `rgba(255,35,100,${alpha})`;
    context.fillRect(0, Math.round(height * 0.62), width, Math.max(2, Math.round(height * 0.006)));
  }
}
