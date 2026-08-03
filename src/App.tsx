import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { UserAvatarProvider } from "@/hooks/useUserAvatar";
import SentinelBackground from "@/components/SentinelBackground";
import SentinelClickRipple from "@/components/SentinelClickRipple";
import AnimatedPage from "@/components/AnimatedPage";
import { AnimatePresence, motion } from "framer-motion";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewsLanding = lazy(() => import("./pages/NewsLanding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ApiCreditsDashboard = lazy(() => import("./pages/ApiCreditsDashboard"));
const MediaGallery = lazy(() => import("./pages/MediaGallery"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SavedItems = lazy(() => import("./pages/SavedItems"));
const AgentTraces = lazy(() => import("./pages/AgentTraces"));
const Upload = lazy(() => import("./pages/Upload"));
const Customers = lazy(() => import("./pages/Customers"));

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="relative h-12 w-12">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          style={{
            boxShadow: "0 0 18px hsl(var(--primary) / 0.55)",
          }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border border-accent/40"
          animate={{ rotate: -360, opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <motion.span
        className="text-[10px] font-bold uppercase tracking-[0.32em] text-muted-foreground"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        Sentinel
      </motion.span>
    </motion.div>
  </div>
);

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!user.email?.toLowerCase().endsWith("@workday.com")) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const wrap = (node: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>
    <AnimatedPage>{node}</AnimatedPage>
  </Suspense>
);

// Global ambient background — rendered on every route, including /agent.
const GlobalBackground = () => {
  return <SentinelBackground />;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/auth" element={<AuthRoute>{wrap(<Auth />)}</AuthRoute>} />
        <Route path="/reset-password" element={wrap(<ResetPassword />)} />
        <Route path="/unauthorized" element={wrap(<Unauthorized />)} />
        <Route path="/" element={<ProtectedRoute>{wrap(<NewsLanding />)}</ProtectedRoute>} />
        <Route path="/agent" element={<ProtectedRoute>{wrap(<Dashboard />)}</ProtectedRoute>} />
        <Route path="/admin/api-credits" element={<ProtectedRoute>{wrap(<ApiCreditsDashboard />)}</ProtectedRoute>} />
        <Route path="/media-gallery" element={<ProtectedRoute>{wrap(<MediaGallery />)}</ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute>{wrap(<SavedItems />)}</ProtectedRoute>} />
        <Route path="/agent-traces" element={<ProtectedRoute>{wrap(<AgentTraces />)}</ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute>{wrap(<Upload />)}</ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute>{wrap(<Customers />)}</ProtectedRoute>} />
        <Route path="*" element={wrap(<NotFound />)} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SentinelClickRipple />
      <BrowserRouter>
        <GlobalBackground />
        <AuthProvider>
          <UserAvatarProvider>
            <AnimatedRoutes />
          </UserAvatarProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
