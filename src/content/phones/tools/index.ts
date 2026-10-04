// src/content/phones/tools/index.ts

import accelerometerImage from "@/assets/images/phones/tools/accelerometer-test.png";
import gyroscopeImage from "@/assets/images/phones/tools/gyroscope-test.png";
import micImage from "@/assets/images/phones/tools/mic-test.png";
import screenImage from "@/assets/images/phones/tools/screen-test.png";
import speakerImage from "@/assets/images/phones/tools/speaker-test.png";
import stuckPixelHelperImage from "@/assets/images/phones/tools/stuck-pixel-fixer.png";
import touchImage from "@/assets/images/phones/tools/touch-test.png";
import type { ImageMetadata } from "astro";

export type ToolIndexItem = {
  title: string;
  slug: string;
  href: string;
  description: string;
  image: ImageMetadata;
};

export const toolsIndex: ToolIndexItem[] = [
  {
    title: "Online Display Testing Tool",
    slug: "screen-test",
    href: "/phones/tools/screen-test",
    description:
      "Run an online screen test with full-screen color, grayscale, gradient, banding, sharpness, black and white level, motion, image retention, and gamma patterns.",
    image: screenImage,
  },
  {
    title: "Stuck Pixel Diagnosis and Repair Tool",
    slug: "stuck-pixel-fixer",
    href: "/phones/tools/stuck-pixel-fixer",
    description:
      "Diagnose stuck, hot, or dead pixels, mark affected areas, then try targeted static noise or color cycles with adjustable spot, speed, and timer controls.",
    image: stuckPixelHelperImage,
  },
  {
    title: "Touchscreen Tester: Touch and Dead Zone Checks",
    slug: "touch-test",
    href: "/phones/tools/touch-test",
    description:
      "Check touchscreen dead zones, multi-touch contacts, tap precision, ghost touches, and tracking drift with browser-based grids, targets, guides, and live data.",
    image: touchImage,
  },
  {
    title: "Online Speaker & Audio Testing Tool",
    slug: "speaker-test",
    href: "/phones/tools/speaker-test",
    description:
      "Check stereo, mono, left, and right audio with adjustable tones, noise, an 80 Hz to 8 kHz sweep, fixed presets, water eject, and an informal hearing-range check.",
    image: speakerImage,
  },
  {
    title: "Online Mic Testing Tool",
    slug: "mic-test",
    href: "/phones/tools/mic-test",
    description:
      "Check microphone input level, noise floor, SNR, peak and clipping, view waveform, spectrum and level graphs, then record and play back a 10-second sample.",
    image: micImage,
  },
  {
    title: "Accelerometer Tester: Motion Sensor Checks",
    slug: "accelerometer-test",
    href: "/phones/tools/accelerometer-test",
    description:
      "Check X, Y, and Z acceleration, gravity, tilt, lift, shakes, peak force, noise, and 3D orientation directly in your browser.",
    image: accelerometerImage,
  },
  {
    title: "Gyroscope Tester: Rotation Sensor Checks",
    slug: "gyroscope-test",
    href: "/phones/tools/gyroscope-test",
    description:
      "Check pitch, roll, yaw, X, Y, and Z rotation rates, twist direction, peak spin, and drift. Capture a local zero-rate offset directly in your browser.",
    image: gyroscopeImage,
  },
];

export function getToolBySlug(slug: string): ToolIndexItem {
  const tool = toolsIndex.find((item) => item.slug === slug);
  if (!tool) {
    throw new Error(`Unknown phone tool: ${slug}`);
  }
  return tool;
}
