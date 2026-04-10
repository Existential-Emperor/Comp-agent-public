import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { UserAvatarProvider } from "@/hooks/useUserAvatar";
import Starfield from "@/components/Starfield";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewsLanding = lazy(() => import("./pages/NewsLanding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ApiCreditsDashboard = lazy(() => import("./pages/ApiCreditsDashboard"));
const MediaGallery = lazy(() => import("./pages/MediaGallery"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SavedItems = lazy(() => import("./pages/SavedItems"));

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Starfield className="z-0" />
      <BrowserRouter>
        <AuthProvider>
          <UserAvatarProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Suspense fallback={<PageLoader />}><Auth /></Suspense></AuthRoute>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="/unauthorized" element={<Suspense fallback={<PageLoader />}><Unauthorized /></Suspense>} />
            <Route path="/" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><NewsLanding /></Suspense></ProtectedRoute>} />
            <Route path="/agent" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ProtectedRoute>} />
            <Route path="/admin/api-credits" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ApiCreditsDashboard /></Suspense></ProtectedRoute>} />
            <Route path="/media-gallery" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MediaGallery /></Suspense></ProtectedRoute>} />
            <Route path="/saved" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><SavedItems /></Suspense></ProtectedRoute>} />
            <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
          </Routes>
          </UserAvatarProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
