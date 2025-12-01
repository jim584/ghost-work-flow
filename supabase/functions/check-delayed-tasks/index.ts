import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking for delayed tasks...");

    // Get all tasks that are past deadline and not completed/approved
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: delayedTasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, title, deadline, team_id, teams(name)")
      .lt("deadline", today.toISOString())
      .in("status", ["pending", "in_progress"]);

    if (tasksError) throw tasksError;

    if (!delayedTasks || delayedTasks.length === 0) {
      console.log("No delayed tasks found");
      return new Response(
        JSON.stringify({ success: true, message: "No delayed tasks found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${delayedTasks.length} delayed tasks`);

    // Check which tasks have already been notified today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todayNotifications, error: notifError } = await supabaseAdmin
      .from("task_delay_notifications")
      .select("task_id")
      .gte("notification_sent_at", startOfDay.toISOString());

    if (notifError) throw notifError;

    const notifiedTaskIds = new Set(todayNotifications?.map(n => n.task_id) || []);

    // Filter tasks that haven't been notified today
    const tasksToNotify = delayedTasks.filter(task => !notifiedTaskIds.has(task.id));

    if (tasksToNotify.length === 0) {
      console.log("All delayed tasks have already been notified today");
      return new Response(
        JSON.stringify({ success: true, message: "All delayed tasks already notified" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Sending notifications for ${tasksToNotify.length} delayed tasks`);

    let totalEmailsSent = 0;

    // Process each delayed task
    for (const task of tasksToNotify) {
      try {
        // Get team name
        const { data: team } = await supabaseAdmin
          .from("teams")
          .select("name")
          .eq("id", task.team_id)
          .single();

        const teamName = team?.name || "Your Team";

        // Get designers from the team
        const { data: teamMembers, error: teamError } = await supabaseAdmin
          .from("team_members")
          .select("user_id, profiles(email, full_name)")
          .eq("team_id", task.team_id);

        if (teamError || !teamMembers || teamMembers.length === 0) {
          console.log(`No designers found for task ${task.id}`);
          continue;
        }

        // Calculate how many days overdue
        const daysOverdue = Math.floor((today.getTime() - new Date(task.deadline!).getTime()) / (1000 * 60 * 60 * 24));

        // Get designer user IDs who have the designer role
        const { data: designerRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "designer")
          .in("user_id", teamMembers.map(m => m.user_id));

        const designerUserIds = new Set(designerRoles?.map(r => r.user_id) || []);

        // Create in-app notifications for all designers
        for (const member of teamMembers) {
          if (designerUserIds.has(member.user_id)) {
            try {
              await supabaseAdmin
                .from("notifications")
                .insert({
                  user_id: member.user_id,
                  type: "task_delayed",
                  title: "Task Overdue - URGENT",
                  message: `${task.title} is ${daysOverdue} day(s) overdue`,
                  task_id: task.id,
                });
              console.log(`Created in-app notification for user ${member.user_id}`);
            } catch (notifError) {
              console.error(`Failed to create in-app notification:`, notifError);
            }
          }
        }

        // Send email to each designer
        for (const member of teamMembers) {
          const designerEmail = (member as any).profiles?.email;
          const designerName = (member as any).profiles?.full_name || designerEmail;

          if (!designerEmail) continue;

          const subject = `🚨 URGENT: Task Overdue - ${task.title}`;
          const htmlContent = `
            <h2 style="color: #dc2626;">⚠️ Task Overdue Alert</h2>
            <p>Hello ${designerName},</p>
            <p>This is an urgent reminder that the following task assigned to <strong>${teamName}</strong> is now overdue:</p>
            <div style="margin: 20px 0; padding: 15px; background-color: #fee2e2; border-left: 4px solid #dc2626;">
              <h3 style="margin-top: 0; color: #dc2626;">${task.title}</h3>
              <p style="margin: 10px 0;"><strong>Original Deadline:</strong> ${new Date(task.deadline!).toLocaleDateString()}</p>
              <p style="margin: 10px 0; color: #dc2626;"><strong>Days Overdue:</strong> ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}</p>
            </div>
            <p><strong>Action Required:</strong> Please log in to your dashboard immediately to complete this task or provide a status update.</p>
            <p>If you're experiencing any issues or need assistance, please contact your project manager as soon as possible.</p>
            <p>Best regards,<br>Task Management System</p>
          `;

          try {
            await resend.emails.send({
              from: "Task Manager <onboarding@resend.dev>",
              to: [designerEmail],
              subject: subject,
              html: htmlContent,
            });

            totalEmailsSent++;
            console.log(`Delay notification sent to ${designerEmail} for task ${task.title}`);
          } catch (emailError) {
            console.error(`Failed to send email to ${designerEmail}:`, emailError);
          }
        }

        // Record that we sent notification for this task
        const { error: insertError } = await supabaseAdmin
          .from("task_delay_notifications")
          .insert({
            task_id: task.id,
            notification_sent_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Failed to record notification for task ${task.id}:`, insertError);
        }
      } catch (taskError) {
        console.error(`Error processing task ${task.id}:`, taskError);
      }
    }

    console.log(`Successfully sent ${totalEmailsSent} delay notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${totalEmailsSent} delay notifications for ${tasksToNotify.length} tasks`,
        delayedTasksCount: delayedTasks.length,
        notifiedCount: tasksToNotify.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error in check-delayed-tasks function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
