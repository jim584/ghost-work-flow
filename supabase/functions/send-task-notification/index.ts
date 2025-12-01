import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  taskId: string;
  notificationType: "new_task" | "revision_requested";
  taskTitle: string;
  revisionNotes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Always use admin client since this will be called by database triggers with service role
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { taskId, notificationType, taskTitle, revisionNotes }: NotificationRequest = await req.json();

    console.log(`Sending ${notificationType} notification for task: ${taskTitle}`);

    // Get task details including team
    const { data: task, error: taskError } = await supabaseClient
      .from("tasks")
      .select("team_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new Error("Task not found");
    }

    // Get team name
    const { data: team, error: teamNameError } = await supabaseClient
      .from("teams")
      .select("name")
      .eq("id", task.team_id)
      .single();

    const teamName = team?.name || "Your Team";

    // Get designers from the team - query separately to avoid RLS issues
    const { data: teamMembers, error: teamError } = await supabaseClient
      .from("team_members")
      .select("user_id")
      .eq("team_id", task.team_id);

    if (teamError) {
      console.error("Error fetching team members:", teamError);
      throw new Error("Failed to fetch team members");
    }

    if (!teamMembers || teamMembers.length === 0) {
      console.log("No team members found for this team");
      return new Response(
        JSON.stringify({ success: true, message: "No team members to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get profiles for these users
    const userIds = teamMembers.map(m => m.user_id);
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw new Error("Failed to fetch profiles");
    }

    // Get user roles to filter designers
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .eq("role", "designer");

    if (rolesError) {
      console.error("Error fetching user roles:", rolesError);
      throw new Error("Failed to fetch user roles");
    }

    const designerIds = new Set(userRoles?.map(r => r.user_id) || []);
    const designers = profiles?.filter(p => designerIds.has(p.id)) || [];

    if (designers.length === 0) {
      console.log("No designers found in this team");
      return new Response(
        JSON.stringify({ success: true, message: "No designers to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Send email to each designer
    const emailPromises = designers.map(async (designer) => {
      const designerEmail = designer.email;
      const designerName = designer.full_name || designerEmail;

      if (!designerEmail) return null;

      let subject = "";
      let htmlContent = "";

      if (notificationType === "new_task") {
        subject = `New Task Assigned: ${taskTitle}`;
        htmlContent = `
          <h2>New Task Assignment</h2>
          <p>Hello ${designerName},</p>
          <p>A new task has been assigned to your team: <strong>${teamName}</strong></p>
          <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #2563eb;">
            <h3 style="margin-top: 0;">${taskTitle}</h3>
          </div>
          <p>Please log in to your dashboard to view the task details and start working on it.</p>
          <p>Best regards,<br>Task Management System</p>
        `;
      } else {
        subject = `Revision Requested: ${taskTitle}`;
        htmlContent = `
          <h2>Revision Requested</h2>
          <p>Hello ${designerName},</p>
          <p>A revision has been requested for the task: <strong>${taskTitle}</strong></p>
          ${revisionNotes ? `
          <div style="margin: 20px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
            <h4 style="margin-top: 0;">Revision Notes:</h4>
            <p>${revisionNotes}</p>
          </div>
          ` : ''}
          <p>Please log in to your dashboard to view the revision details and update your submission.</p>
          <p>Best regards,<br>Task Management System</p>
        `;
      }

      try {
        const emailResponse = await resend.emails.send({
          from: "Task Manager <onboarding@resend.dev>",
          to: [designerEmail],
          subject: subject,
          html: htmlContent,
        });

        console.log(`Email sent to ${designerEmail}:`, emailResponse);
        return emailResponse;
      } catch (emailError) {
        console.error(`Failed to send email to ${designerEmail}:`, emailError);
        return null;
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter(r => r !== null).length;

    console.log(`Sent ${successCount} out of ${designers.length} notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Notifications sent to ${successCount} designer(s)`,
        totalDesigners: designers.length 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in send-task-notification function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
