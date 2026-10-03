import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("./features.js").then((mod) => mod.default);

// One place for the app's motion defaults. `reducedMotion="user"` turns transform
// and layout animation off for people who ask the OS for less motion (opacity
// fades stay); the CSS side is handled by the prefers-reduced-motion block in
// styles.css. Ease and timing mirror the --ease-out / --dur-ui tokens.
export const EASE_OUT = [0.22, 1, 0.36, 1];

export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
