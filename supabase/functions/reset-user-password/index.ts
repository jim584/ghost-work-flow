import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { data: roleCheck } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!roleCheck) {
      throw new Error("Only admins can reset user passwords");
    }

    const { userId, redirectTo } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

    // Get user email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userData.user?.email) {
      throw new Error("User not found");
    }

    // Generate password reset link with custom redirect
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
      options: {
        redirectTo: redirectTo || `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify`,
      },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password reset link generated",
        resetLink: data.properties.action_link 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400 
      }
    );
  }
});
