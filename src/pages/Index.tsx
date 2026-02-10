import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, Users, CheckCircle } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground">
              NextGen
              <span className="text-primary block mt-2">ERP</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              NextGen ERP — Manage tasks across design teams efficiently.
              Streamline workflows from assignment to approval.
            </p>
          </div>

          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="group">
              Get Started
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="space-y-3 p-6 rounded-lg bg-card border">
              <Shield className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-semibold">Secure & Reliable</h3>
              <p className="text-muted-foreground">
                Role-based access control ensures the right people see the right data.
              </p>
            </div>
            <div className="space-y-3 p-6 rounded-lg bg-card border">
              <Users className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-semibold">Team Assignment</h3>
              <p className="text-muted-foreground">
                Assign tasks to entire teams, not individuals. Let teams manage their own workload.
              </p>
            </div>
            <div className="space-y-3 p-6 rounded-lg bg-card border">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-semibold">Track & Approve</h3>
              <p className="text-muted-foreground">
                Monitor task progress, review submissions, and approve designs seamlessly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
