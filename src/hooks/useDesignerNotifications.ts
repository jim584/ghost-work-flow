import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const createNotification = async (userId: string, type: string, title: string, message: string, taskId: string | null = null) => {
  try {
    console.log('Creating notification:', { userId, type, title, message, taskId });
    const { data, error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      task_id: taskId,
    }).select();
    
    if (error) {
      console.error('Failed to create notification - error:', error);
      throw error;
    }
    
    console.log('Notification created successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to create notification - exception:', error);
  }
};

export const useDesignerNotifications = (userId: string | undefined, userTeams: string[]) => {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!userId || userTeams.length === 0) {
      console.log('Notifications not initialized:', { userId, userTeamsLength: userTeams.length });
      return;
    }

    console.log('Initializing designer notifications for teams:', userTeams);

    // Initialize audio for notifications (using a simple beep sound)
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTgIGWi77eafTRAMUKfj8LZjHAY4kdfy');

    // Subscribe to new tasks
    const tasksChannel = supabase
      .channel('designer-tasks')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `team_id=in.(${userTeams.join(',')})`,
        },
        async (payload) => {
          console.log('🆕 New task notification received:', payload);
          playNotificationSound();
          
          // Create notification in database
          if (userId) {
            await createNotification(
              userId,
              'new_task',
              'New Task Assigned',
              `Task: ${payload.new.title}`,
              payload.new.id
            );
          }
          
          toast({
            title: '🔔 New Task Assigned',
            description: `Task: ${payload.new.title}`,
            className: "border-primary bg-primary/5",
          });
        }
      )
      .subscribe((status, error) => {
        console.log('Tasks channel subscription status:', status, 'error:', error);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to new task notifications');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel error:', error);
        }
      });

    // Subscribe to design submissions for revision requests
    const submissionsChannel = supabase
      .channel('designer-submissions')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'design_submissions',
          filter: `designer_id=eq.${userId}`,
        },
        (payload) => {
          console.log('🔄 Submission update received:', payload);
          if (payload.new.revision_status === 'revision_requested') {
            playNotificationSound();
            
            // Create notification in database (async in background)
            if (userId) {
              createNotification(
                userId,
                'revision_requested',
                'Revision Requested',
                payload.new.revision_notes || 'Please check the task details',
                payload.new.task_id
              );
            }
            
            toast({
              title: '🔔 Revision Requested',
              description: payload.new.revision_notes || 'Please check the task details',
              className: "border-warning bg-warning/5",
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Submissions channel subscription status:', status);
      });

    // Subscribe to task updates for delayed tasks
    const delayedTasksChannel = supabase
      .channel('delayed-tasks')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `team_id=in.(${userTeams.join(',')})`,
        },
        async (payload) => {
          const deadline = new Date(payload.new.deadline);
          const now = new Date();
          const isDelayed = deadline < now && 
            (payload.new.status === 'pending' || payload.new.status === 'in_progress');
          
          if (isDelayed) {
            console.log('⚠️ Task delayed notification received:', payload);
            playNotificationSound();
            const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
            
            // Create notification in database
            if (userId) {
              await createNotification(
                userId,
                'task_delayed',
                'Task Overdue - URGENT',
                `${payload.new.title} is ${daysOverdue} day(s) overdue`,
                payload.new.id
              );
            }
            
            toast({
              title: '🔔 Task Overdue - URGENT',
              description: `${payload.new.title} is ${daysOverdue} day(s) overdue`,
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Delayed tasks channel subscription status:', status);
      });

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(delayedTasksChannel);
    };
  }, [userId, userTeams, toast]);

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log('Audio play failed:', err);
      });
    }
  };
};
