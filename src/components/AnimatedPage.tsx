import { motion } from "framer-motion";
import { pageVariants } from "@/lib/animations";

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
}

const AnimatedPage = ({ children, className }: AnimatedPageProps) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className={className}
  >
    {children}
  </motion.div>
);

export default AnimatedPage;
