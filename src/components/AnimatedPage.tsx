import { motion } from "framer-motion";
import { useState } from "react";

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Smooth Sentinel page transition wrapper.
 *
 * IMPORTANT: We animate transform/filter only during the entry animation,
 * then strip them after completion. This prevents the wrapper from creating
 * a CSS "containing block" that would scope `position: fixed` descendants
 * (like the Feed Agent chat panel) to the wrapper instead of the viewport.
 */
const AnimatedPage = ({ children, className }: AnimatedPageProps) => {
  const [animating, setAnimating] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(6px)" }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      }}
      exit={{
        opacity: 0,
        y: -8,
        scale: 0.99,
        filter: "blur(4px)",
        transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
      }}
      onAnimationComplete={(definition) => {
        // Only clear after entry animation completes (not exit)
        if (typeof definition === "object" && "opacity" in definition && definition.opacity === 1) {
          setAnimating(false);
        }
      }}
      style={
        animating
          ? undefined
          : {
              // Remove transform/filter so position:fixed children anchor to viewport
              transform: "none",
              filter: "none",
            }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedPage;
