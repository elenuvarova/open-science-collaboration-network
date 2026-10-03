import { useRef } from "react";
import { AnimatePresence, m, useIsPresent } from "motion/react";

// A count that rolls to its new value: up when it grows, down when it shrinks.
// The outgoing number stays in the DOM for its exit, hidden from assistive tech,
// so an accessible name built around it ("Compare (3)") never reads two values.
const variants = {
  enter: (dir) => ({ y: dir > 0 ? "70%" : "-70%", opacity: 0 }),
  center: { y: "0%", opacity: 1, transition: { duration: 0.2 } },
  exit: (dir) => ({ y: dir > 0 ? "-70%" : "70%", opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }),
};

function Value({ value, dir }) {
  const present = useIsPresent();
  return (
    <m.span custom={dir} variants={variants} initial="enter" animate="center" exit="exit"
      aria-hidden={present ? undefined : true}>
      {value}
    </m.span>
  );
}

export default function RollingNumber({ value }) {
  const last = useRef({ value, dir: 1 });
  if (last.current.value !== value) {
    last.current = { value, dir: value > last.current.value ? 1 : -1 };
  }
  const { dir } = last.current;
  return (
    <span className="roll">
      <AnimatePresence initial={false} custom={dir}>
        <Value key={value} value={value} dir={dir} />
      </AnimatePresence>
    </span>
  );
}
