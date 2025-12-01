import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
        (payload) => {
          console.log('🆕 New task notification received:', payload);
          playNotificationSound();
          toast({
            title: '🆕 New Task Assigned',
            description: `Task: ${payload.new.title}`,
          });
        }
      )
      .subscribe((status) => {
        console.log('Tasks channel subscription status:', status);
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
            toast({
              title: '🔄 Revision Requested',
              description: payload.new.revision_notes || 'Please check the task details',
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
        (payload) => {
          const deadline = new Date(payload.new.deadline);
          const now = new Date();
          const isDelayed = deadline < now && 
            (payload.new.status === 'pending' || payload.new.status === 'in_progress');
          
          if (isDelayed) {
            console.log('⚠️ Task delayed notification received:', payload);
            playNotificationSound();
            const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
            toast({
              title: '⚠️ Task Overdue',
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
