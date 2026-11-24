import { domMax, LazyMotion, MotionConfig, MotionGlobalConfig, type Transition } from "framer-motion";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
const MotionAllowed = createContext(true);
// MotionConfig captures skipAnimations at mount. The live flag also reaches already-mounted controls.
function syncPreference() {
  MotionGlobalConfig.skipAnimations = preference.matches;
}
syncPreference();
function subscribe(change: () => void) {
  const update = () => {
    syncPreference();
    change();
  };
  preference.addEventListener("change", update);
  return () => preference.removeEventListener("change", update);
}

export const settle = { type: "spring", stiffness: 500, damping: 38, mass: 0.7 } satisfies Transition;
export const reveal = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } };
export const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

export function useMotionAllowed() {
  return useContext(MotionAllowed);
}

export function AppMotion({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribe, () => preference.matches);
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="never" transition={{ duration: 0.18, ease: [0.2, 0.75, 0.25, 1] }}>
        <MotionAllowed.Provider value={!reduced}>{children}</MotionAllowed.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}
