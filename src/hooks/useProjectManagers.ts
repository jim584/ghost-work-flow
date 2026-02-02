import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProjectManager {
  id: string;
  full_name: string | null;
  email: string;
}

export const useProjectManagers = () => {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: async () => {
      // Get all users with project_manager role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "project_manager");

      if (roleError) throw roleError;

      if (!roleData || roleData.length === 0) {
        return [];
      }

      const userIds = roleData.map((r) => r.user_id);

      // Get profile information for these users
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profileError) throw profileError;

      return (profiles || []) as ProjectManager[];
    },
  });
};
