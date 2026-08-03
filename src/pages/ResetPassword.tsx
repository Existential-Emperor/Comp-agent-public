import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, AlertCircle } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const setReadyIfMounted = () => {
      if (mountedRef.current) setReady(true);
    };
    const setErrorIfMounted = (msg: string) => {
      if (mountedRef.current) setVerifyError(msg);
    };

    // 1) Listen for PASSWORD_RECOVERY events (legacy implicit flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReadyIfMounted();
    });

    // 2) Parse URL for errors first (Supabase puts errors in either query or hash)
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription =
      url.searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      url.searchParams.get("error") ||
      hashParams.get("error");

    if (errorDescription) {
      setErrorIfMounted(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      return () => {
        mountedRef.current = false;
        subscription.unsubscribe();
      };
    }

    // 3) PKCE flow: ?code=...
    const code = url.searchParams.get("code");
    if (code) {
      (async () => {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!mountedRef.current) return;
        if (error) {
          setErrorIfMounted(
            error.message.includes("expired") || error.message.includes("invalid")
              ? "This reset link is invalid or has expired. Please request a new one."
              : error.message
          );
        } else {
          window.history.replaceState({}, "", window.location.pathname);
          setReadyIfMounted();
        }
      })();
    } else if (window.location.hash.includes("type=recovery")) {
      // 4) Legacy implicit hash flow (token still present in URL)
      setReadyIfMounted();
    } else {
      // 5) Implicit flow where supabase-js already auto-consumed the hash
      // before this component mounted (detectSessionInUrl strips it after
      // AuthProvider's getSession()). If a session exists on /reset-password,
      // the recovery succeeded — show the form.
      (async () => {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current) return;
        if (data.session) setReadyIfMounted();
      })();
    }

    // 5) Timeout safety net
    const timeout = setTimeout(() => {
      if (mountedRef.current && !verifyErrorRef.current && !readyRef.current) {
        setErrorIfMounted(
          "We couldn't verify this reset link. It may have expired or already been used. Please request a new one."
        );
      }
    }, 6000);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs to read latest values inside the timeout without re-running the effect
  const readyRef = useRef(false);
  const verifyErrorRef = useRef<string | null>(null);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    verifyErrorRef.current = verifyError;
  }, [verifyError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      navigate("/");
    }
    setLoading(false);
  };

  if (verifyError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Reset link issue
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Link not valid</h1>
          </div>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">We couldn't verify your link</CardTitle>
              <CardDescription>{verifyError}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => navigate("/auth")}>
                Request a new reset link
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Tip: open the email link in a fresh browser tab. Some email clients (e.g. Outlook Safe Links) pre-scan links and can consume the one-time token before you click.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p>Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <Shield className="h-4 w-4" />
            Competitive Intelligence
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Set New Password</h1>
        </div>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">New password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="bg-background/50" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
