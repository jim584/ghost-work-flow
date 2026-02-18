import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  task_id: string | null;
}

export function NotificationBell({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const originalTitleRef = useRef<string>(document.title);
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio and request notification permission
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTgIGWi77eafTRAMUKfj8LZjHAY4kdfy');
    originalTitleRef.current = document.title;
    
    // Request desktop notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Desktop notification permission:', permission);
      });
    }
    
    return () => {
      // Cleanup title interval on unmount
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        document.title = originalTitleRef.current;
      }
    };
  }, []);

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log('Audio play failed:', err);
      });
    }
  };

  // Show desktop notification
  const showDesktopNotification = (title: string, message: string, type: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const icon = type === 'task_delayed' ? '⚠️' : type === 'revision_requested' ? '🔄' : '🆕';
      const notification = new Notification(title, {
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'design-portal-notification',
        requireInteraction: type === 'task_delayed', // Keep delayed task notifications visible
      });
      
      // Focus the tab when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      // Auto-close after 8 seconds (except delayed tasks)
      if (type !== 'task_delayed') {
        setTimeout(() => notification.close(), 8000);
      }
    }
  };

  // Flash browser tab title for attention
  const flashTabTitle = (message: string) => {
    // Clear any existing interval
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
    }
    
    let isOriginal = true;
    titleIntervalRef.current = setInterval(() => {
      document.title = isOriginal ? `🔔 ${message}` : originalTitleRef.current;
      isOriginal = !isOriginal;
    }, 1000);
    
    // Stop flashing after 10 seconds
    setTimeout(() => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
    }, 10000);
  };

  // Stop flashing when user focuses the tab
  useEffect(() => {
    const handleFocus = () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
        document.title = originalTitleRef.current;
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Fetch notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!userId,
  });

  // Play sound and show toasts for unread notifications on initial load
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    // Get unread notifications
    const unreadNotifications = notifications.filter(n => !n.is_read);
    
    if (unreadNotifications.length > 0) {
      console.log(`Found ${unreadNotifications.length} unread notification(s) on login`);
      
      // Play sound once for all unread notifications
      playNotificationSound();
      
      // Show toast for the most recent unread notification
      const mostRecent = unreadNotifications[0];
      toast({
        title: `🔔 ${mostRecent.title}`,
        description: unreadNotifications.length > 1 
          ? `${mostRecent.message} (and ${unreadNotifications.length - 1} more)`
          : mostRecent.message,
        className: mostRecent.type === 'task_delayed' 
          ? 'border-destructive bg-destructive/5' 
          : 'border-primary bg-primary/5',
        duration: 6000,
      });
    }
  }, [notifications?.length]); // Only run when notification count changes

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('🔔 New notification received:', payload);
          
          // Play sound
          playNotificationSound();
          
          // Show toast notification
          const notification = payload.new as Notification;
          toast({
            title: `🔔 ${notification.title}`,
            description: notification.message,
            className: notification.type === 'task_delayed' 
              ? 'border-destructive bg-destructive/5' 
              : 'border-primary bg-primary/5',
          });
          
          // Flash tab title if tab is not focused
          if (!document.hasFocus()) {
            flashTabTitle('New Notification!');
            // Show desktop notification when tab is not focused
            showDesktopNotification(notification.title, notification.message, notification.type);
          }
          
          // Refetch notifications when new one arrives
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
        }
      )
      .subscribe((status) => {
        console.log('Notification bell subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, toast]);

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Update favicon with badge
  const updateFaviconBadge = (count: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw original favicon
      ctx.drawImage(img, 0, 0, 32, 32);
      
      if (count > 0) {
        // Draw badge circle
        const badgeSize = count > 9 ? 18 : 14;
        const badgeX = 32 - badgeSize;
        const badgeY = 0;
        
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        
        // Draw count text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${count > 9 ? 10 : 11}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 99 ? '99+' : count.toString(), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);
      }
      
      // Update favicon
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'icon';
      link.href = canvas.toDataURL();
      document.head.appendChild(link);
    };
    img.src = '/favicon.ico';
  };

  // Update tab title and favicon with unread count
  useEffect(() => {
    if (unreadCount > 0 && !titleIntervalRef.current) {
      document.title = `(${unreadCount}) ${originalTitleRef.current}`;
    } else if (unreadCount === 0 && !titleIntervalRef.current) {
      document.title = originalTitleRef.current;
    }
    updateFaviconBadge(unreadCount);
  }, [unreadCount]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_task':
        return '🆕';
      case 'revision_requested':
        return '🔄';
      case 'task_delayed':
        return '⚠️';
      case 'file_uploaded':
        return '📤';
      case 'order_cancelled':
        return '❌';
      case 'nameserver_request':
        return '🖥️';
      case 'nameserver_ready':
        return '✅';
      case 'nameserver_confirmed':
        return '🚀';
      case 'dns_request':
        return '🌐';
      case 'dns_ready':
        return '✅';
      case 'dns_confirmed':
        return '🚀';
      case 'delegate_request':
        return '🔑';
      case 'delegate_confirmed':
        return '✅';
      case 'hosting_delegate_request':
        return '🔑';
      case 'hosting_delegate_confirmed':
        return '✅';
      case 'self_launch_link_request':
        return '🔗';
      case 'self_launch_completed':
        return '✅';
      case 'upsell_pending':
        return '💼';
      case 'upsell_completed':
        return '✅';
      case 'website_marked_live':
        return '🚀';
      default:
        return '📢';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-card z-50">
        <div className="flex items-center justify-between p-2">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={() => markAllAsReadMutation.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start p-3 cursor-pointer ${
                  !notification.is_read ? 'bg-primary/5' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-2 w-full">
                  <span className="text-lg flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
