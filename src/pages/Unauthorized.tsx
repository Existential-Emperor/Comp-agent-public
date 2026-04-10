import { Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const Unauthorized = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <Shield className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Access Restricted</h1>
        <p className="text-muted-foreground">
          This product is only available to <span className="font-semibold text-foreground">@workday.com</span> email addresses.
        </p>
        {user?.email && (
          <p className="text-sm text-muted-foreground">
            You signed in as <span className="font-medium text-foreground">{user.email}</span>, which does not have access.
          </p>
        )}
        <Button onClick={handleSignOut} variant="outline" className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
};

export default Unauthorized;
