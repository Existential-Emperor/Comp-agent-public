import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import workdayLogo from "@/assets/workday-logo-full.svg";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { fadeInUp, scaleIn } from "@/lib/animations";

const REMEMBER_KEY = "ci_remember_email";

type View = "login" | "signup" | "forgot";

const Auth = () => {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Load saved email on mount (never store passwords)
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
      // Clean up any old credential storage
      localStorage.removeItem("ci_remember_creds");
    } catch { /* ignore */ }
  }, []);

  const saveEmail = (email: string) => {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    } else {
      saveEmail(email);
      navigate("/");
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith("@workday.com")) {
      toast({ title: "Access restricted", description: "Only @workday.com email addresses can sign up for this product.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      const { error: loginError } = await signIn(email, password);
      if (loginError) {
        toast({ title: "Account created", description: "Please sign in with your credentials." });
        setView("login");
      } else {
        saveEmail(email);
        navigate("/");
      }
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent you a password reset link. Click it to set your new password." });
      setView("login");
    }
    setLoading(false);
  };

  const switchView = (v: View) => {
    setView(v);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        className="w-full max-w-md space-y-8"
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.12 } } }}
      >
        <motion.div variants={fadeInUp} className="text-center space-y-4 relative">
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <img
              src={workdayLogo}
              alt="Workday"
              className="h-12 w-auto"
            />
          </motion.div>
          <div className="space-y-2">
            <h1 className="text-signal text-5xl sm:text-6xl font-bold tracking-[0.18em] uppercase leading-[1.05] whitespace-nowrap">
              Sentinel
            </h1>
            <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Competitive Intelligence, On Watch.
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeInUp} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">⚠️ Important</p>
          <p className="mt-1 text-amber-300/90">
            Please sign up / sign in with your <span className="font-semibold">@workday.com</span> email.
            <span className="font-semibold"> Do not use your AD (Active Directory) password.</span> Create a new app-specific password during sign-up.
          </p>
        </motion.div>

        <motion.div variants={scaleIn}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">
                {view === "login" && "Welcome back"}
                {view === "signup" && "Create account"}
                {view === "forgot" && "Reset password"}
              </CardTitle>
              <CardDescription>
                {view === "login" && "Sign in to access your intelligence dashboard"}
                {view === "signup" && "Get started with competitive intelligence"}
                {view === "forgot" && "Enter your email and choose a new password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnimatePresence mode="wait">
                {/* ---- LOGIN ---- */}
                {view === "login" && (
                  <motion.form
                    key="login"
                    onSubmit={handleLogin}
                    className="space-y-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <button type="button" onClick={() => switchView("forgot")} className="text-xs text-primary hover:underline">Forgot password?</button>
                      </div>
                      <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" className="bg-background/50" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="remember" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} />
                      <Label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">Click here to remember Email-id</Label>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign in
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      Don't have an account?{" "}
                      <button type="button" onClick={() => switchView("signup")} className="text-primary hover:underline font-medium">Sign up</button>
                    </p>
                  </motion.form>
                )}

                {/* ---- SIGNUP ---- */}
                {view === "signup" && (
                  <motion.form
                    key="signup"
                    onSubmit={handleSignup}
                    className="space-y-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="bg-background/50" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="bg-background/50" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="remember" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} />
                      <Label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">Click here to remember Email-id</Label>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create account
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <button type="button" onClick={() => switchView("login")} className="text-primary hover:underline font-medium">Sign in</button>
                    </p>
                  </motion.form>
                )}

                {/* ---- FORGOT PASSWORD ---- */}
                {view === "forgot" && (
                  <motion.form
                    key="forgot"
                    onSubmit={handleForgotPassword}
                    className="space-y-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="bg-background/50" />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Send reset link
                    </Button>
                    <p className="text-center">
                      <button type="button" onClick={() => switchView("login")} className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium">
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to sign in
                      </button>
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Auth;
