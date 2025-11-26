import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import AdminDashboard from "@/components/dashboards/AdminDashboard";
import PMDashboard from "@/components/dashboards/PMDashboard";
import DesignerDashboard from "@/components/dashboards/DesignerDashboard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Dashboard = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-foreground">No Role Assigned</h2>
          <p className="text-muted-foreground">Please contact an administrator to assign you a role.</p>
          <p className="text-sm text-muted-foreground">Or sign out and create a new account with a role.</p>
          <Button onClick={async () => {
            try {
              await supabase.auth.signOut();
            } catch (error) {
              console.log("Sign out error (clearing anyway):", error);
            }
            // Force clear all auth data
            localStorage.clear();
            sessionStorage.clear();
            // Force redirect
            window.location.href = "/auth";
          }}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  switch (role) {
    case "admin":
      return <AdminDashboard />;
    case "project_manager":
      return <PMDashboard />;
    case "designer":
      return <DesignerDashboard />;
    default:
      return <Navigate to="/auth" replace />;
  }
};

export default Dashboard;
