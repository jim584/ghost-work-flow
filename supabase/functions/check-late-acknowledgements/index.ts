import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking for late acknowledgements...");

    const now = new Date().toISOString();

    // Find tasks that are:
    // - status = 'assigned' (not yet acknowledged)
    // - ack_deadline has passed
    // - late_acknowledgement = false (not yet flagged)
    const { data: lateTasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, title, task_number, project_manager_id, team_id, ack_deadline, developer_id")
      .eq("status", "assigned")
      .eq("late_acknowledgement", false)
      .not("ack_deadline", "is", null)
      .lt("ack_deadline", now);

    if (tasksError) throw tasksError;

    if (!lateTasks || lateTasks.length === 0) {
      console.log("No late acknowledgements found");
      return new Response(
        JSON.stringify({ success: true, message: "No late acknowledgements", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${lateTasks.length} tasks with late acknowledgement`);

    // Get all admin user IDs (Development Head)
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = admins?.map(a => a.user_id) || [];

    let notifiedCount = 0;

    for (const task of lateTasks) {
      // Flag the task as late acknowledgement
      await supabaseAdmin
        .from("tasks")
        .update({ late_acknowledgement: true })
        .eq("id", task.id);

      // Notify all admins (Development Head)
      for (const adminId of adminIds) {
        await supabaseAdmin.from("notifications").insert({
          user_id: adminId,
          type: "late_acknowledgement",
          title: "Late Acknowledgement Alert",
          message: `Task #${task.task_number} "${task.title}" was not acknowledged within 30 working minutes.`,
          task_id: task.id,
        });
      }

      // Notify the Project Manager
      if (task.project_manager_id && !adminIds.includes(task.project_manager_id)) {
        await supabaseAdmin.from("notifications").insert({
          user_id: task.project_manager_id,
          type: "late_acknowledgement",
          title: "Late Acknowledgement Alert",
          message: `Task #${task.task_number} "${task.title}" was not acknowledged within 30 working minutes.`,
          task_id: task.id,
        });
      }

      notifiedCount++;
      console.log(`Flagged and notified for task #${task.task_number}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Flagged ${notifiedCount} late acknowledgements`, count: notifiedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error checking late acknowledgements:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "Operation failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
