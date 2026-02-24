import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, Clock, FolderKanban, Trash2, Globe, User, Mail, Phone, DollarSign, Calendar, Users, Image, Palette, FileText, Eye, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FilePreview } from "@/components/FilePreview";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { CreateWebsiteOrderForm } from "./CreateWebsiteOrderForm";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays, isAfter, startOfWeek, startOfMonth } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FrontSalesDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState<"social_media" | "logo" | "website" | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch designer teams only (exclude developer-only teams) for logo/social media orders
  const { data: designerTeams } = useQuery({
    queryKey: ["designer-teams"],
    queryFn: async () => {
      const { data: designerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "designer");
      
      if (rolesError) throw rolesError;
      
      const designerUserIds = designerRoles?.map(r => r.user_id) || [];
      
      if (designerUserIds.length === 0) return [];
      
      const { data: designerTeamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("team_id")
        .in("user_id", designerUserIds);
      
      if (membersError) throw membersError;
      
      const designerTeamIds = [...new Set(designerTeamMembers?.map(m => m.team_id) || [])];
      
      if (designerTeamIds.length === 0) return [];
      
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .in("id", designerTeamIds);
      
      if (teamsError) throw teamsError;
      return teamsData;
    },
  });

  // Fetch developer profiles for website orders
  const { data: developerProfiles } = useQuery({
    queryKey: ["developer-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          team_id,
          user_id,
          profiles!team_members_user_id_profiles_fkey(id, full_name, email)
        `);
      if (error) throw error;
      return data;
    },
  });

  const getDeveloperForTeam = (teamId: string) => {
    const member = developerProfiles?.find(m => m.team_id === teamId);
    if (member?.profiles) {
      const profile = member.profiles as any;
      return profile.full_name || profile.email || "Unknown";
    }
    return null;
  };

  // Fetch my own orders (created by me, closed by me when transferred_by is different, OR transferred by me when closed_by is different)
  const { data: myTasks } = useQuery({
    queryKey: ["sales-tasks", user?.id],
    queryFn: async () => {
      // Get orders created by the user
      const { data: createdOrders, error: createdError } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (createdError) throw createdError;
      
      // Get orders closed by the user where transferred_by is different (and not null)
      const { data: closedOrders, error: closedError } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
        .eq("closed_by", user!.id)
        .not("transferred_by", "is", null)
        .neq("transferred_by", user!.id)
        .order("created_at", { ascending: false });
      if (closedError) throw closedError;
      
      // Get orders transferred by the user where closed_by is different (and not null)
      const { data: transferredOrders, error: transferredError } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
        .eq("transferred_by", user!.id)
        .not("closed_by", "is", null)
        .neq("closed_by", user!.id)
        .order("created_at", { ascending: false });
      if (transferredError) throw transferredError;
      
      // Merge and deduplicate by task id
      const taskMap = new Map<string, any>();
      createdOrders?.forEach(task => taskMap.set(task.id, task));
      closedOrders?.forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, task);
        }
      });
      transferredOrders?.forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, task);
        }
      });
      
      const data = Array.from(taskMap.values()).sort(
        (a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()
      );
      
      // Fetch creator, transferred_by, and closed_by profiles separately
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(task => {
          if (task.created_by) userIds.add(task.created_by);
          if (task.transferred_by) userIds.add(task.transferred_by);
          if (task.closed_by) userIds.add(task.closed_by);
        });
        
        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", Array.from(userIds));
          
          const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
          return data.map(task => ({
            ...task,
            creator: task.created_by ? profileMap.get(task.created_by) : null,
            transferred_by_profile: task.transferred_by ? profileMap.get(task.transferred_by) : null,
            closed_by_profile: task.closed_by ? profileMap.get(task.closed_by) : null,
          }));
        }
      }
      
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch sales target for the current user
  const { data: salesTarget } = useQuery({
    queryKey: ["sales-target", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("monthly_order_target, transferred_orders_count, closed_orders_count, closed_revenue")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Query for all tasks (used when searching) - can search all orders in the system
  const { data: allTasks } = useQuery({
    queryKey: ["all-tasks-search", searchQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Fetch creator, transferred_by, and closed_by profiles separately
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(task => {
          if (task.created_by) userIds.add(task.created_by);
          if (task.transferred_by) userIds.add(task.transferred_by);
          if (task.closed_by) userIds.add(task.closed_by);
        });
        
        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", Array.from(userIds));
          
          const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
          return data.map(task => ({
            ...task,
            creator: task.created_by ? profileMap.get(task.created_by) : null,
            transferred_by_profile: task.transferred_by ? profileMap.get(task.transferred_by) : null,
            closed_by_profile: task.closed_by ? profileMap.get(task.closed_by) : null,
          }));
        }
      }
      
      return data;
    },
    enabled: !!searchQuery.trim(),
  });

  const tasks = searchQuery.trim() ? allTasks : myTasks;

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tasks"] });
      toast({ title: "Task deleted successfully" });
      setDeleteTaskId(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error deleting task",
        description: error.message,
      });
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-muted text-muted-foreground";
      case "in_progress":
        return "bg-warning text-warning-foreground";
      case "completed":
        return "bg-primary text-primary-foreground";
      case "approved":
        return "bg-success text-success-foreground";
      case "cancelled":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("design-files")
        .download(filePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download started" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error downloading file",
        description: error.message,
      });
    }
  };

  const isLogoOrder = (task: any) => task?.post_type === "Logo Design";
  const isWebsiteOrder = (task: any) => task?.post_type === "Website Design";

  const threeDaysAgo = subDays(new Date(), 3);

  const filteredTasks = tasks?.filter((task) => {
    // Filter by 3 days from creation date only (for My Orders section)
    const isWithin3Days = task.created_at && isAfter(new Date(task.created_at), threeDaysAgo);
    const passesTimeFilter = isWithin3Days;
    
    // When searching, don't apply the time filter (allow searching all orders)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
      
      if (orderTypeFilter) {
        const matchesOrderType = 
          (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
          (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
          (orderTypeFilter === 'website' && task.post_type === 'Website Design');
        return matchesSearch && matchesOrderType;
      }
      return matchesSearch;
    }
    
    // Apply time filter only when not searching
    if (!passesTimeFilter) return false;
    
    if (orderTypeFilter) {
      const matchesOrderType = 
        (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
        (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
        (orderTypeFilter === 'website' && task.post_type === 'Website Design');
      if (!matchesOrderType) return false;
    }
    
    return true;
  }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());

  const getOrderTypeIcon = (task: any) => {
    if (isWebsiteOrder(task)) return <Globe className="h-5 w-5 text-blue-500" />;
    if (isLogoOrder(task)) return <Palette className="h-5 w-5 text-purple-500" />;
    return <Image className="h-5 w-5 text-pink-500" />;
  };

  const getOrderTypeBadge = (task: any) => {
    if (isWebsiteOrder(task)) return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Website</Badge>;
    if (isLogoOrder(task)) return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">Logo</Badge>;
    return <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-200">Social Media</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Sales'}</h1>
            <p className="text-sm text-muted-foreground">Front Sales Dashboard</p>
          </div>
          <Button onClick={signOut} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Summary Cards */}
        {(() => {
          const now = new Date();
          const weekStart = startOfWeek(now, { weekStartsOn: 1 });
          const monthStart = startOfMonth(now);
          
          // Group tasks to get unique orders (same order can be assigned to multiple teams)
          const getUniqueOrders = (tasks: typeof myTasks) => {
            if (!tasks) return [];
            const seen = new Set<string>();
            return tasks.filter(task => {
              const key = `${task.customer_name || task.business_name || ''}_${task.title}_${task.deadline || ''}_${task.post_type || ''}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          };
          
          const uniqueOrders = getUniqueOrders(myTasks);
          const totalOrders = uniqueOrders.length;
          
          const closedRevenue = salesTarget?.closed_revenue ?? 0;
          const totalAchieved = (salesTarget?.transferred_orders_count ?? 0) + (salesTarget?.closed_orders_count ?? 0);
          
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Target</p>
                      <p className="text-2xl font-bold">{salesTarget?.monthly_order_target ?? 10}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Achieved</p>
                      <p className="text-2xl font-bold text-primary">{totalAchieved}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Users className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Transferred</p>
                      <p className="text-2xl font-bold">{salesTarget?.transferred_orders_count ?? 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <Users className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Closed</p>
                      <p className="text-2xl font-bold">{salesTarget?.closed_orders_count ?? 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <DollarSign className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">My Revenue</p>
                      <p className="text-2xl font-bold">${Number(closedRevenue).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search by task #, title, business name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <div className="flex justify-end items-center mb-4">
          <div className="flex gap-2">
            <Button
              variant={!orderTypeFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter(null)}
            >
              All Types
            </Button>
            <Button
              variant={orderTypeFilter === 'logo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('logo')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Logo
            </Button>
            <Button
              variant={orderTypeFilter === 'social_media' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('social_media')}
            >
              <FolderKanban className="h-4 w-4 mr-1" />
              Social Media
            </Button>
            <Button
              variant={orderTypeFilter === 'website' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('website')}
            >
              <Globe className="h-4 w-4 mr-1" />
              Website
            </Button>
          </div>
        </div>


        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Orders</CardTitle>
            <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) setTaskType(null);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                {!taskType ? (
                  <div className="space-y-4">
                    <DialogHeader>
                      <DialogTitle>Select Order Type</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-4">
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("social_media")}
                      >
                        <FolderKanban className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Social Media Post</p>
                          <p className="text-xs text-muted-foreground">Create social media content</p>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("logo")}
                      >
                        <FileText className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Logo Order</p>
                          <p className="text-xs text-muted-foreground">Create logo design order</p>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("website")}
                      >
                        <Globe className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Website Order</p>
                          <p className="text-xs text-muted-foreground">Create website design order</p>
                        </div>
                      </Button>
                    </div>
                  </div>
                ) : taskType === "social_media" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Social Media Post Request</DialogTitle>
                    </DialogHeader>
                    <CreateTaskForm 
                      userId={user!.id} 
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                ) : taskType === "logo" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Logo Order</DialogTitle>
                    </DialogHeader>
                    <CreateLogoOrderForm 
                      userId={user!.id} 
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Website Order</DialogTitle>
                    </DialogHeader>
                    <CreateWebsiteOrderForm 
                      userId={user!.id} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(() => {
                // Group orders by customer name + title + deadline (same order assigned to multiple teams)
                const groupedOrders = filteredTasks?.reduce((acc, task) => {
                  const groupKey = `${task.customer_name || task.business_name || ''}_${task.title}_${task.deadline || ''}_${task.post_type || ''}`;
                  
                  if (!acc[groupKey]) {
                    acc[groupKey] = {
                      ...task,
                      groupKey,
                      tasks: [task],
                      teams: [(task as any).teams?.name || 'Unknown'],
                      teamCount: 1,
                      statuses: [task.status],
                      taskNumbers: [task.task_number],
                    };
                  } else {
                    acc[groupKey].tasks.push(task);
                    acc[groupKey].teams.push((task as any).teams?.name || 'Unknown');
                    acc[groupKey].teamCount += 1;
                    acc[groupKey].statuses.push(task.status);
                    acc[groupKey].taskNumbers.push(task.task_number);
                  }
                  return acc;
                }, {} as Record<string, any>) || {};
                
                const groupedOrdersList = Object.values(groupedOrders);

                const getOverallStatus = (statuses: string[]) => {
                  if (statuses.includes('pending')) return 'pending';
                  if (statuses.includes('in_progress')) return 'in_progress';
                  if (statuses.includes('completed')) return 'completed';
                  if (statuses.includes('approved')) return 'approved';
                  return statuses[0];
                };

                const toggleGroup = (groupKey: string) => {
                  setExpandedGroups(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(groupKey)) {
                      newSet.delete(groupKey);
                    } else {
                      newSet.add(groupKey);
                    }
                    return newSet;
                  });
                };

                if (groupedOrdersList.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No orders found</p>
                      <p className="text-sm">Create your first order to get started</p>
                    </div>
                  );
                }

                return groupedOrdersList.map((group: any) => {
                  const isMultiTeam = group.teamCount > 1;
                  const primaryTask = group.tasks[0];
                  const isDelayed = primaryTask.deadline && new Date(primaryTask.deadline) < today && !['completed', 'approved'].includes(getOverallStatus(group.statuses));
                  const isExpanded = expandedGroups.has(group.groupKey);

                  const getBorderClass = () => {
                    if (isDelayed) return 'border-l-4 border-l-red-500 bg-red-50/10';
                    const overallStatus = getOverallStatus(group.statuses);
                    if (overallStatus === 'completed' || overallStatus === 'approved') return 'border-l-4 border-l-green-500 bg-green-50/10';
                    if (group.statuses.includes('cancelled')) return 'border-l-4 border-l-gray-500 bg-gray-50/10 opacity-75';
                    return '';
                  };

                  const getCategoryBadge = () => {
                    const overallStatus = getOverallStatus(group.statuses);
                    if (overallStatus === 'completed' || overallStatus === 'approved') {
                      return <Badge className="bg-green-500 text-white">Delivered</Badge>;
                    }
                    if (group.statuses.includes('cancelled')) {
                      return <Badge className="bg-gray-500 text-white">Cancelled</Badge>;
                    }
                    return null;
                  };

                  const getDelayedBadge = () => {
                    if (!isDelayed || !primaryTask.deadline) return null;
                    const now = new Date();
                    const hours = Math.floor((now.getTime() - new Date(primaryTask.deadline).getTime()) / (1000 * 60 * 60));
                    return <Badge className="bg-red-500 text-white">DELAYED — {hours} hour{hours !== 1 ? 's' : ''} overdue</Badge>;
                  };

                  return (
                    <div 
                      key={group.groupKey} 
                      className={`group border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in ${getBorderClass()}`}
                    >
                      {/* Card Header */}
                      <div className="p-4 bg-gradient-to-r from-muted/30 to-transparent border-b">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-background shadow-sm">
                              {getOrderTypeIcon(primaryTask)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                  {isMultiTeam 
                                    ? `#${group.taskNumbers.join(', #')}` 
                                    : `#${primaryTask.task_number}`}
                                </span>
                                {getOrderTypeBadge(primaryTask)}
                                {isMultiTeam && (
                                  <Badge variant="outline" className="text-xs">
                                    <Users className="h-3 w-3 mr-1" />
                                    {group.teamCount} teams
                                  </Badge>
                                )}
                                {getCategoryBadge()}
                                {getDelayedBadge()}
                              </div>
                              <h3 className="font-semibold text-lg mt-1 truncate">{primaryTask.title}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={`${getStatusColor(getOverallStatus(group.statuses))} shadow-sm`}>
                              {getOverallStatus(group.statuses).replace("_", " ")}
                            </Badge>
                            {!isMultiTeam && primaryTask.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-destructive/10"
                                onClick={() => setDeleteTaskId(primaryTask.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-4">
                        {primaryTask.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{primaryTask.description}</p>
                        )}

                        {/* Info Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {/* Customer Info */}
                          {(primaryTask.customer_name || primaryTask.customer_email || primaryTask.customer_phone) && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <User className="h-3.5 w-3.5" />
                                Customer
                              </div>
                              <div className="space-y-1">
                                {primaryTask.customer_name && (
                                  <p className="text-sm font-medium truncate">{primaryTask.customer_name}</p>
                                )}
                                {primaryTask.customer_email && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    <span className="truncate">{primaryTask.customer_email}</span>
                                  </div>
                                )}
                                {primaryTask.customer_phone && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3" />
                                    <span>{primaryTask.customer_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Payment Info - PM style inline format */}
                          {(primaryTask.amount_total || primaryTask.amount_paid || primaryTask.amount_pending) && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <DollarSign className="h-3.5 w-3.5" />
                                Payment
                              </div>
                              <div className="space-y-1">
                                {primaryTask.amount_total != null && (
                                  <p className="text-sm font-semibold">${Number(primaryTask.amount_total).toFixed(2)}</p>
                                )}
                                <div className="flex items-center gap-3 text-xs">
                                  {primaryTask.amount_paid != null && (
                                    <span className="text-green-600 font-medium">
                                      ✓ ${Number(primaryTask.amount_paid).toFixed(2)} paid
                                    </span>
                                  )}
                                  {primaryTask.amount_pending != null && Number(primaryTask.amount_pending) > 0 && (
                                    <span className="text-orange-600 font-medium">
                                      ○ ${Number(primaryTask.amount_pending).toFixed(2)} pending
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Assignment Info - with per-team status indicators */}
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <Users className="h-3.5 w-3.5" />
                              Assignment
                            </div>
                            <div className="space-y-1">
                              {isMultiTeam ? (
                                <>
                                  <p className="text-sm font-medium">{group.teamCount} teams assigned</p>
                                  <div className="space-y-1 mt-1">
                                    {group.tasks.map((task: any) => {
                                      let statusIcon = "○";
                                      let statusColor = "text-muted-foreground";
                                      let statusText = "Pending";
                                      
                                      if (task.status === 'cancelled') {
                                        statusIcon = "✕";
                                        statusColor = "text-destructive";
                                        statusText = "Cancelled";
                                      } else if (task.status === 'approved') {
                                        statusIcon = "✓";
                                        statusColor = "text-green-600";
                                        statusText = "Approved";
                                      } else if (task.status === 'completed') {
                                        statusIcon = "●";
                                        statusColor = "text-blue-500";
                                        statusText = "Delivered";
                                      } else if (task.status === 'in_progress') {
                                        statusIcon = "◉";
                                        statusColor = "text-yellow-500";
                                        statusText = "Working";
                                      }
                                      
                                      return (
                                        <div key={task.id} className="flex items-center justify-between text-xs">
                                          <span className="truncate">{(task.teams as any)?.name || "Unknown"}</span>
                                          <span className={`${statusColor} font-medium`}>
                                            {statusIcon} {statusText}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              ) : isWebsiteOrder(primaryTask) ? (
                                <p className="text-sm font-medium">{getDeveloperForTeam(primaryTask.team_id) || "Unassigned"}</p>
                              ) : (
                                <p className="text-sm font-medium">{(primaryTask.teams as any)?.name || "Unassigned"}</p>
                              )}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{format(new Date(primaryTask.created_at!), "MMM d, yyyy")}</span>
                              </div>
                              {primaryTask.deadline && (
                                <div className={`flex items-center gap-1.5 text-xs ${isDelayed ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                  <Clock className="h-3 w-3" />
                                  <span>Due: {format(new Date(primaryTask.deadline), "MMM d, yyyy")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Attachments */}
                        {primaryTask.attachment_file_path && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground mb-2">
                              Attachments ({primaryTask.attachment_file_path.split('|||').length})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {primaryTask.attachment_file_path.split('|||').slice(0, 3).map((filePath: string, index: number) => {
                                const fileName = primaryTask.attachment_file_name?.split('|||')[index] || `attachment_${index + 1}`;
                                return (
                                  <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors">
                                    <FilePreview 
                                      filePath={filePath.trim()}
                                      fileName={fileName.trim()}
                                      className="w-8 h-8"
                                    />
                                    <span className="text-xs max-w-[100px] truncate">{fileName.trim()}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                              {primaryTask.attachment_file_path.split('|||').length > 3 && (
                                <span className="text-xs text-muted-foreground self-center">
                                  +{primaryTask.attachment_file_path.split('|||').length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}


                      </div>

                      {/* Card Footer - PM style */}
                      <div className="px-4 py-3 bg-muted/20 border-t flex items-center justify-between gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewDetailsTask(primaryTask)}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          View Details
                        </Button>
                        {primaryTask.status === "cancelled" && primaryTask.cancellation_reason && (
                          <p className="text-xs text-muted-foreground italic">
                            Reason: {primaryTask.cancellation_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsTask} onOpenChange={(open) => !open && setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Order Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-4" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {viewDetailsTask && (
              <div className="space-y-6">
                {/* Customer Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Customer Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Customer Name</Label>
                      <p className="font-medium">{viewDetailsTask.customer_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Customer Email</Label>
                      <p className="font-medium">{viewDetailsTask.customer_email || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Customer Phone</Label>
                      <p className="font-medium">{viewDetailsTask.customer_phone || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Customer Domain</Label>
                      <p className="font-medium text-primary break-all">{viewDetailsTask.customer_domain || "N/A"}</p>
                    </div>
                  </div>
                </div>

                {/* Payment Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Payment Information</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Total Amount</Label>
                      <p className="font-medium">${Number(viewDetailsTask.amount_total || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Amount Paid</Label>
                      <p className="font-medium text-green-600">${Number(viewDetailsTask.amount_paid || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Amount Pending</Label>
                      <p className="font-medium text-amber-600">${Number(viewDetailsTask.amount_pending || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Basic Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Title</Label>
                      <p className="font-medium">{viewDetailsTask.title}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Business Name</Label>
                      <p className="font-medium">{viewDetailsTask.business_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Industry</Label>
                      <p className="font-medium">{viewDetailsTask.industry || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Website</Label>
                      <p className="font-medium text-primary break-all">{viewDetailsTask.website_url || "N/A"}</p>
                    </div>
                    {isWebsiteOrder(viewDetailsTask) && (
                      <>
                        <div>
                          <Label className="text-muted-foreground">Business Email</Label>
                          <p className="font-medium">{viewDetailsTask.business_email || "N/A"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Business Phone</Label>
                          <p className="font-medium">{viewDetailsTask.business_phone || "N/A"}</p>
                        </div>
                      </>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Deadline</Label>
                      <p className="font-medium">{viewDetailsTask.deadline ? new Date(viewDetailsTask.deadline).toLocaleDateString() : "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">
                        {isWebsiteOrder(viewDetailsTask) ? "Assigned Developer" : "Team"}
                      </Label>
                      <p className="font-medium">
                        {isWebsiteOrder(viewDetailsTask) 
                          ? (getDeveloperForTeam(viewDetailsTask.team_id) || viewDetailsTask.teams?.name)
                          : (() => {
                              const groupKey = `${viewDetailsTask.customer_name || viewDetailsTask.business_name || ''}_${viewDetailsTask.title}_${viewDetailsTask.deadline || ''}_${viewDetailsTask.post_type || ''}`;
                              const relatedTasks = myTasks?.filter(t => {
                                const taskKey = `${t.customer_name || t.business_name || ''}_${t.title}_${t.deadline || ''}_${t.post_type || ''}`;
                                return taskKey === groupKey;
                              }) || [];
                              const teamNames = [...new Set(relatedTasks.map(t => (t as any).teams?.name).filter(Boolean))];
                              return teamNames.length > 1 ? teamNames.join(", ") : (viewDetailsTask.teams as any)?.name || "Unassigned";
                            })()
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cancellation/Deletion Details */}
                {viewDetailsTask.status === "cancelled" && (
                  <div className="space-y-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <h3 className="font-semibold text-lg text-destructive">{(viewDetailsTask as any)?.is_deleted ? 'Deletion' : 'Cancellation'} Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">{(viewDetailsTask as any)?.is_deleted ? 'Deleted' : 'Cancelled'} At</Label>
                        <p className="font-medium">{(viewDetailsTask as any)?.cancelled_at ? new Date((viewDetailsTask as any).cancelled_at).toLocaleString() : "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <Badge className="bg-destructive text-destructive-foreground">{(viewDetailsTask as any)?.is_deleted ? 'Deleted' : 'Cancelled'}</Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Reason</Label>
                      <p className="font-medium whitespace-pre-wrap">{(viewDetailsTask as any)?.cancellation_reason || "No reason provided"}</p>
                    </div>
                  </div>
                )}

                {/* Order Attribution */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Order Attribution</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Assigned PM</Label>
                      <p className="font-medium">{(viewDetailsTask.project_manager as any)?.full_name || (viewDetailsTask.project_manager as any)?.email || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Transferred By</Label>
                      <p className="font-medium">{(viewDetailsTask as any)?.transferred_by_profile?.full_name || (viewDetailsTask as any)?.transferred_by_profile?.email || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Closed By</Label>
                      <p className="font-medium">{(viewDetailsTask as any)?.closed_by_profile?.full_name || (viewDetailsTask as any)?.closed_by_profile?.email || "N/A"}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Created by: {(viewDetailsTask as any)?.creator?.full_name || (viewDetailsTask as any)?.creator?.email || "N/A"}
                  </p>
                </div>

                {/* Logo Details */}
                {isLogoOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Logo Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Look & Feel</Label>
                        <p className="font-medium">{viewDetailsTask.logo_style || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Color Combination</Label>
                        <p className="font-medium">{viewDetailsTask.brand_colors || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Primary Focus</Label>
                      <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.description || "N/A"}</p>
                    </div>
                  </div>
                )}

                {/* Website Details */}
                {isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Website Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Number of Pages</Label>
                        <p className="font-medium">{viewDetailsTask.number_of_pages || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Video Keywords</Label>
                        <p className="font-medium">{viewDetailsTask.video_keywords || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Supporting Text</Label>
                      <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.supporting_text || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Design References</Label>
                      <p className="font-medium">{viewDetailsTask.design_references || "N/A"}</p>
                    </div>
                    {/* Logo Files for Website Orders */}
                    {viewDetailsTask.logo_url && (
                      <div className="space-y-3">
                        <Label className="text-muted-foreground">Logo Files</Label>
                        <div className="space-y-3">
                          {viewDetailsTask.logo_url.split('|||').map((filePath: string, index: number) => {
                            const fileName = filePath.split('/').pop() || `logo_${index + 1}`;
                            return (
                              <div key={index} className="p-3 bg-muted/30 rounded">
                                <FilePreview 
                                  filePath={filePath.trim()}
                                  fileName={fileName.trim()}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 w-full"
                                  onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                >
                                  <Download className="h-3 w-3 mr-2" />
                                  Download {fileName.trim()}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Post Details - Social Media */}
                {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Post Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Post Type</Label>
                        <p className="font-medium">{viewDetailsTask.post_type || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Objective</Label>
                        <p className="font-medium">{viewDetailsTask.objective || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Post Type Required</Label>
                        <p className="font-medium">{viewDetailsTask.post_type_required || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Platforms</Label>
                        <p className="font-medium">{viewDetailsTask.platforms?.join(", ") || "N/A"}</p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Description</Label>
                      <p className="font-medium">{viewDetailsTask.description || "N/A"}</p>
                    </div>
                  </div>
                )}

                {/* Product/Service Information - Social Media */}
                {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Product/Service Information</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground">Name</Label>
                        <p className="font-medium">{viewDetailsTask.product_service_name || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Description</Label>
                        <p className="font-medium">{viewDetailsTask.product_service_description || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Pricing</Label>
                        <p className="font-medium">{viewDetailsTask.pricing || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Design Requirements - Social Media */}
                {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Design Requirements</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground">Design Style</Label>
                        <p className="font-medium">{viewDetailsTask.design_style || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Brand Colors</Label>
                        <p className="font-medium">{viewDetailsTask.brand_colors || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Fonts</Label>
                        <p className="font-medium">{viewDetailsTask.fonts || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Content - Social Media */}
                {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Content</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground">Headline/Main Text</Label>
                        <p className="font-medium">{viewDetailsTask.headline_main_text || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Supporting Text</Label>
                        <p className="font-medium">{viewDetailsTask.supporting_text || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Call to Action</Label>
                        <p className="font-medium">{viewDetailsTask.cta || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Audience - Social Media */}
                {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Target Audience</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground">Age</Label>
                        <p className="font-medium">{viewDetailsTask.target_audience_age || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <p className="font-medium">{viewDetailsTask.target_audience_location || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Interests</Label>
                        <p className="font-medium">{viewDetailsTask.target_audience_interest || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Other</Label>
                        <p className="font-medium">{viewDetailsTask.target_audience_other || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Notes */}
                {(viewDetailsTask.notes_extra_instructions || viewDetailsTask.additional_details) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Additional Notes</h3>
                    <div className="space-y-3">
                      {viewDetailsTask.notes_extra_instructions && (
                        <div>
                          <Label className="text-muted-foreground">Extra Instructions</Label>
                          <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
                        </div>
                      )}
                      {viewDetailsTask.additional_details && (
                        <div>
                          <Label className="text-muted-foreground">Additional Details</Label>
                          <p className="font-medium">{viewDetailsTask.additional_details}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Attachments */}
                {viewDetailsTask.attachment_file_path && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Task Attachments</h3>
                    <div className="space-y-3">
                      {viewDetailsTask.attachment_file_path.split('|||').map((filePath: string, index: number) => {
                        const fileName = viewDetailsTask.attachment_file_name?.split('|||')[index] || `attachment_${index + 1}`;
                        return (
                          <div key={index} className="p-3 bg-muted/30 rounded">
                            <FilePreview 
                              filePath={filePath.trim()}
                              fileName={fileName.trim()}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full"
                              onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                            >
                              <Download className="h-3 w-3 mr-2" />
                              Download {fileName.trim()}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTaskId && deleteTask.mutate(deleteTaskId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FrontSalesDashboard;