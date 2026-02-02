import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TrackingUser {
  id: string;
  full_name: string | null;
  email: string;
}

export const useTrackingUsers = () => {
  return useQuery({
    queryKey: ["tracking-users"],
    queryFn: async () => {
      // Get all users with project_manager or front_sales role
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["project_manager", "front_sales"]);

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

      return (profiles || []) as TrackingUser[];
    },
  });
};
